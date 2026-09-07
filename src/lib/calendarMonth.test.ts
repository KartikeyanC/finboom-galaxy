import { describe, it, expect } from "vitest";
import {
  buildMonthView,
  dayKey,
  groupByDay,
  monthGridRange,
  shiftMonth,
  weekdayLabels,
} from "./calendarMonth";
import type { Transaction } from "@/hooks/useTransactions";

function txn(partial: Partial<Transaction> & Pick<Transaction, "type" | "amount" | "occurred_at">): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: "u",
    tenant_id: "t",
    currency: "INR",
    category: "Other",
    description: null,
    account_id: null,
    payment_mode: null,
    transfer_to_account_id: null,
    tracker_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  } as Transaction;
}

describe("dayKey", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 10, 30))).toBe("2026-11-30");
  });
});

describe("monthGridRange", () => {
  it("pads to whole weeks around March 2026 (Monday start)", () => {
    // 1 Mar 2026 is a Sunday; Monday-start grid begins the preceding Monday.
    const { start, end } = monthGridRange(2026, 2, 1);
    expect(dayKey(start)).toBe("2026-02-23");
    expect(dayKey(end)).toBe("2026-04-05");
    // Whole number of weeks.
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    expect(days % 7).toBe(0);
  });

  it("honours a Sunday start", () => {
    const { start } = monthGridRange(2026, 2, 0);
    expect(dayKey(start)).toBe("2026-03-01");
  });
});

describe("weekdayLabels", () => {
  it("rotates to the configured first day", () => {
    expect(weekdayLabels(1)[0]).toBe("Mon");
    expect(weekdayLabels(0)[0]).toBe("Sun");
    expect(weekdayLabels(1)).toHaveLength(7);
  });
});

describe("shiftMonth", () => {
  it("rolls the year over both ways", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });
});

describe("groupByDay", () => {
  it("buckets by local calendar day", () => {
    const rows = [
      txn({ type: "expense", amount: 10, occurred_at: new Date(2026, 4, 1, 9).toISOString() }),
      txn({ type: "expense", amount: 20, occurred_at: new Date(2026, 4, 1, 22).toISOString() }),
      txn({ type: "income", amount: 5, occurred_at: new Date(2026, 4, 2, 8).toISOString() }),
    ];
    const g = groupByDay(rows);
    expect(g.get("2026-05-01")).toHaveLength(2);
    expect(g.get("2026-05-02")).toHaveLength(1);
  });
});

describe("buildMonthView", () => {
  const now = new Date(2026, 4, 15, 12); // 15 May 2026

  it("lays out a 7-wide grid that contains every day of the month", () => {
    const view = buildMonthView(2026, 4, [], { now });
    for (const week of view.weeks) expect(week).toHaveLength(7);
    expect(view.monthDays).toHaveLength(31);
    expect(view.monthDays[0].key).toBe("2026-05-01");
    expect(view.monthDays.at(-1)?.key).toBe("2026-05-31");
  });

  it("marks today and the borrowed neighbouring days", () => {
    const view = buildMonthView(2026, 4, [], { now });
    const today = view.weeks.flat().find((c) => c.isToday);
    expect(today?.key).toBe("2026-05-15");
    const borrowed = view.weeks.flat().filter((c) => !c.inMonth);
    expect(borrowed.length).toBeGreaterThan(0);
    expect(borrowed.every((c) => c.count === 0)).toBe(true);
  });

  it("rolls income and expense per day and for the month, in INR", () => {
    const rows = [
      txn({ type: "income", amount: 1000, occurred_at: new Date(2026, 4, 1, 10).toISOString() }),
      txn({ type: "expense", amount: 200, occurred_at: new Date(2026, 4, 1, 12).toISOString() }),
      txn({ type: "expense", amount: 50, occurred_at: new Date(2026, 4, 10, 12).toISOString() }),
      // USD converts via the finance FX table (83.5), not counted 1:1.
      txn({ type: "expense", amount: 1, currency: "USD", occurred_at: new Date(2026, 4, 10, 13).toISOString() }),
      // A transfer is visible as a count but never in the money totals.
      txn({ type: "transfer", amount: 999, occurred_at: new Date(2026, 4, 10, 14).toISOString() }),
    ];
    const view = buildMonthView(2026, 4, rows, { now });

    const d1 = view.monthDays.find((c) => c.key === "2026-05-01")!;
    expect(d1.income).toBe(1000);
    expect(d1.expense).toBe(200);
    expect(d1.net).toBe(800);
    expect(d1.count).toBe(2);

    const d10 = view.monthDays.find((c) => c.key === "2026-05-10")!;
    expect(d10.expense).toBeCloseTo(50 + 83.5, 2);
    expect(d10.transfers).toBe(1);
    expect(d10.count).toBe(3);

    expect(view.totals.income).toBe(1000);
    expect(view.totals.expense).toBeCloseTo(250 + 83.5, 2);
    expect(view.totals.net).toBeCloseTo(1000 - (250 + 83.5), 2);
    expect(view.totals.count).toBe(5);
  });

  it("picks the busiest day by spend, ignoring days with none", () => {
    const rows = [
      txn({ type: "expense", amount: 10, occurred_at: new Date(2026, 4, 2, 12).toISOString() }),
      txn({ type: "expense", amount: 400, occurred_at: new Date(2026, 4, 9, 12).toISOString() }),
      txn({ type: "income", amount: 9999, occurred_at: new Date(2026, 4, 20, 12).toISOString() }),
    ];
    const view = buildMonthView(2026, 4, rows, { now });
    expect(view.busiestDay?.key).toBe("2026-05-09");
  });

  it("has no busiest day when nothing was spent", () => {
    const view = buildMonthView(2026, 4, [
      txn({ type: "income", amount: 5, occurred_at: new Date(2026, 4, 3, 12).toISOString() }),
    ], { now });
    expect(view.busiestDay).toBeNull();
  });
});
