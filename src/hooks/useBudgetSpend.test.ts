import { describe, expect, it } from "vitest";
import { foldBudgetSpend, type BudgetSpendRow } from "./useBudgetSpend";
import { deriveSpent, type SpendInput } from "@/lib/budgetBuckets";
import type { Budget } from "./useBudgets";

/**
 * Stage 4.2. `budget_spend` moved the summing into Postgres, but the jar that
 * each category belongs to is still decided on the client. These tests cover
 * the seam, and the last one holds the new path to the old one: folding
 * per-category server rows must land on the same number `deriveSpent` produced
 * from raw transactions.
 */

const budget = (o: Partial<Budget> & Pick<Budget, "id" | "bucket" | "allocated">): Budget => ({
  user_id: "u",
  tenant_id: "t",
  spent: 0,
  period: "monthly",
  period_start: "2026-08-01",
  created_at: "",
  updated_at: "",
  ...o,
});

const needs = budget({ id: "b-needs", bucket: "Needs", allocated: 50000 });
const play = budget({ id: "b-play", bucket: "Play", allocated: 10000 });

describe("foldBudgetSpend", () => {
  it("sums only the categories that map to the row's bucket", () => {
    const rows: BudgetSpendRow[] = [
      { budget_id: "b-needs", category: "Rent", total: 30000, count: 1 },
      { budget_id: "b-needs", category: "Transport", total: 2000, count: 4 },
      // The server returns every category in the window; Shopping is Play, so
      // it must not land in the Needs jar even though it is on this row.
      { budget_id: "b-needs", category: "Shopping", total: 9999, count: 1 },
    ];
    const [row] = foldBudgetSpend([needs], rows);
    expect(row.derivedSpent).toBe(32000);
    expect(row.utilization).toBe(64);
    expect(row.remaining).toBe(18000);
  });

  it("routes an unmapped or user-created category to Needs rather than dropping it", () => {
    const rows: BudgetSpendRow[] = [
      { budget_id: "b-needs", category: "Goat feed", total: 700, count: 1 },
      { budget_id: "b-needs", category: "Other", total: 300, count: 1 },
    ];
    expect(foldBudgetSpend([needs], rows)[0].derivedSpent).toBe(1000);
  });

  it("keeps each budget row's spend to its own id", () => {
    const rows: BudgetSpendRow[] = [
      { budget_id: "b-needs", category: "Rent", total: 30000, count: 1 },
      { budget_id: "b-play", category: "Entertainment", total: 4000, count: 2 },
    ];
    const out = foldBudgetSpend([needs, play], rows);
    expect(out.find((r) => r.id === "b-needs")?.derivedSpent).toBe(30000);
    expect(out.find((r) => r.id === "b-play")?.derivedSpent).toBe(4000);
  });

  it("reports zero utilization instead of dividing by zero", () => {
    const zero = budget({ id: "b0", bucket: "Needs", allocated: 0 });
    const [row] = foldBudgetSpend([zero], [
      { budget_id: "b0", category: "Rent", total: 500, count: 1 },
    ]);
    expect(row.utilization).toBe(0);
    expect(row.remaining).toBe(-500);
  });

  it("returns every budget at zero while the query is still in flight", () => {
    const out = foldBudgetSpend([needs, play], undefined);
    expect(out.map((r) => r.derivedSpent)).toEqual([0, 0]);
    expect(out).toHaveLength(2);
  });

  it("ignores rows for a budget that no longer exists", () => {
    const out = foldBudgetSpend([needs], [
      { budget_id: "deleted", category: "Rent", total: 99999, count: 1 },
    ]);
    expect(out[0].derivedSpent).toBe(0);
  });

  it("matches deriveSpent, the client reduction it replaced", () => {
    const txns: SpendInput[] = [
      { type: "expense", category: "Rent", amount: 30000, occurred_at: "2026-08-03T00:00:00Z" },
      { type: "expense", category: "Transport", amount: 2000, occurred_at: "2026-08-09T00:00:00Z" },
      { type: "expense", category: "Shopping", amount: 5000, occurred_at: "2026-08-09T00:00:00Z" },
      { type: "income", category: "Salary", amount: 100000, occurred_at: "2026-08-01T00:00:00Z" },
      // Outside the window — the server would not have returned it at all.
      { type: "expense", category: "Rent", amount: 31000, occurred_at: "2026-07-03T00:00:00Z" },
    ];

    // What the RPC returns: expenses inside the row's window, grouped by category.
    const rows: BudgetSpendRow[] = [
      { budget_id: "b-needs", category: "Rent", total: 30000, count: 1 },
      { budget_id: "b-needs", category: "Transport", total: 2000, count: 1 },
      { budget_id: "b-needs", category: "Shopping", total: 5000, count: 1 },
    ];

    const viaServer = foldBudgetSpend([needs], rows)[0].derivedSpent;
    const viaClient = deriveSpent(txns, needs.bucket, needs.period_start, needs.period);
    expect(viaServer).toBe(viaClient);
    expect(viaServer).toBe(32000);
  });
});
