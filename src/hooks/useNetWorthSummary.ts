import { useMemo } from "react";
import { useAccounts } from "@/lib/accountsStore";
import { useInvestments, getCurrent } from "@/lib/investmentsStore";
import { useDebts, debtSummary } from "@/lib/debtsStore";
import { useLiveAccountBalances, calcLiveTotalBalance } from "@/hooks/useLiveAccountBalances";

export interface NetWorthSummary {
  assets: number;
  liabilities: number;
  netWorth: number;
  hasData: boolean;
}

/**
 * BUG-017 — the one place that computes the "net worth" figure shown on the
 * dashboard (metric card + Wealth Overview panel) and the Investments page.
 *
 * Each of those used to compute it themselves. `NetWorthTrend` in particular
 * did so with a `useMemo` whose dependency list was missing `liveBalances` —
 * which load asynchronously — so it locked onto whatever it computed before the
 * balances arrived (opening balances only) and never updated, leaving the
 * "Wealth Overview" figure visibly contradicting the metric card on the same
 * screen. Deriving it once, here, makes that impossible.
 */
export function useNetWorthSummary(): NetWorthSummary {
  const { accounts } = useAccounts();
  const { records: investments } = useInvestments();
  const debts = useDebts();
  const liveBalances = useLiveAccountBalances();

  return useMemo(() => {
    const cash = calcLiveTotalBalance(accounts, liveBalances);
    const inv = investments.reduce((s, r) => s + getCurrent(r), 0);
    const assets = cash + inv;
    const liabilities = debts.records.reduce(
      (s, d) => s + Math.max(0, debtSummary(d).remaining),
      0,
    );
    const netWorth = assets - liabilities;
    const hasData =
      accounts.length > 0 || investments.length > 0 || debts.records.length > 0;
    return { assets, liabilities, netWorth, hasData };
  }, [accounts, investments, debts.records, liveBalances]);
}
