import { useSyncExternalStore } from "react";

/**
 * Stage 4.2 — the window a ledger view covers.
 *
 * The ledger pages used to fetch every transaction the workspace had ever
 * recorded. `useInfiniteQuery` was the obvious fix and is the wrong one here:
 * ExpenseLedger and TransactionsTable filter, search, cross-filter and chart
 * ENTIRELY on the client, over whatever they were handed. Paginating them would
 * not simply show fewer rows — the search box would search only loaded pages,
 * the category dropdown would offer only loaded categories, the pie chart would
 * chart a fraction of the spending, and "N entries in view" would be a lie.
 * Every one of those failures is silent.
 *
 * An explicit period is the honest bound. The fetch is limited at the server,
 * and every client-side filter remains exactly correct *within the window the
 * user can see they selected*. "All time" stays available and is labelled as
 * the slow option rather than being hidden.
 */

export type LedgerPeriod = "month" | "3months" | "year" | "all";

export interface LedgerPeriodOption {
  id: LedgerPeriod;
  label: string;
  /** Shown next to the option when it needs a caveat. */
  hint?: string;
}

export const LEDGER_PERIODS: readonly LedgerPeriodOption[] = [
  { id: "month", label: "This month" },
  { id: "3months", label: "Last 3 months" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time", hint: "Slower with a long history" },
] as const;

/**
 * Three months: enough context for a ledger to be useful on opening, while
 * still bounding the fetch. "This month" is a common default elsewhere but
 * reads as an empty page early in a month, which looks like a bug.
 */
export const DEFAULT_LEDGER_PERIOD: LedgerPeriod = "3months";

export function isLedgerPeriod(v: unknown): v is LedgerPeriod {
  return LEDGER_PERIODS.some((p) => p.id === v);
}

export function ledgerPeriodLabel(period: LedgerPeriod): string {
  return LEDGER_PERIODS.find((p) => p.id === period)?.label ?? "All time";
}

/**
 * Inclusive start of the window, or `null` for "all time".
 *
 * Boundaries are computed in LOCAL time, matching every other date decision in
 * the UI — a user in IST expects "this month" to start at midnight where they
 * are, not at 05:30 because the server thinks in UTC.
 */
export function ledgerPeriodStart(period: LedgerPeriod, now = new Date()): Date | null {
  switch (period) {
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "3months":
      // The current month plus the two before it, so "3 months" means three
      // calendar months rather than 90 days back from today.
      return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
    default:
      return null;
  }
}

/** The value to hand to a `gte` filter, or null when the window is unbounded. */
export function ledgerPeriodSince(period: LedgerPeriod, now = new Date()): string | null {
  return ledgerPeriodStart(period, now)?.toISOString() ?? null;
}

/* ── remembered per device (see lib/deviceLocal.ts) ── */

const STORAGE_KEY = "finroot.ledger.period";
const EVENT = "finroot:ledger-period";

export function getLedgerPeriod(): LedgerPeriod {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isLedgerPeriod(raw) ? raw : DEFAULT_LEDGER_PERIOD;
  } catch {
    return DEFAULT_LEDGER_PERIOD;
  }
}

export function setLedgerPeriod(period: LedgerPeriod) {
  try {
    localStorage.setItem(STORAGE_KEY, period);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Reactive — every ledger view moves together when the period changes. */
export function useLedgerPeriod(): LedgerPeriod {
  return useSyncExternalStore(subscribe, getLedgerPeriod, () => DEFAULT_LEDGER_PERIOD);
}
