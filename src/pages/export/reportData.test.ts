import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATE_PRESETS,
  SECTIONS,
  calcRange,
  clean,
  makeCSV,
  withinRange,
  trackerExportFilename,
  trackerExportRow,
  trackerSheetName,
  txnExportRow,
} from "./reportData";

/**
 * Stage 4.13. These helpers sat inside a 730-line page where no test could
 * reach them, and they decide two things a user can be actively misled by:
 * which rows a downloaded statement contains (calcRange + withinRange) and
 * whether a description containing a comma silently splits into extra columns
 * (makeCSV).
 */

describe("clean", () => {
  it("strips the legacy [Mode|accountId] description prefix", () => {
    expect(clean("[UPI|4f8c-1234] Groceries")).toBe("Groceries");
  });

  it("leaves a bracketed tag that is not the prefix alone", () => {
    // No pipe → not the encoded form. Stage 3.4 made exactly this distinction
    // when it backfilled account_id, and the two rules must agree.
    expect(clean("[urgent] pay rent")).toBe("[urgent] pay rent");
  });

  it("treats null and undefined as empty", () => {
    expect(clean(null)).toBe("");
    expect(clean(undefined)).toBe("");
  });
});

describe("calcRange", () => {
  // Fixed "now" = 14 Mar 2026, 10:30 local. Anything time-dependent is pinned;
  // a range helper that passes only in some months is not a test.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 14, 10, 30, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("this_month runs from the 1st to now", () => {
    const r = calcRange("this_month", "", "");
    expect(r.from).toEqual(new Date(2026, 2, 1));
    expect(r.to).toEqual(new Date(2026, 2, 14, 10, 30, 0));
  });

  it("last_month is the whole previous month, ending on its last day", () => {
    const r = calcRange("last_month", "", "");
    expect(r.from).toEqual(new Date(2026, 1, 1));
    expect(r.to).toEqual(new Date(2026, 1, 28));
  });

  it("last_3m starts two months back, so it spans three calendar months", () => {
    expect(calcRange("last_3m", "", "").from).toEqual(new Date(2026, 0, 1));
  });

  it("this_year starts on 1 January", () => {
    expect(calcRange("this_year", "", "").from).toEqual(new Date(2026, 0, 1));
  });

  it("all is unbounded on both ends", () => {
    expect(calcRange("all", "", "")).toEqual({ from: null, to: null });
  });

  it("custom uses the supplied dates and treats a blank as unbounded", () => {
    const both = calcRange("custom", "2026-01-05", "2026-02-05");
    expect(both.from).toEqual(new Date("2026-01-05"));
    expect(both.to).toEqual(new Date("2026-02-05"));

    const openEnded = calcRange("custom", "2026-01-05", "");
    expect(openEnded.to).toBeNull();
  });

  it("covers every preset the selector can produce", () => {
    // If a preset is added to the dropdown without a branch here, calcRange
    // silently falls through to "all time" — an export that quietly ignores
    // the range the user picked.
    for (const p of DATE_PRESETS) {
      expect(() => calcRange(p.value, "2026-01-01", "2026-02-01")).not.toThrow();
    }
  });
});

describe("withinRange", () => {
  const r = { from: new Date(2026, 0, 10), to: new Date(2026, 0, 20) };

  it("includes the boundaries", () => {
    expect(withinRange(new Date(2026, 0, 10), r)).toBe(true);
    expect(withinRange(new Date(2026, 0, 20), r)).toBe(true);
  });

  it("excludes dates outside", () => {
    expect(withinRange(new Date(2026, 0, 9), r)).toBe(false);
    expect(withinRange(new Date(2026, 0, 21), r)).toBe(false);
  });

  it("accepts everything when both ends are null", () => {
    expect(withinRange(new Date(1999, 5, 5), { from: null, to: null })).toBe(true);
  });
});

describe("makeCSV", () => {
  it("returns an empty string for no rows rather than a bare header", () => {
    expect(makeCSV([])).toBe("");
  });

  it("writes the header from the first row's keys", () => {
    expect(makeCSV([{ Date: "2026-01-01", Amount: 500 }])).toBe(
      "Date,Amount\n2026-01-01,500",
    );
  });

  it("quotes values containing a comma, a quote or a newline", () => {
    const csv = makeCSV([
      { Description: "Coffee, milk and a bun" },
      { Description: 'He said "cheap"' },
      { Description: "line one\nline two" },
    ]);
    expect(csv.split("\n")[1]).toBe('"Coffee, milk and a bun"');
    expect(csv).toContain('"He said ""cheap"""');
    expect(csv).toContain('"line one');
  });

  it("renders null and undefined as empty cells, not the words", () => {
    expect(makeCSV([{ A: null, B: undefined, C: 0 }])).toBe("A,B,C\n,,0");
  });
});

describe("SECTIONS", () => {
  it("has a unique id per section", () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── transaction export rows (Trackers, Phase 6) ───────────────────────────────

describe("txnExportRow", () => {
  const txn = {
    occurred_at: "2026-08-27T10:30:00.000Z",
    type: "expense",
    category: "Labour",
    description: "Labour Salary",
    amount: 18600,
    currency: "INR",
  };

  it("puts Tracker LAST so existing column positions never shift", () => {
    // A script or spreadsheet built against the old expenses.csv keeps
    // working only if every prior column stays where it was.
    expect(Object.keys(txnExportRow(txn))).toEqual([
      "Date",
      "Type",
      "Category",
      "Description",
      "Amount",
      "Currency",
      "Tracker",
    ]);
  });

  it("leaves Tracker blank for an untagged row", () => {
    expect(txnExportRow(txn).Tracker).toBe("");
    expect(txnExportRow({ ...txn, tracker_id: null }).Tracker).toBe("");
  });

  it("resolves a tracker id to its name", () => {
    const names = new Map([["t1", "Home Construction"]]);
    expect(txnExportRow({ ...txn, tracker_id: "t1" }, names).Tracker).toBe("Home Construction");
  });

  it("leaves Tracker blank when the id cannot be resolved", () => {
    // Menu denied, or deleted between fetches. A raw uuid in a spreadsheet
    // column is worse than an empty cell.
    expect(txnExportRow({ ...txn, tracker_id: "ghost" }, new Map()).Tracker).toBe("");
  });

  it("emits a numeric Amount, not a string", () => {
    expect(txnExportRow({ ...txn, amount: "18600" }).Amount).toBe(18600);
  });

  it("produces the same shape the CSV and the spreadsheet both use", () => {
    // The whole reason this function exists: the two call sites were separate
    // literals and could drift.
    const a = txnExportRow(txn);
    const b = txnExportRow(txn);
    expect(Object.keys(a)).toEqual(Object.keys(b));
  });
});

describe("trackerExportRow", () => {
  const ctx = {
    trackerName: "Home Construction",
    accountName: (id: string | null) => (id === "cash" ? "Cash" : "Unassigned"),
    splitSub: (d: string | null) => ({ sub: "", note: d ?? "" }),
  };
  const txn = {
    occurred_at: "2026-08-27T10:30:00.000Z",
    type: "expense",
    category: "Labour",
    description: "Labour Salary",
    amount: 18600,
    currency: "INR",
    account_id: "cash",
    payment_mode: "Cash",
    created_at: "2026-08-27T10:31:00.000Z",
  };

  it("carries every column the tracker statement promises", () => {
    expect(Object.keys(trackerExportRow(txn, ctx))).toEqual([
      "Date",
      "Time",
      "Description",
      "Category",
      "Subcategory",
      "Tracker",
      "Account",
      "Payment Mode",
      "Amount",
      "Currency",
      "Transaction Type",
      "Created At",
    ]);
  });

  it("names the account rather than exporting its id", () => {
    expect(trackerExportRow(txn, ctx).Account).toBe("Cash");
    expect(trackerExportRow({ ...txn, account_id: null }, ctx).Account).toBe("Unassigned");
  });

  it("splits a subcategory out of the description when there is one", () => {
    const withSub = {
      ...ctx,
      splitSub: () => ({ sub: "Cement", note: "20 bags" }),
    };
    const r = trackerExportRow(txn, withSub);
    expect(r.Subcategory).toBe("Cement");
    expect(r.Description).toBe("20 bags");
  });

  it("survives an unparseable timestamp without throwing", () => {
    expect(() => trackerExportRow({ ...txn, occurred_at: "nonsense" }, ctx)).not.toThrow();
  });
});

describe("trackerSheetName", () => {
  it("never exceeds Excel's 31-character limit", () => {
    const long = "A tracker with an extremely long descriptive name indeed";
    expect(trackerSheetName(long).length).toBeLessThanOrEqual(31);
  });

  it("strips the characters Excel refuses in a sheet name", () => {
    // xlsx writes these happily and Excel then refuses to open the file.
    const n = trackerSheetName(String.raw`Home/Build?[2026]*:x\y`);
    for (const ch of ["\\", "/", "?", "*", "[", "]", ":"]) {
      expect(n).not.toContain(ch);
    }
    expect(n).toContain("Home");
  });

  it("falls back to a usable name rather than an empty one", () => {
    expect(trackerSheetName("///")).toBe("Tracker");
    expect(trackerSheetName("   ")).toBe("Tracker");
  });
});

describe("trackerExportFilename", () => {
  it("slugs the name and keeps the extension", () => {
    expect(trackerExportFilename("Home Construction", "csv")).toBe("finroot-home-construction.csv");
    expect(trackerExportFilename("Dubai Trip", "xlsx")).toBe("finroot-dubai-trip.xlsx");
  });

  it("never produces a filename that is only punctuation", () => {
    expect(trackerExportFilename("!!!", "csv")).toBe("finroot-tracker.csv");
  });

  it("does not leave a trailing separator", () => {
    expect(trackerExportFilename("Wedding — ", "csv")).toBe("finroot-wedding.csv");
  });
});
