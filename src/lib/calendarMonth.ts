import { toINR } from "@/lib/finance";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * Calendar view — the month grid and its per-day roll-up.
 *
 * Pure and database-free so it can be unit-tested: every figure the Calendar
 * page shows is derived here, in one place, the same way `deriveSummary` backs
 * the dashboard. Totals are converted to INR through `toINR` for the same
 * reason the dashboard does — `src/lib/finance.ts` is the single FX source.
 *
 * A `transfer` moves money between the user's own accounts; it is counted for
 * the row badge but kept out of income / expense / net, matching every other
 * aggregate in the app (see the note on `TxnType`).
 */

export type WeekStart = 0 | 1; // Sunday | Monday

export interface DayCell {
  /** Local midnight for this cell. */
  date: Date;
  /** `YYYY-MM-DD` in local time — the stable key for selection and grouping. */
  key: string;
  /** False for the leading / trailing days borrowed from the adjacent month. */
  inMonth: boolean;
  isToday: boolean;
  /** INR-converted totals for the transactions that fall on this day. */
  income: number;
  expense: number;
  net: number;
  /** Rows on this day, transfers included. */
  count: number;
  transfers: number;
}

export interface MonthView {
  year: number;
  /** 0-11. */
  month: number;
  /** 4-6 rows of exactly 7 cells, ready to render. */
  weeks: DayCell[][];
  /** The in-month cells only, first to last. */
  monthDays: DayCell[];
  totals: { income: number; expense: number; net: number; count: number };
  /** In-month day with the largest expense, or null when nothing was spent. */
  busiestDay: DayCell | null;
}

const DAY_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` for a Date, read in local time. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * First and last day shown for a month, including the spill-over from the
 * neighbouring months that fills the grid's corners. The Calendar hook fetches
 * exactly this window so those borrowed cells carry real figures rather than
 * rendering as deceptively empty.
 */
export function monthGridRange(
  year: number,
  month: number,
  weekStartsOn: WeekStart = 1,
): { start: Date; end: Date } {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(year, month, 1 - lead);

  const last = new Date(year, month + 1, 0);
  const trail = 6 - ((last.getDay() - weekStartsOn + 7) % 7);
  const end = new Date(year, month + 1, 0 + trail);

  return { start, end };
}

/**
 * Group transactions by local day. Exposed for the day-detail panel, which
 * needs the rows themselves rather than the totals.
 */
export function groupByDay(txns: readonly Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const t of txns) {
    const key = dayKey(new Date(t.occurred_at));
    const bucket = map.get(key);
    if (bucket) bucket.push(t);
    else map.set(key, [t]);
  }
  return map;
}

export function buildMonthView(
  year: number,
  month: number,
  txns: readonly Transaction[],
  opts: { weekStartsOn?: WeekStart; now?: Date } = {},
): MonthView {
  const weekStartsOn = opts.weekStartsOn ?? 1;
  const now = opts.now ?? new Date();
  const todayKey = dayKey(now);

  const byDay = groupByDay(txns);
  const { start } = monthGridRange(year, month, weekStartsOn);
  const last = new Date(year, month + 1, 0);

  const cellFor = (date: Date): DayCell => {
    const key = dayKey(date);
    const rows = byDay.get(key) ?? [];
    let income = 0;
    let expense = 0;
    let transfers = 0;
    for (const t of rows) {
      const inr = toINR(Number(t.amount), t.currency);
      if (t.type === "income") income += inr;
      else if (t.type === "expense") expense += inr;
      else transfers += 1;
    }
    return {
      date,
      key,
      inMonth: date.getMonth() === month && date.getFullYear() === year,
      isToday: key === todayKey,
      income,
      expense,
      net: income - expense,
      count: rows.length,
      transfers,
    };
  };

  const weeks: DayCell[][] = [];
  const cursor = startOfDay(start);
  // Emit whole weeks until the month is exhausted and the final week is full.
  // Capped at 6 rows — the most any month can occupy.
  while (weeks.length < 6) {
    const week: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cellFor(new Date(cursor)));
      cursor.setTime(cursor.getTime() + DAY_MS);
    }
    weeks.push(week);
    if (cursor.getTime() > last.getTime()) break;
  }

  const monthDays = weeks.flat().filter((c) => c.inMonth);

  const totals = monthDays.reduce(
    (acc, c) => {
      acc.income += c.income;
      acc.expense += c.expense;
      acc.count += c.count;
      return acc;
    },
    { income: 0, expense: 0, net: 0, count: 0 },
  );
  totals.net = totals.income - totals.expense;

  const busiestDay =
    monthDays.reduce<DayCell | null>((best, c) => {
      if (c.expense <= 0) return best;
      return !best || c.expense > best.expense ? c : best;
    }, null) ?? null;

  return { year, month, weeks, monthDays, totals, busiestDay };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

/** Weekday headers in the grid's order. */
export function weekdayLabels(weekStartsOn: WeekStart = 1): string[] {
  const base = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [...base.slice(weekStartsOn), ...base.slice(0, weekStartsOn)];
}

/** Step one month, normalising the year. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
