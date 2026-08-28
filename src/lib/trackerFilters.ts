import { toINR } from "@/lib/finance";
import { trackerDateWindow } from "@/lib/trackers";

/**
 * Filtering a tracker's transactions — the pure core.
 *
 * This is NOT a second global filter system. It filters the rows the tracker
 * workspace has already fetched, the same way `MatrixFilter` and
 * `TransactionsTable` filter theirs — client-side, over a bounded set the
 * server already scoped by `tracker_id`. `MatrixFilter` itself is a render-prop
 * component wired into ExpenseLedger's very different row shape and chip rail;
 * reusing it here would mean widening its props for a second caller with
 * different needs, which is how one component becomes nobody's.
 *
 * What IS shared: the date-preset vocabulary below deliberately mirrors
 * `MatrixFilter`'s presets (`presetRange`, MatrixFilter.tsx:36) so the two
 * surfaces mean the same thing by "This Week".
 *
 * 🔴 Filtering NEVER changes a transaction. `occurred_at` is read and never
 * written; narrowing a view is not editing history.
 */

export type TrackerDatePreset =
  | "tracker"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "custom";

export const TRACKER_DATE_PRESETS: { id: TrackerDatePreset; label: string }[] = [
  // The default: the project's own span, which is the question the user is
  // actually asking when they open a tracker.
  { id: "tracker", label: "Whole tracker" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "custom", label: "Custom range" },
];

export interface TrackerFilter {
  datePreset: TrackerDatePreset;
  customFrom: string | null;
  customTo: string | null;
  categories: string[];
  accounts: string[];
  paymentModes: string[];
  types: string[];
  minAmount: number | null;
  maxAmount: number | null;
  search: string;
}

export const EMPTY_TRACKER_FILTER: TrackerFilter = {
  datePreset: "tracker",
  customFrom: null,
  customTo: null,
  categories: [],
  accounts: [],
  paymentModes: [],
  types: [],
  minAmount: null,
  maxAmount: null,
  search: "",
};

export interface FilterRow {
  occurred_at: string;
  category: string;
  account_id: string | null;
  payment_mode: string | null;
  type: string;
  amount: number | string;
  currency: string;
  description: string | null;
}

/** Local midnight for a date, so "today" means the user's today. */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Parse a `YYYY-MM-DD` picker value as a LOCAL date.
 *
 * `new Date("2026-03-31")` parses as UTC midnight, which in IST is 05:30 on
 * the 31st — so combining it with the local-midnight helpers above shifted
 * every custom range by the UTC offset and quietly clipped a chunk of the
 * user's own last day. Every bound in this file is local, deliberately: the
 * relative presets ("today", "this week") can only mean the user's own clock.
 */
function parseDateOnlyLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

/** Monday-based week start, matching the Indian calendar convention in use. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Mon = 0
  return addDays(x, -day);
}

/**
 * The half-open [start, end) range a preset means.
 *
 * `tracker` resolves to the tracker's own window — start_date → end_date, or
 * start_date → now when it is open-ended. Returning `null` for either bound
 * means "unbounded on that side".
 */
export function trackerPresetRange(
  preset: TrackerDatePreset,
  tracker: { start_date: string; end_date: string | null },
  filter: Pick<TrackerFilter, "customFrom" | "customTo">,
  now: Date = new Date(),
): { start: Date | null; end: Date | null } {
  const today = startOfDay(now);
  switch (preset) {
    case "tracker": {
      const w = trackerDateWindow(tracker);
      return { start: w.start, end: w.end };
    }
    case "today":
      return { start: today, end: addDays(today, 1) };
    case "yesterday":
      return { start: addDays(today, -1), end: today };
    case "this_week": {
      const s = startOfWeek(now);
      return { start: s, end: addDays(s, 7) };
    }
    case "last_week": {
      const s = addDays(startOfWeek(now), -7);
      return { start: s, end: addDays(s, 7) };
    }
    case "this_month": {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: s, end: new Date(today.getFullYear(), today.getMonth() + 1, 1) };
    }
    case "last_month": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { start: s, end: new Date(today.getFullYear(), today.getMonth(), 1) };
    }
    case "custom": {
      const start = filter.customFrom ? parseDateOnlyLocal(filter.customFrom) : null;
      // The end date the user picked is INCLUSIVE, so the exclusive bound is
      // the next midnight. Off-by-one here silently hides the last day.
      const end = filter.customTo ? addDays(parseDateOnlyLocal(filter.customTo), 1) : null;
      return { start, end };
    }
    default:
      return { start: null, end: null };
  }
}

/** True when the filter would narrow anything at all. */
export function isTrackerFilterActive(f: TrackerFilter): boolean {
  return (
    f.datePreset !== "tracker" ||
    f.categories.length > 0 ||
    f.accounts.length > 0 ||
    f.paymentModes.length > 0 ||
    f.types.length > 0 ||
    f.minAmount !== null ||
    f.maxAmount !== null ||
    f.search.trim().length > 0
  );
}

/** How many distinct conditions are active — drives the "3 filters" badge. */
export function activeFilterCount(f: TrackerFilter): number {
  let n = 0;
  if (f.datePreset !== "tracker") n += 1;
  if (f.categories.length) n += 1;
  if (f.accounts.length) n += 1;
  if (f.paymentModes.length) n += 1;
  if (f.types.length) n += 1;
  if (f.minAmount !== null || f.maxAmount !== null) n += 1;
  if (f.search.trim()) n += 1;
  return n;
}

/**
 * Apply every active condition. Empty arrays mean "no constraint", never
 * "match nothing" — the difference between a filter nobody set and a filter
 * that hides everything.
 *
 * Amount comparisons go through `toINR` so a threshold means one thing across
 * a mixed-currency tracker; `search` covers description and category, matching
 * what ExpenseLedger's search already looks at.
 */
export function applyTrackerFilters<T extends FilterRow>(
  rows: readonly T[],
  filter: TrackerFilter,
  tracker: { start_date: string; end_date: string | null },
  now: Date = new Date(),
): T[] {
  const { start, end } = trackerPresetRange(filter.datePreset, tracker, filter, now);
  const cats = filter.categories.length ? new Set(filter.categories) : null;
  const accts = filter.accounts.length ? new Set(filter.accounts) : null;
  const modes = filter.paymentModes.length ? new Set(filter.paymentModes) : null;
  const types = filter.types.length ? new Set(filter.types) : null;
  const q = filter.search.trim().toLowerCase();

  return rows.filter((r) => {
    const at = new Date(r.occurred_at).getTime();
    if (!Number.isFinite(at)) return false;
    if (start && at < start.getTime()) return false;
    if (end && at >= end.getTime()) return false;

    if (cats && !cats.has(r.category)) return false;
    if (accts && !accts.has(r.account_id ?? "__none__")) return false;
    if (modes && !modes.has(r.payment_mode ?? "__none__")) return false;
    if (types && !types.has(r.type)) return false;

    if (filter.minAmount !== null || filter.maxAmount !== null) {
      const inr = toINR(Number(r.amount) || 0, r.currency);
      if (filter.minAmount !== null && inr < filter.minAmount) return false;
      if (filter.maxAmount !== null && inr > filter.maxAmount) return false;
    }

    if (q) {
      const hay = `${r.description ?? ""} ${r.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * A saved view: a named filter.
 *
 * Deliberately just a stored `TrackerFilter` and a name — not a query
 * builder. The spec's examples ("Labour", "Cash Payments", "Payments Above
 * ₹10,000") are all expressible as one of these, and a general expression
 * engine would be a feature nobody asked for with a UI nobody wants.
 */
export interface SavedTrackerView {
  id: string;
  name: string;
  filter: TrackerFilter;
}

export const MAX_SAVED_VIEWS = 12;

/** Normalise a stored view, tolerating anything an older build wrote. */
export function normaliseView(raw: unknown): SavedTrackerView | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<SavedTrackerView>;
  if (typeof v.id !== "string" || typeof v.name !== "string") return null;
  return {
    id: v.id,
    name: v.name,
    filter: { ...EMPTY_TRACKER_FILTER, ...(v.filter ?? {}) },
  };
}

export function normaliseViews(raw: unknown): SavedTrackerView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normaliseView).filter((v): v is SavedTrackerView => v !== null);
}
