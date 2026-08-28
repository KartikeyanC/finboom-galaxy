import { toINR } from "@/lib/finance";
import { isWithinTrackerWindow } from "@/lib/trackers";

/**
 * Historical transaction review — the pure core.
 *
 * When someone creates "Home Construction" in August for a build that started
 * in March, the transactions already exist. This offers them for review.
 *
 * 🔴 THE INVARIANT THIS FILE EXISTS TO DEFEND: nothing is EVER assigned
 * without an explicit click. The selection starts empty and stays empty until
 * a person acts. There is no suggestion engine here, no "we found 40
 * transactions that look like construction", no pre-ticked checkbox, no
 * silent backfill — because a wrong guess re-categorises real financial
 * history that the user then has to find and undo, and they will not know it
 * happened. Filtering changes what is SHOWN; it never changes what is
 * SELECTED. Those are different verbs and the tests hold them apart.
 */

export interface ReviewCandidate {
  id: string;
  tracker_id?: string | null;
  occurred_at: string;
  amount: number | string;
  currency: string;
  category: string;
  description: string | null;
  type: string;
}

export interface ReviewFilters {
  categories?: string[];
  minAmount?: number;
}

/**
 * Rows that may legitimately be offered for assignment.
 *
 * Two rules, both about not taking what is not ours: a row already tagged to
 * ANY tracker is never offered (assigning it would silently move it out of
 * whatever project it is already counted in), and a row outside the tracker's
 * own date window is not offered here either — the window is what the user
 * said the project spans, and it is the only honest basis for showing them a
 * pre-filtered list they did not choose.
 */
export function selectableCandidates<T extends ReviewCandidate>(
  rows: readonly T[],
  tracker: { start_date: string; end_date: string | null },
): T[] {
  return rows.filter((r) => {
    if (r.tracker_id) return false;
    return isWithinTrackerWindow(r.occurred_at, tracker);
  });
}

/**
 * Narrow what is DISPLAYED. Deliberately independent of the selection: a user
 * who selects three rows, then changes the filter, still has those three
 * selected — hiding a row is not the same as deselecting it, and quietly
 * dropping selections on a filter change is how people assign things they
 * never meant to.
 */
export function filterReviewCandidates<T extends ReviewCandidate>(
  rows: readonly T[],
  filters: ReviewFilters,
): T[] {
  const cats = filters.categories?.length ? new Set(filters.categories) : null;
  const min = Number.isFinite(filters.minAmount) ? Number(filters.minAmount) : null;
  return rows.filter((r) => {
    if (cats && !cats.has(r.category)) return false;
    if (min !== null && toINR(Number(r.amount) || 0, r.currency) < min) return false;
    return true;
  });
}

/** Toggle one id. Returns a new Set — never mutates the argument. */
export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Add every currently-shown row to the selection.
 *
 * "Select all SHOWN", not "select all" — it operates on the filtered list the
 * user is looking at, so it can never reach a row they cannot see.
 */
export function selectAllShown(
  selected: ReadonlySet<string>,
  shown: readonly ReviewCandidate[],
): Set<string> {
  const next = new Set(selected);
  for (const r of shown) next.add(r.id);
  return next;
}

/** What the footer reports before the user commits. */
export function selectionSummary(
  rows: readonly ReviewCandidate[],
  selected: ReadonlySet<string>,
): { count: number; totalINR: number } {
  let count = 0;
  let totalINR = 0;
  for (const r of rows) {
    if (!selected.has(r.id)) continue;
    count += 1;
    totalINR += toINR(Number(r.amount) || 0, r.currency);
  }
  return { count, totalINR };
}

/** The distinct categories present, for the filter chips. */
export function candidateCategories(rows: readonly ReviewCandidate[]): string[] {
  return [...new Set(rows.map((r) => r.category))].sort();
}

/**
 * The exclusive end of the candidate query's date range.
 *
 * `end_date + 1 day` so the end date itself is included, matching
 * `trackerDateWindow`'s half-open convention; today when the tracker is
 * open-ended.
 */
export function endExclusive(tracker: { end_date: string | null }): string {
  if (!tracker.end_date) return new Date().toISOString();
  const d = new Date(`${tracker.end_date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
