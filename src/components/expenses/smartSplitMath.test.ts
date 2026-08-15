import { describe, expect, it } from "vitest";
import {
  KINDS,
  MODES,
  balanceLast,
  blankAllocs,
  convertAllocations,
  currencySymbol,
  evenSplit,
  fieldFor,
  isBalanced,
  isOver,
  moneyOf,
  num,
  sumOf,
  summarize,
  type Allocation,
  type SplitMode,
} from "./smartSplitMath";

/**
 * Stage 4.13. Smart Split decides how much of a bill posts to the user's own
 * ledger and how much is recorded as owed back to them, and until this split
 * that arithmetic lived inside a 830-line component where nothing could reach
 * it. The cases below are the ones where being wrong costs the user money:
 * mode conversions, rounding remainders, and the balanced/over gates that
 * enable the Save button.
 */

const alloc = (p: Partial<Allocation>): Allocation => ({
  id: p.id ?? "a",
  label: p.label ?? "bucket",
  kind: p.kind ?? "mine",
  amount: p.amount ?? "",
  pct: p.pct ?? "",
  shares: p.shares ?? "",
});

describe("num", () => {
  it("reads a blank or unparseable field as 0, never NaN", () => {
    expect(num("")).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num("12.5")).toBe(12.5);
  });
});

describe("moneyOf", () => {
  it("amount mode reads the amount field verbatim", () => {
    expect(moneyOf(alloc({ amount: "250", pct: "99", shares: "9" }), "amount", 1000, 9)).toBe(250);
  });

  it("percent mode is a percentage of the bill", () => {
    expect(moneyOf(alloc({ pct: "40" }), "percent", 1000, 0)).toBe(400);
  });

  it("shares mode divides the bill by the share total", () => {
    expect(moneyOf(alloc({ shares: "1" }), "shares", 900, 3)).toBe(300);
  });

  it("shares mode is 0 when no shares exist at all — not a division by zero", () => {
    expect(moneyOf(alloc({ shares: "" }), "shares", 900, 0)).toBe(0);
  });
});

describe("summarize", () => {
  const rows = [
    alloc({ id: "1", kind: "mine", amount: "300" }),
    alloc({ id: "2", kind: "office", amount: "500" }),
    alloc({ id: "3", kind: "shared", amount: "200" }),
  ];

  it("totals per kind, because only `mine` posts to the ledger", () => {
    expect(summarize(rows, "amount", 1000)).toEqual({
      allocated: 1000, mine: 300, office: 500, shared: 200,
    });
  });

  it("resolves shares against the share total, not the row count", () => {
    const s = summarize(
      [
        alloc({ id: "1", kind: "mine", shares: "1" }),
        alloc({ id: "2", kind: "office", shares: "3" }),
      ],
      "shares",
      800,
    );
    expect(s.mine).toBe(200);
    expect(s.office).toBe(600);
  });
});

describe("isBalanced / isOver", () => {
  it("a bill of zero is never balanced, whatever the buckets say", () => {
    expect(isBalanced("amount", { totalNum: 0, sumPct: 100, sumShares: 4, remaining: 0 })).toBe(false);
  });

  it("percent balances at 100 within a hair", () => {
    expect(isBalanced("percent", { totalNum: 100, sumPct: 100, sumShares: 0, remaining: 0 })).toBe(true);
    expect(isBalanced("percent", { totalNum: 100, sumPct: 99.99, sumShares: 0, remaining: 0 })).toBe(true);
    expect(isBalanced("percent", { totalNum: 100, sumPct: 90, sumShares: 0, remaining: 10 })).toBe(false);
  });

  it("shares balance as soon as any share exists — they are a ratio", () => {
    expect(isBalanced("shares", { totalNum: 100, sumPct: 0, sumShares: 2, remaining: 100 })).toBe(true);
    expect(isBalanced("shares", { totalNum: 100, sumPct: 0, sumShares: 0, remaining: 100 })).toBe(false);
  });

  it("amount balances on a remainder under half a paisa", () => {
    expect(isBalanced("amount", { totalNum: 100, sumPct: 0, sumShares: 0, remaining: 0.004 })).toBe(true);
    expect(isBalanced("amount", { totalNum: 100, sumPct: 0, sumShares: 0, remaining: 1 })).toBe(false);
  });

  it("shares can never overshoot", () => {
    expect(isOver("shares", { sumPct: 500, remaining: -900 })).toBe(false);
  });

  it("percent and amount report an overshoot", () => {
    expect(isOver("percent", { sumPct: 101, remaining: 0 })).toBe(true);
    expect(isOver("amount", { sumPct: 0, remaining: -0.5 })).toBe(true);
    expect(isOver("amount", { sumPct: 0, remaining: 0.5 })).toBe(false);
  });
});

describe("convertAllocations", () => {
  it("preserves the actual division when switching amount → percent", () => {
    const rows = [alloc({ id: "1", amount: "250" }), alloc({ id: "2", amount: "750" })];
    const next = convertAllocations(rows, "amount", "percent", 1000);
    expect(next.map((a) => a.pct)).toEqual(["25", "75"]);
  });

  it("preserves it back again, percent → amount", () => {
    const rows = [alloc({ id: "1", pct: "25" }), alloc({ id: "2", pct: "75" })];
    const next = convertAllocations(rows, "percent", "amount", 1000);
    expect(next.map((a) => a.amount)).toEqual(["250", "750"]);
  });

  it("leaves an empty bucket empty rather than writing a 0 the user did not type", () => {
    const next = convertAllocations([alloc({ amount: "" })], "amount", "percent", 1000);
    expect(next[0].pct).toBe("");
  });

  it("cannot express a percentage of a zero bill, so it writes nothing", () => {
    const next = convertAllocations([alloc({ amount: "250" })], "amount", "percent", 0);
    expect(next[0].pct).toBe("");
  });

  it("is a no-op when the mode does not change", () => {
    const rows = [alloc({ amount: "250" })];
    expect(convertAllocations(rows, "amount", "amount", 1000)).toBe(rows);
  });

  it("round-trips through every pair of modes without losing the money value", () => {
    const rows = [
      alloc({ id: "1", kind: "mine", amount: "400" }),
      alloc({ id: "2", kind: "office", amount: "600" }),
    ];
    for (const to of MODES) {
      const there = convertAllocations(rows, "amount", to, 1000);
      const back = convertAllocations(there, to, "amount", 1000);
      expect(summarize(back, "amount", 1000).allocated).toBeCloseTo(1000, 2);
    }
  });
});

describe("evenSplit", () => {
  it("gives the rounding remainder to the first bucket so the parts add up", () => {
    const rows = [alloc({ id: "1" }), alloc({ id: "2" }), alloc({ id: "3" })];
    const next = evenSplit(rows, "amount", 100);
    expect(next.map((a) => a.amount)).toEqual(["33.34", "33.33", "33.33"]);
    expect(summarize(next, "amount", 100).allocated).toBe(100);
  });

  it("makes percentages total exactly 100", () => {
    const rows = [alloc({ id: "1" }), alloc({ id: "2" }), alloc({ id: "3" })];
    const next = evenSplit(rows, "percent", 0);
    expect(sumOf(next, "pct")).toBe(100);
  });

  it("gives every bucket one share", () => {
    const next = evenSplit([alloc({ id: "1" }), alloc({ id: "2" })], "shares", 500);
    expect(next.every((a) => a.shares === "1")).toBe(true);
  });

  it("leaves amounts alone when there is no bill to divide yet", () => {
    const rows = [alloc({ id: "1", amount: "5" })];
    expect(evenSplit(rows, "amount", 0)[0].amount).toBe("5");
  });
});

describe("balanceLast", () => {
  it("puts the unallocated remainder in the last bucket", () => {
    const rows = [alloc({ id: "1", amount: "300" }), alloc({ id: "2", amount: "0" })];
    expect(balanceLast(rows, "amount", 1000)[1].amount).toBe("700");
  });

  it("tops the last percentage up to 100", () => {
    const rows = [alloc({ id: "1", pct: "70" }), alloc({ id: "2", pct: "" })];
    expect(balanceLast(rows, "percent", 1000)[1].pct).toBe("30");
  });

  it("clamps at 0 instead of inventing a negative bucket when already over", () => {
    const rows = [alloc({ id: "1", amount: "1200" }), alloc({ id: "2", amount: "50" })];
    expect(balanceLast(rows, "amount", 1000)[1].amount).toBe("0");
  });

  it("does nothing in shares mode — there is no remainder to place", () => {
    const rows = [alloc({ id: "1", shares: "1" })];
    expect(balanceLast(rows, "shares", 1000)).toBe(rows);
  });
});

describe("fieldFor", () => {
  it("maps every mode to the field it edits", () => {
    const expected: Record<SplitMode, string> = { amount: "amount", percent: "pct", shares: "shares" };
    for (const m of MODES) expect(fieldFor(m)).toBe(expected[m]);
  });
});

describe("defaults", () => {
  it("starts with a personal bucket and an office bucket, with fresh ids", () => {
    const a = blankAllocs();
    expect(a.map((x) => x.kind)).toEqual(["mine", "office"]);
    expect(a[0].id).not.toBe(blankAllocs()[0].id);
  });

  it("covers every kind in KINDS", () => {
    expect([...KINDS].sort()).toEqual(["mine", "office", "shared"]);
  });
});

describe("currencySymbol", () => {
  it("returns the symbol for a known currency and nothing for an unknown one", () => {
    expect(currencySymbol("INR")).toBe("₹");
    expect(currencySymbol("JPY")).toBe("");
  });
});
