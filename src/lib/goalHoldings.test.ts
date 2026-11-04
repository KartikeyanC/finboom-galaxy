import { describe, it, expect } from "vitest";
import type { InvestmentRecord } from "./investmentsStore";
import { goalOf, investedByGoal, type GoalRef } from "./goalHoldings";

const goals: GoalRef[] = [
  { id: "g1", title: "Retire at 55", category: "Retirement", currency: "INR" },
  { id: "g2", title: "House Fund", category: null, currency: "INR" },
  { id: "g3", title: "US trip", category: "Travel", currency: "USD" },
];

const fund = (id: string, value: number, link: { goalId?: string; label?: string } = {}, currency = "INR") =>
  ({
    id,
    asset: "mutual_funds",
    currency,
    goal: link.label ?? null,
    fields: { name: `Fund ${id}`, units: "1", invested: String(value), nav: String(value), ...(link.goalId ? { goal_id: link.goalId } : {}) },
    derived: { currentValue: value },
    savedAt: "2026-10-01T00:00:00Z",
  }) as InvestmentRecord;

describe("goalOf", () => {
  it("by id first", () => {
    expect(goalOf(fund("a", 1, { goalId: "g2" }), goals)?.id).toBe("g2");
  });

  it("an older holding's label finds the goal with that title, else that category", () => {
    expect(goalOf(fund("a", 1, { label: "House Fund" }), goals)?.id).toBe("g2");
    expect(goalOf(fund("a", 1, { label: "Retirement" }), goals)?.id).toBe("g1");
    expect(goalOf(fund("a", 1, { label: "Kid's Education" }), goals)).toBeUndefined();
  });

  it("a deleted goal links nothing", () => {
    expect(goalOf(fund("a", 1, { goalId: "gone" }), goals)).toBeUndefined();
  });
});

describe("investedByGoal", () => {
  it("adds up today's value of each goal's holdings, the live value when there is one", () => {
    const m = investedByGoal(
      [fund("a", 1000, { goalId: "g1" }), fund("b", 500, { label: "Retirement" }), fund("c", 70, {})],
      goals,
      { a: 1200 },
    );
    expect(m.get("g1")?.value).toBe(1700);
    expect(m.get("g1")?.holdings.map((h) => h.id)).toEqual(["a", "b"]);
    expect(m.has("g2")).toBe(false);
  });

  it("converts into the goal's currency", () => {
    const m = investedByGoal([fund("a", 8350, { goalId: "g3" })], goals);
    expect(m.get("g3")?.value).toBeCloseTo(100, 6);
  });
});
