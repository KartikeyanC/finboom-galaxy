import { toINR } from "@/lib/finance";
import type { TxnType } from "@/hooks/useTransactions";

/**
 * Trackers — the pure core.
 *
 * A tracker is an OPTIONAL contextual dimension on a transaction: which
 * project or life event it belongs to (Home Construction, Dubai Trip,
 * Wedding). It is not an account, a wallet, a budget, a bucket, a category or
 * a ledger, and it holds no money.
 *
 * Nothing here touches React or Supabase, which is the point: every figure a
 * tracker shows is derived arithmetic, so it can be tested without a database
 * (ADR-0006 — derive money, never store it; there is no `spent` column and
 * there must never be one).
 */

export const TRACKER_TYPES = [
  "Home Construction",
  "Travel",
  "Wedding",
  "Vehicle",
  "Education",
  "Business Project",
  "Event",
  "Custom",
] as const;

export type TrackerType = (typeof TRACKER_TYPES)[number];

/**
 * Three states, one more than trips has. A finished project is not the same
 * as a tidied-away one: "completed" is an achievement the user reaches,
 * "archived" is housekeeping they choose.
 */
export type TrackerStatus = "active" | "completed" | "archived";

export interface Tracker {
  id: string;
  user_id: string | null;
  tenant_id: string;
  name: string;
  type: TrackerType;
  /** The REAL project start, which may long predate `created_at`. */
  start_date: string;
  end_date: string | null;
  /** NULL means no budget at all — never render that as a zero budget. */
  budget: number | null;
  currency: string;
  description: string | null;
  status: TrackerStatus;
  completed_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  /**
   * When the user answered the historical-review prompt — by assigning, or by
   * skipping. Records that the question was ASKED AND ANSWERED, not that
   * anything was assigned, so a skip is not re-nagged on the next visit.
   */
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackerInput {
  name: string;
  type: TrackerType;
  start_date: string;
  end_date?: string | null;
  budget?: number | null;
  description?: string | null;
}

/**
 * "T-" is a DISPLAY convention only. The stored name is always the real one
 * ("Home Construction"), never the prefixed form — `trackers.test.ts` pins
 * that, because a prefix that leaks into storage is impossible to undo later
 * without guessing which names a user typed themselves.
 */
export function trackerDisplayLabel(name: string): string {
  return `T-${name.trim()}`;
}

/**
 * One neutral tint for every tracker, deliberately.
 *
 * This does NOT call `categoryBadgeClass` (src/lib/categories.ts:73): a
 * tracker wearing the category palette reads as a second category, which is
 * the exact confusion the feature has to avoid. Colour carries no meaning
 * here — using the tracker's type to pick one would invent a second visual
 * taxonomy the user then has to learn.
 */
export function trackerBadgeClass(isLight: boolean): string {
  return isLight
    ? "bg-primary/10 text-primary border-primary/25"
    : "bg-primary/10 text-primary border-primary/30";
}

/** One row of `tracker_spend()`: per tracker, per type, per currency. */
export interface TrackerSpendRow {
  tracker_id: string;
  type: TxnType;
  currency: string;
  total: number;
  count: number;
  first_at: string;
  last_at: string;
}

export interface TrackerWithSpend extends Tracker {
  /** Expenses only, converted to INR. Never netted against income. */
  derivedSpent: number;
  /**
   * Income tagged to this tracker, kept SEPARATE. Netting it against spend
   * would let a refund make a build look cheaper than it was, and "what has
   * this cost me" is the question the whole feature exists to answer.
   */
  inflow: number;
  txnCount: number;
  /** 0 when there is no budget — see `remaining` for the honest signal. */
  utilization: number;
  /** null when there is no budget. NOT zero: absent is not spent-in-full. */
  remaining: number | null;
}

/**
 * Fold `tracker_spend()` rows onto their trackers.
 *
 * Mirrors `foldBudgetSpend` (src/hooks/useBudgetSpend.ts:35), including its
 * divide-by-zero guard. Transfers are ignored on purpose, exactly as every
 * other aggregate in the app ignores them: moving money between your own
 * accounts is not spending, and counting it would inflate a tracker's total.
 */
export function foldTrackerSpend(
  trackers: readonly Tracker[],
  rows: readonly TrackerSpendRow[] | null | undefined,
): TrackerWithSpend[] {
  const byTracker = new Map<string, { spent: number; inflow: number; count: number }>();

  for (const r of rows ?? []) {
    // A row whose tracker we do not know about is dropped, never folded into
    // some other tracker. Attribution has to be exact or the number lies.
    if (!r?.tracker_id) continue;
    const acc = byTracker.get(r.tracker_id) ?? { spent: 0, inflow: 0, count: 0 };
    const inr = toINR(Number(r.total) || 0, r.currency);
    if (r.type === "expense") acc.spent += inr;
    else if (r.type === "income") acc.inflow += inr;
    // transfers: counted in neither, by design.
    acc.count += Number(r.count) || 0;
    byTracker.set(r.tracker_id, acc);
  }

  return trackers.map((t) => {
    const acc = byTracker.get(t.id) ?? { spent: 0, inflow: 0, count: 0 };
    const budget = t.budget === null || t.budget === undefined ? null : Number(t.budget);
    const hasBudget = budget !== null && Number.isFinite(budget) && budget > 0;
    return {
      ...t,
      derivedSpent: acc.spent,
      inflow: acc.inflow,
      txnCount: acc.count,
      utilization: hasBudget ? Math.round((acc.spent / budget) * 100) : 0,
      remaining: hasBudget ? budget - acc.spent : null,
    };
  });
}

/**
 * True when the tracker's project started before the tracker was created —
 * i.e. there may be existing transactions that belong to it.
 *
 * Unused by the Phase 2 UI; it is what the historical-review flow keys off in
 * a later phase, and it lives here so the column's purpose is testable now.
 */
export function isHistoricalTracker(t: { start_date: string; created_at: string }): boolean {
  const created = t.created_at.slice(0, 10);
  return t.start_date < created;
}

/**
 * The tracker's date window, half-open [start, end) in UTC — the same
 * convention as `periodWindow` (src/lib/budgetBuckets.ts:82), which exists so
 * client windows line up with Postgres `date_trunc`.
 *
 * ⚠️ This window is METADATA. It does NOT decide which transactions belong to
 * a tracker — membership is `tracker_id`, set because a person said so. A
 * transaction dated outside the window still counts if it is tagged.
 */
export function trackerDateWindow(t: { start_date: string; end_date: string | null }): {
  start: Date;
  end: Date | null;
} {
  const start = new Date(`${t.start_date}T00:00:00.000Z`);
  if (!t.end_date) return { start, end: null };
  const end = new Date(`${t.end_date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1); // half-open: the end date itself is IN
  return { start, end };
}

/** Whether an ISO timestamp falls inside the tracker's window. */
export function isWithinTrackerWindow(
  occurredAtISO: string,
  t: { start_date: string; end_date: string | null },
): boolean {
  const { start, end } = trackerDateWindow(t);
  const at = new Date(occurredAtISO).getTime();
  if (!Number.isFinite(at)) return false;
  if (at < start.getTime()) return false;
  return end === null || at < end.getTime();
}

/** Sum a per-category or per-account breakdown into chart slices, largest first. */
export function breakdownSlices(
  rows: readonly { amount: number | string; currency: string; type: TxnType }[],
  keyOf: (i: number) => string,
): { name: string; value: number }[] {
  const totals = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.type !== "expense") return;
    const key = keyOf(i);
    totals.set(key, (totals.get(key) ?? 0) + toINR(Number(r.amount) || 0, r.currency));
  });
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
