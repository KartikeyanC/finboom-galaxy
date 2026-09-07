import { dayKey } from "@/lib/calendarMonth";

/**
 * Calendar — the non-transaction records that also land on a day.
 *
 * The grid's bars and the month totals stay income/expense only: those are the
 * money that actually moved. But a workspace also records things that belong on
 * a date without being a ledger entry — an investment logged, a budget set for
 * a month, a goal's target date, an insurance premium coming due. The Calendar
 * surfaces those as read-only markers so "everything I added" really is in one
 * place; each one links back to the page that owns it.
 *
 * Pure and hook-free so the mapping is unit-tested. `useMonthEvents` supplies
 * the rows (and drops any module the plan does not include).
 */

export type CalendarEventKind = "investment" | "budget" | "goal" | "insurance";

export interface CalendarEvent {
  /** Stable, unique across kinds — `${kind}-${sourceId}`. */
  id: string;
  kind: CalendarEventKind;
  /** `YYYY-MM-DD`, local. */
  dateKey: string;
  title: string;
  /** Null when the source has no single meaningful figure. */
  amount: number | null;
  currency: string;
  /** The page that owns this record. */
  href: string;
}

export const EVENT_META: Record<
  CalendarEventKind,
  { label: string; href: string; verb: string; dot: string }
> = {
  investment: { label: "Investment", href: "/app/investments", verb: "logged", dot: "bg-violet-400" },
  budget: { label: "Budget", href: "/app/budget", verb: "set", dot: "bg-amber-400" },
  goal: { label: "Goal", href: "/app/goals", verb: "target", dot: "bg-primary" },
  insurance: { label: "Insurance", href: "/app/insurance", verb: "premium due", dot: "bg-sky-400" },
};

/** The kinds in the order the grid and legend show their dots. */
export const EVENT_KINDS = Object.keys(EVENT_META) as CalendarEventKind[];

/**
 * A day key from either a date-only string (`2026-09-01`, taken as that local
 * calendar day) or a full timestamp (converted in local time, like the ledger).
 * Returns "" for anything unparseable so the caller can drop it.
 */
export function toDayKey(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? "" : dayKey(d);
}

export function groupEventsByDay(
  events: readonly CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!e.dateKey) continue;
    const bucket = map.get(e.dateKey);
    if (bucket) bucket.push(e);
    else map.set(e.dateKey, [e]);
  }
  // Stable order within a day: by kind, then title.
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
  }
  return map;
}

/** Inclusive-range filter on `YYYY-MM-DD` keys — lexical compare is date order. */
export function eventsInRange(
  events: readonly CalendarEvent[],
  startKey: string,
  endKey: string,
): CalendarEvent[] {
  return events.filter((e) => e.dateKey >= startKey && e.dateKey <= endKey);
}
