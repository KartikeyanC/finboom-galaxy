import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";
import { supabase } from "@/integrations/supabase/client";
import { endExclusive } from "@/lib/trackerReview";
import type { Tracker } from "@/lib/trackers";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * The transactions tagged to one tracker.
 *
 * These are THE SAME ROWS as everywhere else in the app — the query filters
 * `transactions` by `tracker_id`, it does not read a second table. A row shown
 * here is simultaneously in All Transactions, Expenses, its account, its
 * category, Reports, Search and Export, exactly as it was before it was
 * tagged. Nothing is duplicated, and untagging it later changes nothing but
 * the label.
 *
 * Server-filtered rather than fetched-then-filtered: the partial index
 * `transactions_tenant_tracker_idx (tenant_id, tracker_id, occurred_at DESC)`
 * exists for this query, and pulling the whole ledger to show one project's
 * rows is the pattern Stage 4.2 removed.
 */
export function useTrackerTransactions(trackerId: string | null) {
  const { currentTenantId } = useTenant();
  return useQuery({
    queryKey: ["transactions", "by-tracker", trackerId, currentTenantId],
    enabled: !!currentTenantId && !!trackerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .eq("tracker_id", trackerId as string)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

/** Cap on the candidate list. An honest capped list beats pagination in v1. */
export const CANDIDATE_LIMIT = 500;

/**
 * Untagged transactions inside a tracker's date window — the pool the
 * historical review offers.
 *
 * `.is("tracker_id", null)` is a correctness rule, not an optimisation: a row
 * already tagged to another project must never be offered here, because
 * assigning it would silently move it out of whatever it is currently counted
 * in. Served by the existing idx_tx_tenant(tenant_id, occurred_at DESC).
 *
 * `enabled` is opt-in so merely opening a tracker does not fetch a candidate
 * pool nobody asked for.
 */
export function useUntaggedCandidates(tracker: Tracker | null, enabled: boolean) {
  const { currentTenantId } = useTenant();
  return useQuery({
    queryKey: ["transactions", "untagged", tracker?.id, currentTenantId],
    enabled: !!currentTenantId && !!tracker && enabled,
    queryFn: async () => {
      const t = tracker as Tracker;
      const { data, error } = await supabase.from("transactions")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .is("tracker_id", null)
        .gte("occurred_at", `${t.start_date}T00:00:00.000Z`)
        .lt("occurred_at", endExclusive(t))
        .order("occurred_at", { ascending: false })
        .limit(CANDIDATE_LIMIT);
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

/**
 * Assign a chosen set of transactions to a tracker.
 *
 * One bulk write, never a loop: a per-row loop that fails halfway leaves the
 * user's history in a state neither they nor we can describe.
 *
 * The `.is("tracker_id", null)` on the UPDATE is the idempotency guard. If
 * another device tagged one of these rows while this dialog was open, that row
 * is skipped rather than stolen — the write can be replayed safely and can
 * never overwrite somebody else's decision.
 *
 * No balance moves. This writes one label column and nothing else.
 */
export function useAssignToTracker() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ trackerId, ids }: { trackerId: string; ids: string[] }) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      if (ids.length === 0) return 0;
      const { error } = await supabase.from("transactions")
        .update({ tracker_id: trackerId })
        .in("id", ids)
        // Cross-workspace guard, as in useUpdateTransaction.
        .eq("tenant_id", currentTenantId)
        .is("tracker_id", null);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["tracker-spend"] });
      if (n > 0) {
        // The invariant, restated where the person can actually see it.
        toast.success(
          `${n} ${n === 1 ? "transaction" : "transactions"} assigned. Account balances unchanged.`,
        );
      }
    },
    onError: (e) => notifyError(e),
  });
}

/**
 * Remove one transaction from its tracker.
 *
 * The reverse of the above and just as safe: the row stays exactly where it
 * was in every other view, it simply stops being grouped.
 */
export function useUnassignFromTracker() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase.from("transactions")
        .update({ tracker_id: null })
        .eq("id", id)
        .eq("tenant_id", currentTenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["tracker-spend"] });
      toast.success("Removed from tracker. The transaction itself is unchanged.");
    },
    onError: (e) => notifyError(e),
  });
}
