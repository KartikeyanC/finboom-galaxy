import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";

export type BillingFrequency = "weekly" | "monthly" | "annual";

export interface SubscriptionRecord {
  id: string;
  name: string;
  icon?: string; // emoji
  amount: number;
  currency: string;
  frequency: BillingFrequency;
  /** ISO date YYYY-MM-DD */
  renewalDate: string;
  status: "active" | "cancel";
  category?: string;
  createdAt: string;
}

const STORAGE_KEY = "subscriptions.records.v1";

/** Legacy localStorage reader — used only for the one-time migration to the DB. */
function readLocal(): SubscriptionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type TrackedSubRow = {
  id: string;
  name: string;
  icon: string | null;
  amount: number;
  currency: string;
  frequency: string;
  renewal_date: string | null;
  status: string;
  category: string | null;
  created_at: string;
};

function rowToRecord(r: TrackedSubRow): SubscriptionRecord {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon ?? undefined,
    amount: Number(r.amount),
    currency: r.currency,
    frequency: r.frequency as BillingFrequency,
    renewalDate: r.renewal_date ?? "",
    status: r.status as SubscriptionRecord["status"],
    category: r.category ?? undefined,
    createdAt: r.created_at,
  };
}

/** Map camelCase fields (full or partial) to snake_case columns. */
function recordToRow(s: Partial<SubscriptionRecord>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (s.name !== undefined) row.name = s.name;
  if (s.icon !== undefined) row.icon = s.icon ?? null;
  if (s.amount !== undefined) row.amount = s.amount;
  if (s.currency !== undefined) row.currency = s.currency;
  if (s.frequency !== undefined) row.frequency = s.frequency;
  if (s.renewalDate !== undefined) row.renewal_date = s.renewalDate || null;
  if (s.status !== undefined) row.status = s.status;
  if (s.category !== undefined) row.category = s.category ?? null;
  return row;
}

/**
 * Finance-feature tracked subscriptions (Netflix/Spotify), persisted server-side
 * in `tracked_subscriptions` (NOT the Paddle billing `subscriptions` table).
 * API unchanged.
 */
export function useSubscriptions() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["tracked_subscriptions", currentTenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracked_subscriptions")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as TrackedSubRow[]).map(rowToRecord);
    },
  });

  const items = data ?? [];
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["tracked_subscriptions"] }),
    [qc],
  );

  const add = useCallback(
    async (s: Omit<SubscriptionRecord, "id" | "createdAt">) => {
      if (!currentTenantId) return;
      const { error } = await supabase
        .from("tracked_subscriptions")
        .insert({ ...recordToRow(s), tenant_id: currentTenantId } as unknown as TablesInsert<"tracked_subscriptions">);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const update = useCallback(
    async (id: string, patch: Partial<SubscriptionRecord>) => {
      const { error } = await supabase
        .from("tracked_subscriptions")
        .update(recordToRow(patch) as unknown as TablesUpdate<"tracked_subscriptions">)
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("tracked_subscriptions")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  // One-time migration of legacy localStorage subscriptions into the DB.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || migratedRef.current) return;
    const flag = `finroot.migrated.subscriptions.${currentTenantId}`;
    if (localStorage.getItem(flag)) return;
    migratedRef.current = true;
    const local = readLocal();
    if ((data?.length ?? 0) === 0 && local.length > 0) {
      void (async () => {
        const rows = local.map((s) => ({ ...recordToRow(s), tenant_id: currentTenantId }));
        const { error } = await supabase
          .from("tracked_subscriptions")
          .insert(rows as unknown as TablesInsert<"tracked_subscriptions">[]);
        if (!error) {
          localStorage.setItem(flag, "1");
          invalidate();
        }
      })();
    } else {
      localStorage.setItem(flag, "1");
    }
  }, [currentTenantId, isLoading, data, invalidate]);

  return { items, add, update, remove };
}

export function monthlyEquivalent(s: SubscriptionRecord): number {
  if (s.frequency === "monthly") return s.amount;
  if (s.frequency === "weekly") return (s.amount * 52) / 12;
  return s.amount / 12;
}

export function annualEquivalent(s: SubscriptionRecord): number {
  if (s.frequency === "annual") return s.amount;
  if (s.frequency === "monthly") return s.amount * 12;
  return s.amount * 52;
}