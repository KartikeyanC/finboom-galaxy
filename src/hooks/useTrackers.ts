import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";
import { formatMoney } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import type { Tracker, TrackerInput, TrackerStatus } from "@/lib/trackers";

/**
 * Trackers — CRUD and lifecycle.
 *
 * Modelled on `useTransactions.ts` / `useBudgets.ts`: one React Query hook per
 * concern, tenant filtered on every read, tenant re-asserted on every write.
 * There is no localStorage store here and there must not be one — the legacy
 * `lib/*Store.ts` pattern is being migrated out, not extended.
 */

const KEY = "trackers";

/**
 * Live trackers for the current workspace.
 *
 * Soft-deleted rows are filtered SERVER-side rather than in the browser: a
 * deleted tracker is not "hidden", it is gone as far as every consumer is
 * concerned, and shipping it to the client just to drop it invites somebody
 * downstream to render it.
 */
export function useTrackers() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  return useQuery({
    queryKey: [KEY, user?.id, currentTenantId],
    enabled: !!user && !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("trackers")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .is("deleted_at", null)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tracker[];
    },
  });
}

/**
 * id → name, for rendering a badge on a transaction row.
 *
 * One map for a whole list, never one hook per row. A row whose tracker is
 * missing from the map — denied by menu, or deleted between fetches — renders
 * NO badge rather than a raw uuid or an error state.
 */
export function useTrackerNameMap(): Map<string, string> {
  const { data } = useTrackers();
  return useMemo(() => new Map((data ?? []).map((t) => [t.id, t.name])), [data]);
}

export function useCreateTracker() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TrackerInput) => {
      if (!user) throw new Error("You are signed out. Sign in and try again.");
      if (!currentTenantId) throw new Error("No workspace selected");
      // tenant_id is set EXPLICITLY rather than left to the column's
      // current_tenant_id() default, which resolves to the user's first
      // membership — wrong for anyone in more than one workspace. Same
      // reasoning as useTransactions.ts:112-114.
      const { data, error } = await supabase.from("trackers")
        .insert({
          name: input.name.trim(),
          type: input.type,
          start_date: input.start_date,
          end_date: input.end_date ?? null,
          budget: input.budget ?? null,
          description: input.description?.trim() || null,
          user_id: user.id,
          tenant_id: currentTenantId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Tracker;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["tracker-spend"] });
      toast.success(`Tracker "${t?.name ?? ""}" created`);
    },
    onError: (e) => notifyError(e),
  });
}

export function useUpdateTracker() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TrackerInput> }) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      // Spread-conditionals rather than a Record<string, unknown>: the
      // generated Update type rejects an untyped bag, and rightly — that bag
      // is how a typo becomes a silently-ignored field.
      const body = {
        ...(patch.name !== undefined && { name: patch.name.trim() }),
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.start_date !== undefined && { start_date: patch.start_date }),
        ...(patch.end_date !== undefined && { end_date: patch.end_date ?? null }),
        ...(patch.budget !== undefined && { budget: patch.budget ?? null }),
        ...(patch.description !== undefined && {
          description: patch.description?.trim() || null,
        }),
      };

      const { data, error } = await supabase.from("trackers")
        .update(body)
        .eq("id", id)
        .eq("tenant_id", currentTenantId)
        .select("*")
        .single();
      if (error) throw error;
      return data as Tracker;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["tracker-spend"] });
      toast.success("Tracker updated");
    },
    onError: (e) => notifyError(e),
  });
}

/**
 * Move a tracker between active / completed / archived.
 *
 * The timestamps are set alongside the status rather than by a trigger, so a
 * row always says WHEN it reached its state and reopening one clears the
 * stamp it is leaving behind.
 */
export function useSetTrackerStatus() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  let finalTotal: number | null = null;
  return useMutation({
    mutationFn: async ({
      id,
      status,
      spentSoFar,
    }: {
      id: string;
      status: TrackerStatus;
      /** Passed by the caller, which already has it — avoids a second read. */
      spentSoFar?: number;
    }) => {
      finalTotal = spentSoFar ?? null;
      if (!currentTenantId) throw new Error("No workspace selected");
      const now = new Date().toISOString();
      const { data, error } = await supabase.from("trackers")
        .update({
          status,
          completed_at: status === "completed" ? now : null,
          archived_at: status === "archived" ? now : null,
        })
        .eq("id", id)
        .eq("tenant_id", currentTenantId)
        .select("*")
        .single();
      if (error) throw error;
      return data as Tracker;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      // Peak-End: finishing a project is the emotional high point of the
      // whole feature, and "Tracker updated" throws it away. Completion gets
      // the closing figure — the number the user opened the tracker to learn
      // in the first place. Archiving and reopening stay matter-of-fact,
      // because they are housekeeping.
      if (t?.status === "completed") {
        toast.success(`"${t.name}" completed`, {
          description:
            finalTotal !== null
              ? `Final total: ${formatMoney(finalTotal)}. It stays in Completed with every transaction intact.`
              : "It stays in Completed with every transaction intact.",
        });
      } else if (t?.status === "archived") {
        toast.success(`"${t?.name}" archived`);
      } else {
        toast.success(`"${t?.name}" reopened`);
      }
    },
    onError: (e) => notifyError(e),
  });
}

/**
 * Soft delete: stamp `deleted_at` and stop returning the row.
 *
 * Deliberately NOT a hard delete. A tracker is a label that many transactions
 * point at, and `transactions.tracker_id` is ON DELETE SET NULL — so a real
 * delete would silently strip context from historical rows that the user
 * cannot reconstruct from memory. Soft-deleting leaves every `tracker_id`
 * intact, which is what makes restore possible at all.
 *
 * Transactions are never touched here, and no balance moves.
 */
export function useSoftDeleteTracker() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase.from("trackers")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", currentTenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["tracker-spend"] });
      toast.success("Tracker deleted. Your transactions were not changed.");
    },
    onError: (e) => notifyError(e),
  });
}

/**
 * Stamp `reviewed_at` — the user has answered the "shall we look through your
 * older transactions?" question.
 *
 * Set by BOTH "Assign" and "Skip for now", deliberately. The flag records
 * that the question was ASKED AND ANSWERED, not that anything was assigned;
 * a user who skipped has answered it, and re-offering the same prompt on
 * every visit is nagging. The button stays available in the workspace
 * afterwards, so skipping closes the prompt and never the door.
 *
 * A column rather than a localStorage key on purpose: which transactions
 * belong to a project is a fact about the workspace, not about this browser,
 * and a device-local flag would re-nag the same person on their laptop.
 */
export function useMarkTrackerReviewed() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase.from("trackers")
        .update({ reviewed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", currentTenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (e) => notifyError(e),
  });
}
