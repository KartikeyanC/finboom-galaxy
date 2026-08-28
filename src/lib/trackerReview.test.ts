import { describe, it, expect } from "vitest";
import {
  candidateCategories,
  endExclusive,
  filterReviewCandidates,
  selectAllShown,
  selectableCandidates,
  selectionSummary,
  toggleSelection,
  type ReviewCandidate,
} from "./trackerReview";

/**
 * The review flow's job is to offer, never to decide. These tests are mostly
 * about what the code must REFUSE to do: assign anything on its own, take a
 * row that belongs to another tracker, or let a filter change quietly alter
 * what is about to be written.
 */

const row = (o: Partial<ReviewCandidate> & Pick<ReviewCandidate, "id">): ReviewCandidate => ({
  tracker_id: null,
  occurred_at: "2026-03-15T10:00:00.000Z",
  amount: 1000,
  currency: "INR",
  category: "Materials",
  description: null,
  type: "expense",
  ...o,
});

const tracker = { start_date: "2026-01-01", end_date: "2026-12-31" };

describe("selectableCandidates", () => {
  it("NEVER offers a row that already belongs to a tracker", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", tracker_id: "some-other-tracker" }),
      row({ id: "c", tracker_id: "even-this-same-one" }),
    ];
    expect(selectableCandidates(rows, tracker).map((r) => r.id)).toEqual(["a"]);
  });

  it("holds that rule for any input, including an all-tagged list", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ id: `t${i}`, tracker_id: `trk-${i}` }),
    );
    expect(selectableCandidates(rows, tracker)).toEqual([]);
  });

  it("excludes rows outside the tracker's window", () => {
    const rows = [
      row({ id: "before", occurred_at: "2025-12-31T23:00:00.000Z" }),
      row({ id: "inside", occurred_at: "2026-06-01T10:00:00.000Z" }),
      row({ id: "after", occurred_at: "2027-01-01T00:00:00.000Z" }),
    ];
    expect(selectableCandidates(rows, tracker).map((r) => r.id)).toEqual(["inside"]);
  });

  it("includes the end date itself", () => {
    const rows = [row({ id: "last", occurred_at: "2026-12-31T23:59:00.000Z" })];
    expect(selectableCandidates(rows, tracker)).toHaveLength(1);
  });

  it("is open-ended when the tracker has no end date", () => {
    const rows = [row({ id: "far", occurred_at: "2099-01-01T00:00:00.000Z" })];
    expect(selectableCandidates(rows, { start_date: "2026-01-01", end_date: null })).toHaveLength(1);
  });
});

describe("nothing is ever selected on its own", () => {
  it("summarises an empty selection as zero — the default state", () => {
    const rows = [row({ id: "a", amount: 5000 }), row({ id: "b", amount: 9000 })];
    const s = selectionSummary(rows, new Set());
    expect(s.count).toBe(0);
    expect(s.totalINR).toBe(0);
  });

  it("counts only what is explicitly selected", () => {
    const rows = [row({ id: "a", amount: 5000 }), row({ id: "b", amount: 9000 })];
    const s = selectionSummary(rows, new Set(["a"]));
    expect(s.count).toBe(1);
    expect(s.totalINR).toBe(5000);
  });

  it("ignores a selected id that is not in the rows", () => {
    const s = selectionSummary([row({ id: "a", amount: 100 })], new Set(["a", "ghost"]));
    expect(s.count).toBe(1);
    expect(s.totalINR).toBe(100);
  });

  it("converts foreign currency through the one FX implementation", () => {
    const s = selectionSummary(
      [row({ id: "a", amount: 100, currency: "AED" })],
      new Set(["a"]),
    );
    expect(s.totalINR).toBe(2270); // 100 * 22.7
  });
});

describe("toggleSelection", () => {
  it("is its own inverse", () => {
    const start = new Set(["a", "b"]);
    expect(toggleSelection(toggleSelection(start, "c"), "c")).toEqual(start);
    expect(toggleSelection(toggleSelection(start, "a"), "a")).toEqual(start);
  });

  it("never mutates the set it is given", () => {
    const start = new Set(["a"]);
    toggleSelection(start, "b");
    expect([...start]).toEqual(["a"]);
  });
});

describe("filtering changes what is shown, never what is selected", () => {
  const rows = [
    row({ id: "a", category: "Labour", amount: 18600 }),
    row({ id: "b", category: "Materials", amount: 12500 }),
    row({ id: "c", category: "Labour", amount: 400 }),
  ];

  it("narrows by category", () => {
    expect(filterReviewCandidates(rows, { categories: ["Labour"] }).map((r) => r.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("narrows by minimum amount", () => {
    expect(filterReviewCandidates(rows, { minAmount: 10000 }).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("returns everything when no filter is set", () => {
    expect(filterReviewCandidates(rows, {})).toHaveLength(3);
    expect(filterReviewCandidates(rows, { categories: [] })).toHaveLength(3);
  });

  it("leaves an existing selection completely untouched", () => {
    // The user selects a row, then filters it out of view. It must still be
    // selected — hiding is not deselecting, and silently dropping it would
    // change what gets written without anyone saying so.
    const selected = new Set(["c"]);
    const shown = filterReviewCandidates(rows, { minAmount: 10000 });
    expect(shown.find((r) => r.id === "c")).toBeUndefined();
    expect(selectionSummary(rows, selected).count).toBe(1);
  });
});

describe("selectAllShown", () => {
  const rows = [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })];

  it("can only ever reach rows the user can see", () => {
    const shown = rows.slice(0, 2);
    const next = selectAllShown(new Set(), shown);
    expect([...next].sort()).toEqual(["a", "b"]);
    expect(next.has("c")).toBe(false);
  });

  it("adds to an existing selection rather than replacing it", () => {
    const next = selectAllShown(new Set(["c"]), rows.slice(0, 1));
    expect([...next].sort()).toEqual(["a", "c"]);
  });
});

describe("candidateCategories", () => {
  it("lists each category once, sorted", () => {
    const rows = [
      row({ id: "a", category: "Materials" }),
      row({ id: "b", category: "Labour" }),
      row({ id: "c", category: "Labour" }),
    ];
    expect(candidateCategories(rows)).toEqual(["Labour", "Materials"]);
  });
});

describe("endExclusive", () => {
  it("is the day after the end date, so the end date is included", () => {
    expect(endExclusive({ end_date: "2026-12-31" })).toBe("2027-01-01T00:00:00.000Z");
  });

  it("is now when the tracker is open-ended", () => {
    const before = Date.now();
    const at = new Date(endExclusive({ end_date: null })).getTime();
    expect(at).toBeGreaterThanOrEqual(before - 1000);
  });
});
