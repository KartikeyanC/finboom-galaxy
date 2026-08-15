import { describe, expect, it } from "vitest";
import {
  deriveSummary,
  monthWindow,
  type DashboardSummaryRaw,
} from "./useDashboardSummary";

// 2026-08-11, so the six-month window is 2026-03 … 2026-08.
const NOW = new Date(2026, 7, 11, 10, 0, 0);

function raw(partial: Partial<DashboardSummaryRaw> = {}): DashboardSummaryRaw {
  return {
    tz: "Asia/Kolkata",
    months: 6,
    month_start: "2026-07-31T18:30:00+00:00",
    from: "2026-02-28T18:30:00+00:00",
    monthly: [],
    categories: [],
    account_deltas: [],
    totals: { transactions: 0, earliest: null, latest: null, by_type: {} },
    ...partial,
  };
}

describe("monthWindow", () => {
  it("is oldest-first and ends on the current month", () => {
    expect(monthWindow(6, NOW)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("rolls back across a year boundary", () => {
    expect(monthWindow(3, new Date(2026, 0, 15))).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("deriveSummary", () => {
  it("returns zeroes rather than throwing when there is no data yet", () => {
    const s = deriveSummary(null);
    expect(s.income).toBe(0);
    expect(s.savingsRate).toBe(0);
    expect(s.expenseCategories).toEqual([]);
    expect(s.transactionCount).toBe(0);
  });

  it("computes the current month's figures from the last bucket", () => {
    const s = deriveSummary(
      raw({
        monthly: [
          { month: "2026-07", type: "income", currency: "INR", total: 90000, count: 1 },
          { month: "2026-08", type: "income", currency: "INR", total: 100000, count: 1 },
          { month: "2026-08", type: "expense", currency: "INR", total: 60000, count: 3 },
        ],
      }),
      NOW,
    );
    expect(s.income).toBe(100000);
    expect(s.expense).toBe(60000);
    expect(s.savings).toBe(40000);
    expect(s.savingsRate).toBe(40);
  });

  it("converts each currency with the client FX table before summing", () => {
    const s = deriveSummary(
      raw({
        monthly: [
          { month: "2026-08", type: "income", currency: "INR", total: 1000, count: 1 },
          { month: "2026-08", type: "income", currency: "USD", total: 100, count: 1 },
        ],
      }),
      NOW,
    );
    // 1000 INR + (100 USD × 83.5)
    expect(s.income).toBe(1000 + 8350);
  });

  it("pads the series so every month in the window has a bar", () => {
    const s = deriveSummary(
      raw({
        monthly: [
          { month: "2026-05", type: "expense", currency: "INR", total: 500, count: 1 },
          { month: "2026-08", type: "expense", currency: "INR", total: 800, count: 1 },
        ],
      }),
      NOW,
    );
    expect(s.monthKeys).toHaveLength(6);
    expect(s.expenseSeries).toEqual([0, 0, 500, 0, 0, 800]);
    expect(s.incomeSeries).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("drops a month outside the window instead of charting an unlabelled bar", () => {
    // A tab left open across midnight on the 1st: the server's window has moved
    // on but the client's has not.
    const s = deriveSummary(
      raw({
        monthly: [
          { month: "2026-09", type: "income", currency: "INR", total: 5000, count: 1 },
          { month: "2026-08", type: "income", currency: "INR", total: 1000, count: 1 },
        ],
      }),
      NOW,
    );
    expect(s.incomeSeries).toHaveLength(6);
    expect(s.income).toBe(1000);
  });

  it("splits categories by type and sorts each largest-first", () => {
    const s = deriveSummary(
      raw({
        categories: [
          { category: "Rent", type: "expense", currency: "INR", total: 30000, count: 1 },
          { category: "Salary", type: "income", currency: "INR", total: 100000, count: 1 },
          { category: "Groceries", type: "expense", currency: "INR", total: 45000, count: 9 },
          { category: "Freelance", type: "income", currency: "INR", total: 12000, count: 2 },
        ],
      }),
      NOW,
    );
    expect(s.expenseCategories).toEqual([
      { name: "Groceries", value: 45000 },
      { name: "Rent", value: 30000 },
    ]);
    expect(s.incomeCategories.map((c) => c.name)).toEqual(["Salary", "Freelance"]);
  });

  it("merges a category that appears in more than one currency", () => {
    const s = deriveSummary(
      raw({
        categories: [
          { category: "Shopping", type: "expense", currency: "INR", total: 2000, count: 1 },
          { category: "Shopping", type: "expense", currency: "USD", total: 10, count: 1 },
        ],
      }),
      NOW,
    );
    expect(s.expenseCategories).toEqual([{ name: "Shopping", value: 2000 + 835 }]);
  });

  it("reports a zero savings rate rather than dividing by zero", () => {
    const s = deriveSummary(
      raw({
        monthly: [{ month: "2026-08", type: "expense", currency: "INR", total: 500, count: 1 }],
      }),
      NOW,
    );
    expect(s.income).toBe(0);
    expect(s.savings).toBe(-500);
    expect(s.savingsRate).toBe(0);
  });

  it("carries the lifetime count through without fetching rows", () => {
    const s = deriveSummary(
      raw({
        totals: {
          transactions: 5231,
          earliest: "2020-01-01",
          latest: "2026-08-11",
          by_type: { income: 120, expense: 5100, transfer: 11 },
        },
      }),
      NOW,
    );
    expect(s.transactionCount).toBe(5231);
    // Per-type counts let a page show an "all time" figure without the rows.
    expect(s.countByType.expense).toBe(5100);
    expect(s.countByType.transfer).toBe(11);
  });

  it("honours a window other than six months", () => {
    const s = deriveSummary(raw({ months: 3 }), NOW);
    expect(s.monthKeys).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(s.incomeSeries).toHaveLength(3);
  });
});
