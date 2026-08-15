import { BUDGET_BUCKETS, EXPENSE_CATEGORIES } from "@/lib/finance";

/**
 * Bridges the two vocabularies the app uses for money going out.
 *
 * Budgets are kept in a 7-jar system (Needs, Play, Giving, ...), while
 * transactions are tagged with everyday categories (Rent, Transport, ...).
 * Nothing connected the two, so `budgets.spent` was a number the user typed in
 * by hand and it drifted from actual spending immediately.
 *
 * This map is the single place that relationship is defined. It is intentionally
 * plain data so it can later be moved into a per-tenant table and edited by the
 * user without changing any of the call sites.
 */

export type BudgetBucket = (typeof BUDGET_BUCKETS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Default category → bucket assignment.
 *
 * Essentials (a roof, power, food, getting to work, health, grooming) count as
 * Needs. Discretionary spending (going out, travelling, shopping, subscriptions)
 * counts as Play. Education has a jar of its own.
 */
export const CATEGORY_TO_BUCKET: Record<string, BudgetBucket> = {
  Rent: "Needs",
  Utilities: "Needs",
  "Food & Dining": "Needs",
  Transport: "Needs",
  Healthcare: "Needs",
  "Personal Care": "Needs",

  Shopping: "Play",
  Entertainment: "Play",
  Travel: "Play",
  Subscriptions: "Play",

  Education: "Education",
};

/**
 * Buckets that no expense category feeds into.
 *
 * These represent money set aside rather than spent — contributions show up as
 * investments, goals or account transfers, not as expense rows. Derived spend
 * for them is legitimately zero, and the UI should say so rather than implying
 * the user simply has not spent anything yet.
 */
export const NON_EXPENSE_BUCKETS: readonly BudgetBucket[] = [
  "Financial Freedom",
  "Long-Term Savings",
  "Giving",
  "Agri",
] as const;

export function isNonExpenseBucket(bucket: string): boolean {
  return (NON_EXPENSE_BUCKETS as readonly string[]).includes(bucket);
}

/**
 * Which jar an expense category belongs to.
 *
 * Unmapped categories (including user-created ones and "Other") fall back to
 * Needs, so spending is never silently dropped from the totals.
 */
export function bucketForCategory(category: string | null | undefined): BudgetBucket {
  if (!category) return "Needs";
  return CATEGORY_TO_BUCKET[category] ?? "Needs";
}

/** Every category currently assigned to a given bucket. */
export function categoriesForBucket(bucket: string): string[] {
  return Object.keys(CATEGORY_TO_BUCKET).filter((c) => CATEGORY_TO_BUCKET[c] === bucket);
}

/**
 * The half-open period window [start, end) a budget row covers.
 * Month arithmetic is done on UTC date parts so it never shifts by timezone,
 * and month-end clamping is inherent to using day 1 of the following month.
 */
export function periodWindow(
  periodStart: string,
  period: string = "monthly",
): { start: Date; end: Date } {
  const [y, m, d] = periodStart.slice(0, 10).split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));

  let end: Date;
  if (period === "weekly") end = new Date(Date.UTC(y, m - 1, d + 7));
  else if (period === "yearly") end = new Date(Date.UTC(y + 1, m - 1, d));
  else end = new Date(Date.UTC(y, m, d)); // monthly

  return { start, end };
}

export interface SpendInput {
  type: string;
  category: string | null;
  amount: number | string;
  occurred_at: string;
}

/**
 * Actual spend for one budget row, summed from real expense transactions whose
 * category maps to that bucket and which fall inside the budget's period.
 */
export function deriveSpent(
  transactions: readonly SpendInput[],
  bucket: string,
  periodStart: string,
  period: string = "monthly",
): number {
  const { start, end } = periodWindow(periodStart, period);

  return transactions.reduce((sum, t) => {
    if (t.type !== "expense") return sum;
    if (bucketForCategory(t.category) !== bucket) return sum;
    const at = new Date(t.occurred_at);
    if (at < start || at >= end) return sum;
    return sum + Number(t.amount || 0);
  }, 0);
}
