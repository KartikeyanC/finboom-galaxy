import { useCallback, useEffect, useMemo, useRef } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useAccess } from "@/contexts/AccessContext";
import { useTenantSetting } from "@/hooks/useTenantSetting";
import { notifyError } from "@/lib/errorMessages";
import {
  ONBOARDING_STEPS,
  buildSamplePlan,
  completedCount,
  deriveSteps,
  isComplete,
  sampleIdsFor,
  shouldShowChecklist,
  type DerivedStep,
  type OnboardingStepId,
  type SampleRecord,
} from "@/lib/onboarding";

/**
 * Stage 5.3 — the checklist's data layer.
 *
 * Three things live here and nowhere else: counting the workspace's real rows,
 * loading the sample workspace, and removing it again.
 *
 * ⚠️ **Removal deletes by recorded primary key only.** The sample rows carry a
 * visible `Sample · ` prefix, but the prefix is a label for the human reading
 * the ledger — it is NEVER a delete filter. Matching on it would delete a row
 * the user typed themselves that happens to start with that word, and a
 * feature that quietly eats real transactions is far worse than one that
 * leaves a demo row behind.
 */

type Counts = Partial<Record<OnboardingStepId, number | null>>;

/**
 * Rows in one table that the sample loader did NOT create.
 *
 * `head: true` so nothing but the count crosses the wire — this runs on the
 * dashboard, and the whole point of the count is to avoid pulling the ledger.
 */
async function countReal(
  table: "transactions" | "budgets" | "goals",
  tenantId: string,
  excludeIds: string[],
): Promise<number> {
  let q = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (excludeIds.length) q = q.not("id", "in", `(${excludeIds.join(",")})`);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export type OnboardingApi = {
  /** Render the checklist? False for viewers and for a finished workspace. */
  show: boolean;
  steps: DerivedStep[];
  done: number;
  total: number;
  complete: boolean;
  loading: boolean;
  sample: SampleRecord | null;
  /** Owner or admin — a viewer can create none of this. */
  canManage: boolean;
  loadSample: () => void;
  removeSample: () => void;
  sampleBusy: boolean;
  dismiss: () => void;
};

export function useOnboarding(): OnboardingApi {
  const { user } = useAuth();
  const { currentTenantId, role } = useTenant();
  const { canAccess } = useAccess();
  const qc = useQueryClient();
  const { value, setValue, loading: settingLoading } = useTenantSetting("onboarding");
  const { value: baseCurrency } = useTenantSetting("base_currency");

  const canManage = role === "owner" || role === "admin";
  const sample = value.sample;
  const active = value.status === "active";

  // Sample ids are part of the key: loading or removing the sample changes
  // what "a real row" means, so a cached count from before is wrong.
  const sampleKey = sample ? `${sample.transactions.length}:${sample.at}` : "none";

  const countsQuery = useQuery({
    queryKey: ["onboarding-counts", currentTenantId, sampleKey],
    // Only while the checklist can still be shown. A finished or dismissed
    // workspace pays nothing for this feature ever again.
    enabled: !!user && !!currentTenantId && canManage && active && !settingLoading,
    staleTime: 60_000,
    // Loading the sample changes the key (the exclusion list moved), and
    // without this the whole card vanishes and reappears a second later —
    // observed in testing, and it reads as the button having broken something.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Counts> => {
      const tid = currentTenantId as string;
      const entries = await Promise.all(
        ONBOARDING_STEPS.map(async (s) => {
          const n = await countReal(s.table, tid, sampleIdsFor(sample, s.table));
          return [s.id, n] as const;
        }),
      );
      return Object.fromEntries(entries) as Counts;
    },
  });

  const steps = useMemo(
    () => deriveSteps(countsQuery.data ?? {}, canAccess),
    [countsQuery.data, canAccess],
  );
  const complete = isComplete(steps);

  // ---- retire the checklist once it is genuinely finished -----------------
  // Recorded on the server rather than just hidden, so the counts above stop
  // running on every dashboard load for the rest of the workspace's life.
  // Per WORKSPACE, not a plain boolean: the component stays mounted across a
  // workspace switch, so a shared flag would retire the first workspace and
  // then never write the second one's.
  const retiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !canManage || !currentTenantId) return;
    if (retiredFor.current === currentTenantId) return;
    if (!countsQuery.isSuccess || !complete) return;
    retiredFor.current = currentTenantId;
    setValue({ ...value, status: "done" });
    // `value` is captured deliberately: re-running on it would fire again with
    // the status we just wrote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, canManage, currentTenantId, countsQuery.isSuccess, complete]);

  const dismiss = () => setValue({ ...value, status: "dismissed" });

  // ---- sample workspace ---------------------------------------------------

  const refreshLedger = useCallback(() => {
    for (const key of [
      "transactions",
      "budgets",
      "goals",
      "dashboard-summary",
      "budget-spend",
      "onboarding-counts",
    ]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  }, [qc]);

  const load = useMutation({
    mutationFn: async (): Promise<SampleRecord> => {
      if (!user) throw new Error("Not signed in");
      if (!currentTenantId) throw new Error("No workspace selected");
      if (sample) throw new Error("Sample data is already loaded");
      const plan = buildSamplePlan(new Date(), baseCurrency || "INR");

      const { data: txns, error: txErr } = await supabase
        .from("transactions")
        .insert(
          plan.transactions.map((t) => ({
            ...t,
            user_id: user.id,
            tenant_id: currentTenantId,
          })),
        )
        .select("id");
      if (txErr) throw txErr;

      const { data: goals, error: goalErr } = await supabase
        .from("goals")
        .insert(
          plan.goals.map((g) => ({ ...g, user_id: user.id, tenant_id: currentTenantId })),
        )
        .select("id");
      if (goalErr) throw goalErr;

      // Budgets go through the RPC because it upserts on
      // (tenant, bucket, period_start) — the same guard that stops two members
      // creating competing rows (BUG-040). The offer is only made to an empty
      // workspace, so this cannot silently overwrite an allocation the user set.
      const budgetIds: string[] = [];
      for (const b of plan.budgets) {
        const { data, error } = await supabase.rpc("budget_set_allocation", {
          p_tenant_id: currentTenantId,
          p_bucket: b.bucket,
          p_allocated: b.allocated,
          p_period: "monthly",
          p_period_start: null,
        });
        if (error) throw error;
        const id = (data as unknown as { id?: string } | null)?.id;
        if (id) budgetIds.push(id);
      }

      return {
        at: new Date().toISOString(),
        transactions: (txns ?? []).map((r) => r.id),
        budgets: budgetIds,
        goals: (goals ?? []).map((r) => r.id),
      };
    },
    onSuccess: (record) => {
      setValue({ ...value, sample: record });
      refreshLedger();
      toast.success("Sample data loaded", {
        description: "Every row is labelled “Sample”. Remove it whenever you like.",
      });
    },
    onError: (e) => notifyError(e, { title: "Could not load the sample data" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error("No workspace selected");
      if (!sample) return;
      const tid = currentTenantId;
      // By id, scoped to the workspace. Rows the user already deleted simply
      // match nothing.
      const drop = async (table: "transactions" | "budgets" | "goals", ids: string[]) => {
        if (!ids.length) return;
        const { error } = await supabase.from(table).delete().eq("tenant_id", tid).in("id", ids);
        if (error) throw error;
      };
      await drop("transactions", sample.transactions);
      await drop("goals", sample.goals);
      await drop("budgets", sample.budgets);
    },
    onSuccess: () => {
      setValue({ ...value, sample: null });
      refreshLedger();
      toast.success("Sample data removed");
    },
    onError: (e) => notifyError(e, { title: "Could not remove the sample data" }),
  });

  return {
    show: shouldShowChecklist(value, canManage),
    steps,
    done: completedCount(steps),
    total: steps.length,
    complete,
    loading: settingLoading || countsQuery.isLoading,
    sample,
    canManage,
    loadSample: () => load.mutate(),
    removeSample: () => remove.mutate(),
    sampleBusy: load.isPending || remove.isPending,
    dismiss,
  };
}
