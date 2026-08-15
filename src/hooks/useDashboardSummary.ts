import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toINR } from "@/lib/finance";
import type { AccountDelta } from "@/lib/accountBalances";

/**
 * Stage 4.2 / BUG-045 · PERF-005.
 *
 * The dashboard used to render eight numbers by downloading every transaction
 * row and reducing it in JavaScript — unbounded work that grows with the user's
 * history. `dashboard_summary()` does the grouping in Postgres and returns a
 * few dozen rows regardless of how many years are behind them.
 *
 * Totals arrive PER CURRENCY and are converted here, because the FX table lives
 * in `src/lib/finance.ts` and must stay the single source of truth. See the
 * migration comment for why that is not done in SQL.
 */

export interface SummaryMonthRow {
  month: string; // YYYY-MM, bucketed in the caller's timezone
  type: "income" | "expense";
  currency: string;
  total: number;
  count: number;
}

export interface SummaryCategoryRow {
  category: string;
  type: "income" | "expense";
  currency: string;
  total: number;
  count: number;
}

export interface DashboardSummaryRaw {
  tz: string;
  months: number;
  month_start: string;
  from: string;
  monthly: SummaryMonthRow[];
  categories: SummaryCategoryRow[];
  /** Net movement per account over all history — see useLiveAccountBalances. */
  account_deltas: AccountDelta[];
  totals: {
    transactions: number;
    earliest: string | null;
    latest: string | null;
    /** Lifetime rows per type — an "all time" count without fetching all time. */
    by_type: Partial<Record<"income" | "expense" | "transfer", number>>;
  };
}

export interface CategoryTotal {
  name: string;
  value: number;
}

export interface DashboardSummary {
  /** Current-month figures, converted to INR. */
  income: number;
  expense: number;
  savings: number;
  savingsRate: number;
  /** `months` long, oldest first; the last entry is the current month. */
  monthKeys: string[];
  incomeSeries: number[];
  expenseSeries: number[];
  /** Current month, largest first. */
  incomeCategories: CategoryTotal[];
  expenseCategories: CategoryTotal[];
  /** How much history exists, without having fetched any of it. */
  transactionCount: number;
  /** Lifetime row counts per type, same caveat. */
  countByType: Partial<Record<"income" | "expense" | "transfer", number>>;
}

/** The `months` window the server bucketed into, oldest first. */
export function monthWindow(monthCount: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const EMPTY: DashboardSummary = {
  income: 0,
  expense: 0,
  savings: 0,
  savingsRate: 0,
  monthKeys: [],
  incomeSeries: [],
  expenseSeries: [],
  incomeCategories: [],
  expenseCategories: [],
  transactionCount: 0,
  countByType: {},
};

/**
 * Pure so it can be tested without a database. Everything the dashboard shows
 * is derived here, in one place, instead of being re-reduced in each widget.
 */
export function deriveSummary(
  raw: DashboardSummaryRaw | null | undefined,
  now = new Date(),
): DashboardSummary {
  if (!raw) return EMPTY;

  const monthKeys = monthWindow(raw.months ?? 6, now);
  const current = monthKeys[monthKeys.length - 1];

  const inc = new Map<string, number>(monthKeys.map((m) => [m, 0]));
  const exp = new Map<string, number>(monthKeys.map((m) => [m, 0]));

  for (const row of raw.monthly ?? []) {
    // A server month outside the client's window means the two disagree about
    // "now" (a stale tab across midnight on the 1st). Dropping it is safer than
    // charting a bar with no axis label.
    const bucket = row.type === "income" ? inc : exp;
    if (!bucket.has(row.month)) continue;
    bucket.set(row.month, (bucket.get(row.month) ?? 0) + toINR(Number(row.total), row.currency));
  }

  const incomeSeries = monthKeys.map((m) => inc.get(m) ?? 0);
  const expenseSeries = monthKeys.map((m) => exp.get(m) ?? 0);

  const income = inc.get(current) ?? 0;
  const expense = exp.get(current) ?? 0;
  const savings = income - expense;
  const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;

  const roll = (type: "income" | "expense"): CategoryTotal[] => {
    const m = new Map<string, number>();
    for (const row of raw.categories ?? []) {
      if (row.type !== type) continue;
      m.set(row.category, (m.get(row.category) ?? 0) + toINR(Number(row.total), row.currency));
    }
    return Array.from(m, ([name, value]) => ({ name, value }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  return {
    income,
    expense,
    savings,
    savingsRate,
    monthKeys,
    incomeSeries,
    expenseSeries,
    incomeCategories: roll("income"),
    expenseCategories: roll("expense"),
    transactionCount: Number(raw.totals?.transactions ?? 0),
    countByType: raw.totals?.by_type ?? {},
  };
}

/** The browser's zone, so the server buckets months the same way the UI does. */
function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function useDashboardSummary(months = 6) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const tz = localTimeZone();

  const query = useQuery({
    queryKey: ["dashboard-summary", user?.id, currentTenantId, months, tz],
    enabled: !!user && !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_summary", {
        p_tenant_id: currentTenantId as string,
        p_months: months,
        p_tz: tz,
      });
      if (error) throw error;
      return data as unknown as DashboardSummaryRaw;
    },
  });

  return {
    ...query,
    summary: deriveSummary(query.data),
  };
}
