import { describe, it, expect } from "vitest";
import { toINR } from "@/lib/finance";
import {
  TRACKER_TYPES,
  foldTrackerSpend,
  isHistoricalTracker,
  isWithinTrackerWindow,
  trackerDateWindow,
  trackerDisplayLabel,
  breakdownSlices,
  type Tracker,
  type TrackerSpendRow,
} from "./trackers";

/**
 * Invariant tests for the tracker arithmetic.
 *
 * The style follows budgetBuckets.test.ts: assert properties that must hold
 * for ANY input, not a handful of worked examples. The failures worth
 * catching here are the quiet ones — a total that silently drops rows, a
 * tracker that absorbs another's spend, a NaN rendered as "₹NaN".
 */

const tracker = (o: Partial<Tracker> & Pick<Tracker, "id">): Tracker => ({
  user_id: "u",
  tenant_id: "t",
  name: "Home Construction",
  type: "Home Construction",
  start_date: "2026-01-01",
  end_date: null,
  budget: null,
  currency: "INR",
  description: null,
  status: "active",
  completed_at: null,
  archived_at: null,
  deleted_at: null,
  reviewed_at: null,
  created_at: "2026-08-27T00:00:00.000Z",
  updated_at: "2026-08-27T00:00:00.000Z",
  ...o,
});

const row = (o: Partial<TrackerSpendRow> & Pick<TrackerSpendRow, "tracker_id">): TrackerSpendRow => ({
  type: "expense",
  currency: "INR",
  total: 0,
  count: 0,
  first_at: "2026-01-01T00:00:00.000Z",
  last_at: "2026-01-01T00:00:00.000Z",
  ...o,
});

describe("foldTrackerSpend", () => {
  it("conserves money: every expense row lands on exactly one tracker", () => {
    const trackers = [tracker({ id: "a" }), tracker({ id: "b", name: "Wedding" })];
    const rows = [
      row({ tracker_id: "a", total: 18600, count: 1 }),
      row({ tracker_id: "a", total: 12500, count: 1 }),
      row({ tracker_id: "b", total: 4200, count: 3 }),
    ];
    const folded = foldTrackerSpend(trackers, rows);
    const totalFolded = folded.reduce((s, t) => s + t.derivedSpent, 0);
    const totalRaw = rows.reduce((s, r) => s + toINR(r.total, r.currency), 0);
    expect(totalFolded).toBe(totalRaw);
  });

  it("never folds an unknown tracker's rows into some other tracker", () => {
    const folded = foldTrackerSpend(
      [tracker({ id: "a" })],
      [row({ tracker_id: "ghost", total: 99999, count: 5 })],
    );
    expect(folded[0].derivedSpent).toBe(0);
    expect(folded[0].txnCount).toBe(0);
  });

  it("keeps income separate from spend rather than netting it", () => {
    const folded = foldTrackerSpend(
      [tracker({ id: "a" })],
      [
        row({ tracker_id: "a", type: "expense", total: 1000, count: 1 }),
        row({ tracker_id: "a", type: "income", total: 400, count: 1 }),
      ],
    );
    // A refund must not make the build look cheaper than it was.
    expect(folded[0].derivedSpent).toBe(1000);
    expect(folded[0].inflow).toBe(400);
  });

  it("ignores transfers, as every other aggregate in the app does", () => {
    const folded = foldTrackerSpend(
      [tracker({ id: "a" })],
      [row({ tracker_id: "a", type: "transfer", total: 50000, count: 1 })],
    );
    expect(folded[0].derivedSpent).toBe(0);
    expect(folded[0].inflow).toBe(0);
  });

  it("converts foreign currency through the one FX implementation", () => {
    const folded = foldTrackerSpend(
      [tracker({ id: "a" })],
      [row({ tracker_id: "a", currency: "AED", total: 1000, count: 1 })],
    );
    expect(folded[0].derivedSpent).toBe(toINR(1000, "AED"));
  });

  it("gives a tracker with no rows a real zero, never NaN", () => {
    const folded = foldTrackerSpend([tracker({ id: "a" })], []);
    expect(folded[0].derivedSpent).toBe(0);
    expect(folded[0].txnCount).toBe(0);
    expect(folded[0].utilization).toBe(0);
    expect(folded[0].remaining).toBeNull();
  });

  it("survives null and undefined rows", () => {
    expect(foldTrackerSpend([tracker({ id: "a" })], null)[0].derivedSpent).toBe(0);
    expect(foldTrackerSpend([tracker({ id: "a" })], undefined)[0].derivedSpent).toBe(0);
  });

  it("reports no budget as remaining:null, which is not the same as zero", () => {
    const noBudget = foldTrackerSpend([tracker({ id: "a", budget: null })], [])[0];
    const zeroBudget = foldTrackerSpend([tracker({ id: "b", budget: 0 })], [])[0];
    // Absent is not "spent in full" — the UI keys off null to say "No budget set".
    expect(noBudget.remaining).toBeNull();
    expect(zeroBudget.remaining).toBeNull();
    expect(noBudget.utilization).toBe(0);
    expect(zeroBudget.utilization).toBe(0);
  });

  it("computes utilization and remaining against a real budget", () => {
    const folded = foldTrackerSpend(
      [tracker({ id: "a", budget: 4000000 })],
      [row({ tracker_id: "a", total: 284500, count: 12 })],
    );
    expect(folded[0].utilization).toBe(7); // 7.1% rounded
    expect(folded[0].remaining).toBe(4000000 - 284500);
    expect(folded[0].txnCount).toBe(12);
  });

  it("lets remaining go negative rather than lying about an overrun", () => {
    const folded = foldTrackerSpend(
      [tracker({ id: "a", budget: 1000 })],
      [row({ tracker_id: "a", total: 1500, count: 1 })],
    );
    expect(folded[0].remaining).toBe(-500);
    expect(folded[0].utilization).toBe(150);
  });

  it("preserves every tracker, in order, whether or not it has spend", () => {
    const trackers = [tracker({ id: "a" }), tracker({ id: "b", name: "X" }), tracker({ id: "c", name: "Y" })];
    const folded = foldTrackerSpend(trackers, [row({ tracker_id: "b", total: 5, count: 1 })]);
    expect(folded.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});

describe("trackerDisplayLabel", () => {
  it("adds the T- prefix for display only", () => {
    expect(trackerDisplayLabel("Home Construction")).toBe("T-Home Construction");
  });

  it("never persists the prefix: stripping it returns the stored name", () => {
    for (const name of ["Home Construction", "Dubai Trip", "  Wedding  ", "T-Shirt Business"]) {
      expect(trackerDisplayLabel(name).slice(2)).toBe(name.trim());
    }
  });
});

describe("isHistoricalTracker", () => {
  it("is true when the project started before the tracker was created", () => {
    expect(
      isHistoricalTracker({ start_date: "2026-01-01", created_at: "2026-08-27T10:00:00.000Z" }),
    ).toBe(true);
  });

  it("is false when it starts the same day it was created", () => {
    expect(
      isHistoricalTracker({ start_date: "2026-08-27", created_at: "2026-08-27T10:00:00.000Z" }),
    ).toBe(false);
  });

  it("is false for a tracker starting in the future", () => {
    expect(
      isHistoricalTracker({ start_date: "2026-12-01", created_at: "2026-08-27T10:00:00.000Z" }),
    ).toBe(false);
  });
});

describe("trackerDateWindow / isWithinTrackerWindow", () => {
  it("treats the end date itself as inside the window", () => {
    const t = { start_date: "2026-01-01", end_date: "2026-01-31" };
    expect(isWithinTrackerWindow("2026-01-31T23:59:00.000Z", t)).toBe(true);
    expect(isWithinTrackerWindow("2026-02-01T00:00:00.000Z", t)).toBe(false);
  });

  it("is open-ended when there is no end date", () => {
    const t = { start_date: "2026-01-01", end_date: null };
    expect(trackerDateWindow(t).end).toBeNull();
    expect(isWithinTrackerWindow("2099-01-01T00:00:00.000Z", t)).toBe(true);
  });

  it("excludes anything before the start", () => {
    const t = { start_date: "2026-01-01", end_date: null };
    expect(isWithinTrackerWindow("2025-12-31T23:59:00.000Z", t)).toBe(false);
  });

  it("returns false for an unparseable date rather than throwing", () => {
    expect(isWithinTrackerWindow("not-a-date", { start_date: "2026-01-01", end_date: null })).toBe(false);
  });
});

describe("breakdownSlices", () => {
  const rows = [
    { amount: 82000, currency: "INR", type: "expense" as const },
    { amount: 124500, currency: "INR", type: "expense" as const },
    { amount: 32000, currency: "INR", type: "expense" as const },
    { amount: 500000, currency: "INR", type: "income" as const },
  ];
  const cats = ["Labour", "Materials", "Labour", "Salary"];

  it("sums by key and sorts largest first", () => {
    const slices = breakdownSlices(rows, (i) => cats[i]);
    expect(slices).toEqual([
      { name: "Labour", value: 114000 },
      { name: "Materials", value: 124500 },
    ].sort((a, b) => b.value - a.value));
  });

  it("counts expenses only, so income never appears as a spend slice", () => {
    const slices = breakdownSlices(rows, (i) => cats[i]);
    expect(slices.find((s) => s.name === "Salary")).toBeUndefined();
  });

  it("conserves the total across slices", () => {
    const slices = breakdownSlices(rows, (i) => cats[i]);
    const sliceTotal = slices.reduce((s, x) => s + x.value, 0);
    const expenseTotal = rows
      .filter((r) => r.type === "expense")
      .reduce((s, r) => s + toINR(Number(r.amount), r.currency), 0);
    expect(sliceTotal).toBe(expenseTotal);
  });

  it("is empty for no rows", () => {
    expect(breakdownSlices([], () => "x")).toEqual([]);
  });
});

describe("the tracker type vocabulary", () => {
  it("offers a Custom escape hatch, so no project is unrepresentable", () => {
    expect(TRACKER_TYPES).toContain("Custom");
  });

  it("has no duplicates", () => {
    expect(new Set(TRACKER_TYPES).size).toBe(TRACKER_TYPES.length);
  });
});
