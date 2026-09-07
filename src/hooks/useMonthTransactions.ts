import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { monthGridRange, type WeekStart } from "@/lib/calendarMonth";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * Every transaction visible on the Calendar grid for one month.
 *
 * The fetch is bounded to the grid window — the month plus the spill-over days
 * that fill the first and last rows — for the same reason the ledger views take
 * a period (Stage 4.2): the page groups, sums and charts entirely on the
 * client, so it must be handed exactly the rows it draws and no more. Paging a
 * month is unnecessary; a month of one person's transactions is small.
 *
 * Uses the Stage 4.4 index on `(tenant_id, type, occurred_at DESC)` via the
 * `occurred_at` range, same as `useTransactions`.
 */
export function useMonthTransactions(
  year: number,
  month: number,
  weekStartsOn: WeekStart = 1,
) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  const { start, end } = monthGridRange(year, month, weekStartsOn);
  // The grid's last cell is a local midnight; take the whole of that day.
  const endExclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const fromIso = start.toISOString();
  const toIso = endExclusive.toISOString();

  return useQuery({
    queryKey: ["transactions", "month", year, month, weekStartsOn, user?.id, currentTenantId],
    enabled: !!user && !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .gte("occurred_at", fromIso)
        .lt("occurred_at", toIso)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}
