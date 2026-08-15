import { useMemo } from "react";
import { useAccounts, type StoredAccount } from "@/lib/accountsStore";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { applyAccountDeltas } from "@/lib/accountBalances";

export { extractAccountId } from "@/lib/accountBalances";

/**
 * Map of accountId → live balance.
 *
 * Stage 4.2: this used to call `useTransactions()` and reduce the entire table.
 * Because both dashboards depend on it, moving the month totals to
 * `dashboard_summary` on its own changed nothing — the full fetch was still
 * happening here. The per-account sums now come from the same RPC, and the
 * opening balance (which only the client knows) is added on top.
 *
 * The arithmetic still lives in `lib/accountBalances.ts` so the money rules are
 * tested directly, and a parity test pins the server's grouping to them.
 */
export function useLiveAccountBalances(): Record<string, number> {
  const { accounts } = useAccounts();
  const { data } = useDashboardSummary();

  return useMemo(
    () => applyAccountDeltas(accounts as StoredAccount[], data?.account_deltas),
    [accounts, data?.account_deltas],
  );
}

/** Total liquid balance across all non-credit accounts (live). Plain function — safe inside useMemo. */
export function calcLiveTotalBalance(accounts: StoredAccount[], liveBalances: Record<string, number>): number {
  return accounts
    .filter((a) => a.type !== "credit")
    .reduce((s, a) => s + (liveBalances[a.id] ?? Number(a.openingBalance || 0)), 0);
}
