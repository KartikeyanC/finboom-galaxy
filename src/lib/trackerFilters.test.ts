import { describe, it, expect } from "vitest";
import {
  EMPTY_TRACKER_FILTER,
  activeFilterCount,
  applyTrackerFilters,
  isTrackerFilterActive,
  normaliseViews,
  trackerPresetRange,
  type FilterRow,
  type TrackerFilter,
} from "./trackerFilters";

/**
 * Filtering invariants. The failures worth catching are the quiet ones: a
 * filter nobody set hiding everything, a custom range silently dropping its
 * last day, and an amount threshold meaning different things in different
 * currencies.
 */

const tracker = { start_date: "2026-01-01", end_date: "2026-12-31" };

const row = (o: Partial<FilterRow> & Pick<FilterRow, "occurred_at">): FilterRow => ({
  category: "Labour",
  account_id: "cash",
  payment_mode: "Cash",
  type: "expense",
  amount: 1000,
  currency: "INR",
  description: null,
  ...o,
});

const f = (o: Partial<TrackerFilter> = {}): TrackerFilter => ({ ...EMPTY_TRACKER_FILTER, ...o });

describe("an unset filter constrains nothing", () => {
  const rows = [
    row({ occurred_at: "2026-03-01T10:00:00.000Z" }),
    row({ occurred_at: "2026-07-15T10:00:00.000Z", category: "Materials" }),
  ];

  it("returns every row inside the tracker window by default", () => {
    expect(applyTrackerFilters(rows, f(), tracker)).toHaveLength(2);
  });

  it("treats an empty array as no constraint, not as match-nothing", () => {
    const filter = f({ categories: [], accounts: [], paymentModes: [], types: [] });
    expect(applyTrackerFilters(rows, filter, tracker)).toHaveLength(2);
  });

  it("reports itself as inactive", () => {
    expect(isTrackerFilterActive(f())).toBe(false);
    expect(activeFilterCount(f())).toBe(0);
  });
});

describe("the default range is the tracker's own window", () => {
  it("excludes rows outside the project's span", () => {
    const rows = [
      row({ occurred_at: "2025-12-31T10:00:00.000Z" }),
      row({ occurred_at: "2026-06-01T10:00:00.000Z" }),
      row({ occurred_at: "2027-02-01T10:00:00.000Z" }),
    ];
    expect(applyTrackerFilters(rows, f(), tracker)).toHaveLength(1);
  });

  it("is open-ended when the tracker has no end date", () => {
    const open = { start_date: "2026-01-01", end_date: null };
    const r = trackerPresetRange("tracker", open, f());
    expect(r.end).toBeNull();
  });
});

describe("custom ranges include the end date the user picked", () => {
  it("does not drop the final day", () => {
    // Local time on purpose: the bounds are local, so a UTC-suffixed instant
    // late on the 31st is a DIFFERENT day east of Greenwich and would make
    // this test assert something other than what it claims.
    const rows = [row({ occurred_at: "2026-03-31T23:30:00" })];
    const filter = f({ datePreset: "custom", customFrom: "2026-03-01", customTo: "2026-03-31" });
    // The classic off-by-one: an exclusive bound at 2026-03-31T00:00 would
    // hide everything the user did on the last day of their own range.
    expect(applyTrackerFilters(rows, filter, tracker)).toHaveLength(1);
  });

  it("is unbounded on a side the user left blank", () => {
    const r = trackerPresetRange("custom", tracker, { customFrom: null, customTo: null });
    expect(r.start).toBeNull();
    expect(r.end).toBeNull();
  });
});

describe("relative presets", () => {
  const now = new Date("2026-08-27T12:00:00");

  it("today and yesterday do not overlap", () => {
    const t = trackerPresetRange("today", tracker, f(), now);
    const y = trackerPresetRange("yesterday", tracker, f(), now);
    expect(y.end!.getTime()).toBe(t.start!.getTime());
  });

  it("last week ends exactly where this week begins", () => {
    const tw = trackerPresetRange("this_week", tracker, f(), now);
    const lw = trackerPresetRange("last_week", tracker, f(), now);
    expect(lw.end!.getTime()).toBe(tw.start!.getTime());
  });

  it("last month ends exactly where this month begins", () => {
    const tm = trackerPresetRange("this_month", tracker, f(), now);
    const lm = trackerPresetRange("last_month", tracker, f(), now);
    expect(lm.end!.getTime()).toBe(tm.start!.getTime());
  });

  it("every preset yields start before end", () => {
    for (const p of ["today", "yesterday", "this_week", "last_week", "this_month", "last_month"] as const) {
      const r = trackerPresetRange(p, tracker, f(), now);
      expect(r.start!.getTime()).toBeLessThan(r.end!.getTime());
    }
  });
});

describe("field filters", () => {
  const rows = [
    row({ occurred_at: "2026-03-01T10:00:00.000Z", category: "Labour", amount: 18600 }),
    row({ occurred_at: "2026-03-02T10:00:00.000Z", category: "Materials", amount: 12500, account_id: "sbi" }),
    row({ occurred_at: "2026-03-03T10:00:00.000Z", category: "Labour", amount: 400, payment_mode: "UPI" }),
  ];

  it("filters by category", () => {
    expect(applyTrackerFilters(rows, f({ categories: ["Labour"] }), tracker)).toHaveLength(2);
  });

  it("filters by account", () => {
    expect(applyTrackerFilters(rows, f({ accounts: ["sbi"] }), tracker)).toHaveLength(1);
  });

  it("filters by payment mode", () => {
    expect(applyTrackerFilters(rows, f({ paymentModes: ["UPI"] }), tracker)).toHaveLength(1);
  });

  it("filters by amount, the spec's 'above ₹10,000' case", () => {
    expect(applyTrackerFilters(rows, f({ minAmount: 10000 }), tracker)).toHaveLength(2);
  });

  it("compares amounts in INR so a threshold means one thing", () => {
    const mixed = [
      row({ occurred_at: "2026-03-01T10:00:00.000Z", amount: 100, currency: "AED" }), // ₹2,270
      row({ occurred_at: "2026-03-02T10:00:00.000Z", amount: 100, currency: "INR" }), // ₹100
    ];
    expect(applyTrackerFilters(mixed, f({ minAmount: 1000 }), tracker)).toHaveLength(1);
  });

  it("searches description and category together", () => {
    const withDesc = [
      row({ occurred_at: "2026-03-01T10:00:00.000Z", description: "Cement bags", category: "Materials" }),
      row({ occurred_at: "2026-03-02T10:00:00.000Z", description: "Wages", category: "Labour" }),
    ];
    expect(applyTrackerFilters(withDesc, f({ search: "cement" }), tracker)).toHaveLength(1);
    expect(applyTrackerFilters(withDesc, f({ search: "labour" }), tracker)).toHaveLength(1);
  });

  it("combines conditions with AND", () => {
    const filter = f({ categories: ["Labour"], minAmount: 10000 });
    expect(applyTrackerFilters(rows, filter, tracker)).toHaveLength(1);
  });

  it("never returns a row that fails any single condition", () => {
    const filter = f({ categories: ["Materials"], accounts: ["cash"] });
    // Materials is on sbi, so nothing satisfies both.
    expect(applyTrackerFilters(rows, filter, tracker)).toEqual([]);
  });

  it("drops a row with an unparseable date rather than throwing", () => {
    expect(applyTrackerFilters([row({ occurred_at: "nonsense" })], f(), tracker)).toEqual([]);
  });
});

describe("filtering never mutates its input", () => {
  it("leaves the source array untouched", () => {
    const rows = [row({ occurred_at: "2026-03-01T10:00:00.000Z" })];
    const before = JSON.stringify(rows);
    applyTrackerFilters(rows, f({ categories: ["Nothing"] }), tracker);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("saved views survive whatever is in storage", () => {
  it("ignores junk instead of crashing the page", () => {
    expect(normaliseViews(null)).toEqual([]);
    expect(normaliseViews("nope")).toEqual([]);
    expect(normaliseViews([null, 3, { name: "no id" }, { id: "x" }])).toEqual([]);
  });

  it("backfills missing filter fields from the empty default", () => {
    const [v] = normaliseViews([{ id: "a", name: "Labour", filter: { categories: ["Labour"] } }]);
    expect(v.filter.categories).toEqual(["Labour"]);
    // A view saved before a field existed must not read as undefined.
    expect(v.filter.datePreset).toBe("tracker");
    expect(v.filter.minAmount).toBeNull();
  });
});
