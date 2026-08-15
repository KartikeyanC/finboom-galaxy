import { describe, it, expect } from "vitest";
import {
  bucketForCategory,
  categoriesForBucket,
  isNonExpenseBucket,
  periodWindow,
  deriveSpent,
  CATEGORY_TO_BUCKET,
  NON_EXPENSE_BUCKETS,
  type SpendInput,
} from "./budgetBuckets";
import { BUDGET_BUCKETS, EXPENSE_CATEGORIES } from "./finance";

describe("bucketForCategory", () => {
  it("maps essentials to Needs", () => {
    expect(bucketForCategory("Rent")).toBe("Needs");
    expect(bucketForCategory("Utilities")).toBe("Needs");
    expect(bucketForCategory("Food & Dining")).toBe("Needs");
  });

  it("maps discretionary spending to Play", () => {
    expect(bucketForCategory("Entertainment")).toBe("Play");
    expect(bucketForCategory("Travel")).toBe("Play");
  });

  it("keeps Education in its own jar", () => {
    expect(bucketForCategory("Education")).toBe("Education");
  });

  // Spending must never vanish from the totals just because a category is
  // unrecognised — user-created categories land in Needs rather than nowhere.
  it("falls back to Needs for unknown, null and empty categories", () => {
    expect(bucketForCategory("Totally Made Up")).toBe("Needs");
    expect(bucketForCategory(null)).toBe("Needs");
    expect(bucketForCategory(undefined)).toBe("Needs");
    expect(bucketForCategory("")).toBe("Needs");
  });

  it("only ever returns a real budget bucket", () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(BUDGET_BUCKETS).toContain(bucketForCategory(c));
    }
  });

  it("maps every known expense category explicitly except Other", () => {
    const unmapped = EXPENSE_CATEGORIES.filter((c) => !(c in CATEGORY_TO_BUCKET));
    expect(unmapped).toEqual(["Other"]);
  });
});

describe("non-expense buckets", () => {
  it("flags savings-style jars", () => {
    for (const b of NON_EXPENSE_BUCKETS) expect(isNonExpenseBucket(b)).toBe(true);
    expect(isNonExpenseBucket("Needs")).toBe(false);
  });

  it("has no expense category feeding them", () => {
    for (const b of NON_EXPENSE_BUCKETS) expect(categoriesForBucket(b)).toEqual([]);
  });

  it("accounts for every bucket as either fed or non-expense", () => {
    for (const b of BUDGET_BUCKETS) {
      const fed = categoriesForBucket(b).length > 0;
      expect(fed || isNonExpenseBucket(b)).toBe(true);
    }
  });
});

describe("periodWindow", () => {
  it("covers a calendar month, end-exclusive", () => {
    const { start, end } = periodWindow("2026-03-01", "monthly");
    expect(start.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("handles a month-end start without overflowing", () => {
    const { end } = periodWindow("2026-01-31", "monthly");
    // Day 31 of the next month does not exist; JS rolls to Mar 3, which is the
    // correct end of a window that began Jan 31 (Feb has 28 days in 2026).
    expect(end.getTime()).toBeGreaterThan(new Date("2026-02-28").getTime());
  });

  it("supports weekly and yearly", () => {
    expect(periodWindow("2026-03-01", "weekly").end.toISOString().slice(0, 10)).toBe("2026-03-08");
    expect(periodWindow("2026-03-01", "yearly").end.toISOString().slice(0, 10)).toBe("2027-03-01");
  });
});

describe("deriveSpent", () => {
  const txns: SpendInput[] = [
    { type: "expense", category: "Rent",          amount: 20000, occurred_at: "2026-03-05T10:00:00Z" },
    { type: "expense", category: "Food & Dining", amount: 3000,  occurred_at: "2026-03-10T10:00:00Z" },
    { type: "expense", category: "Entertainment", amount: 1500,  occurred_at: "2026-03-12T10:00:00Z" },
    { type: "income",  category: "Salary",        amount: 90000, occurred_at: "2026-03-01T10:00:00Z" },
    { type: "expense", category: "Rent",          amount: 20000, occurred_at: "2026-04-05T10:00:00Z" }, // next period
    { type: "expense", category: "Rent",          amount: 999,   occurred_at: "2026-02-27T10:00:00Z" }, // previous period
  ];

  it("sums only matching bucket, expense type and period", () => {
    expect(deriveSpent(txns, "Needs", "2026-03-01")).toBe(23000); // 20000 + 3000
    expect(deriveSpent(txns, "Play", "2026-03-01")).toBe(1500);
  });

  it("excludes income even when the category maps to the bucket", () => {
    // Salary is unmapped -> Needs, but it is not an expense.
    expect(deriveSpent(txns, "Needs", "2026-03-01")).not.toContain(90000);
    expect(deriveSpent(txns, "Needs", "2026-03-01")).toBe(23000);
  });

  it("excludes transactions outside the window on both sides", () => {
    expect(deriveSpent(txns, "Needs", "2026-04-01")).toBe(20000);
    expect(deriveSpent(txns, "Needs", "2026-02-01")).toBe(999);
  });

  it("treats the window end as exclusive", () => {
    const edge: SpendInput[] = [
      { type: "expense", category: "Rent", amount: 100, occurred_at: "2026-04-01T00:00:00Z" },
    ];
    expect(deriveSpent(edge, "Needs", "2026-03-01")).toBe(0);
    expect(deriveSpent(edge, "Needs", "2026-04-01")).toBe(100);
  });

  it("returns 0 for savings jars nothing feeds", () => {
    expect(deriveSpent(txns, "Giving", "2026-03-01")).toBe(0);
    expect(deriveSpent(txns, "Long-Term Savings", "2026-03-01")).toBe(0);
  });

  it("handles string amounts and an empty list", () => {
    const s: SpendInput[] = [{ type: "expense", category: "Rent", amount: "1500.50", occurred_at: "2026-03-05T10:00:00Z" }];
    expect(deriveSpent(s, "Needs", "2026-03-01")).toBe(1500.5);
    expect(deriveSpent([], "Needs", "2026-03-01")).toBe(0);
  });
});
