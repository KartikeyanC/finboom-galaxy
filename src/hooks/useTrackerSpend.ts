import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { foldTrackerSpend, type Tracker, type TrackerSpendRow, type TrackerWithSpend } from "@/lib/trackers";
import { useTrackers } from "@/hooks/useTrackers";

/**
 * Derived tracker totals, from the `tracker_spend()` aggregate.
 *
 * Why an RPC rather than folding transactions in the browser: the index page
 * needs N totals, and the client-side alternative is `useTransactions(…, "all")`
 * — the whole ledger downloaded to render a few numbers. Stage 4.2 spent three
 * migrations removing exactly that pattern (`dashboard_summary`,
 * `budget_spend`, `useLiveAccountBalances`); re-introducing it on a new surface
 * would be a regression against a recent, deliberate direction.
 *
 * The DETAIL view does not use this hook — it already holds its own rows and
 * folds them with the same pure function, so the two paths cannot disagree.
 *
 * There is no `spent` column and there must never be one (ADR-0006).
 */
export function useTrackerSpend(): {
  data: TrackerWithSpend[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const { currentTenantId } = useTenant();
  const trackersQuery = useTrackers();
  const trackers = (trackersQuery.data ?? []) as Tracker[];

  const spend = useQuery({
    queryKey: ["tracker-spend", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tracker_spend", {
        p_tenant_id: currentTenantId as string,
      });
      if (error) throw error;
      // The RPC returns jsonb, typed as Json by the generator. Widening via
      // unknown is the honest boundary: the shape is guaranteed by
      // tracker_spend()'s SELECT list, not by anything TypeScript can see, and
      // foldTrackerSpend tolerates a malformed row rather than trusting it.
      return (Array.isArray(data) ? data : []) as unknown as TrackerSpendRow[];
    },
  });

  return {
    data: foldTrackerSpend(trackers, spend.data),
    isLoading: trackersQuery.isLoading || spend.isLoading,
    isError: trackersQuery.isError || spend.isError,
    refetch: () => {
      void trackersQuery.refetch();
      void spend.refetch();
    },
  };
}
