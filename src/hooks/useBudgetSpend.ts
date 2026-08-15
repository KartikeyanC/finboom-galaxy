import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useBudgets, type Budget } from "@/hooks/useBudgets";
import { bucketForCategory } from "@/lib/budgetBuckets";

export interface BudgetWithSpend extends Budget {
  /** Actual spend from transactions for this bucket and period. */
  derivedSpent: number;
  /** derivedSpent / allocated, as a percentage (0 when nothing is allocated). */
  utilization: number;
  remaining: number;
}

/** One row of `budget_spend`: a budget's expense total in a single category. */
export interface BudgetSpendRow {
  budget_id: string;
  category: string;
  total: number;
  count: number;
}

/**
 * Fold `budget_spend`'s per-category rows into one number per budget.
 *
 * The category → bucket map stays here on the client on purpose: it is the
 * single definition of that relationship and is meant to become a per-tenant
 * table later (see `lib/budgetBuckets.ts`). The server does the windowing and
 * the summing; this decides which jar each category falls into.
 *
 * Pure, so the folding is tested without a database.
 */
export function foldBudgetSpend(
  budgets: Budget[],
  rows: BudgetSpendRow[] | null | undefined,
): BudgetWithSpend[] {
  const byBudget = new Map<string, BudgetSpendRow[]>();
  for (const r of rows ?? []) {
    byBudget.set(r.budget_id, [...(byBudget.get(r.budget_id) ?? []), r]);
  }

  return budgets.map((b) => {
    const derivedSpent = (byBudget.get(b.id) ?? []).reduce(
      (sum, r) => (bucketForCategory(r.category) === b.bucket ? sum + (Number(r.total) || 0) : sum),
      0,
    );
    const allocated = Number(b.allocated) || 0;
    return {
      ...b,
      derivedSpent,
      utilization: allocated > 0 ? Math.round((derivedSpent / allocated) * 100) : 0,
      remaining: allocated - derivedSpent,
    };
  });
}

/**
 * Budgets with spend computed from real transactions instead of the hand-typed
 * `budgets.spent` column.
 *
 * The stored column is left alone (older rows may still carry a value) but is
 * no longer read anywhere in the UI — every consumer should use `derivedSpent`
 * so the number always reflects what actually happened.
 *
 * Stage 4.2: the summing moved to the `budget_spend` RPC. This hook used to
 * call `useTransactions()` and re-reduce the entire ledger once per budget row,
 * which also kept the dashboard on a full table fetch via `BudgetAllocation`.
 */
export function useBudgetSpend() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { data: budgets = [], ...rest } = useBudgets();

  const { data: spendRows } = useQuery({
    queryKey: ["budget-spend", user?.id, currentTenantId],
    enabled: !!user && !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("budget_spend", {
        p_tenant_id: currentTenantId as string,
      });
      if (error) throw error;
      return (data ?? []) as unknown as BudgetSpendRow[];
    },
  });

  const rows = useMemo<BudgetWithSpend[]>(
    () => foldBudgetSpend(budgets, spendRows),
    [budgets, spendRows],
  );

  return { ...rest, data: rows, budgets: rows };
}
