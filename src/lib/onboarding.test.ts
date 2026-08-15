import { describe, it, expect } from "vitest";
import {
  DEFAULT_ONBOARDING,
  ONBOARDING_STEPS,
  SAMPLE_PREFIX,
  buildSamplePlan,
  completedCount,
  deriveSteps,
  isComplete,
  sampleIds,
  sampleIdsFor,
  samplePlanSize,
  shouldShowChecklist,
  type SampleRecord,
} from "./onboarding";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, BUDGET_BUCKETS, GOAL_CATEGORIES } from "./finance";
import { ALL_MENU_IDS } from "./accessMenus";
import { bucketForCategory } from "./budgetBuckets";

const all = () => true;
const none = () => false;

describe("checklist steps", () => {
  it("is the three-step checklist Stage 5.3 promises", () => {
    expect(ONBOARDING_STEPS).toHaveLength(3);
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual(["transaction", "budget", "goal"]);
  });

  it("points every step at a real menu id", () => {
    // A step naming a menu that does not exist would be permanently invisible,
    // because canAccess() answers false for anything unknown.
    for (const s of ONBOARDING_STEPS) expect(ALL_MENU_IDS, s.id).toContain(s.menu);
  });

  it("counts a step done only when the workspace has a row for it", () => {
    const steps = deriveSteps({ transaction: 3, budget: 0, goal: 0 }, all);
    expect(steps.map((s) => s.done)).toEqual([true, false, false]);
    expect(completedCount(steps)).toBe(1);
  });

  it("treats a count that has not arrived as not done, never as done", () => {
    // The alternative — optimistically ticking while loading — would flash a
    // completed checklist at a brand new user and then un-tick it.
    const steps = deriveSteps({ transaction: null, budget: null, goal: null }, all);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(isComplete(steps)).toBe(false);
  });

  it("drops steps whose menu the workspace cannot open", () => {
    const onlyExpenses = (m: string) => m === "expenses";
    const steps = deriveSteps({ transaction: 1 }, onlyExpenses);
    expect(steps.map((s) => s.id)).toEqual(["transaction"]);
    expect(isComplete(steps)).toBe(true); // one visible step, satisfied
  });

  it("never calls an empty checklist complete", () => {
    // Otherwise a workspace that can reach none of the three menus would be
    // retired as "done", and a later plan upgrade would never show it.
    expect(isComplete(deriveSteps({}, none))).toBe(false);
  });

  it("is complete only when every visible step is satisfied", () => {
    expect(isComplete(deriveSteps({ transaction: 1, budget: 1, goal: 0 }, all))).toBe(false);
    expect(isComplete(deriveSteps({ transaction: 1, budget: 1, goal: 1 }, all))).toBe(true);
  });
});

describe("who sees the checklist", () => {
  it("starts visible for someone who can create the data", () => {
    expect(shouldShowChecklist(DEFAULT_ONBOARDING, true)).toBe(true);
  });

  it("is never shown to a viewer, who can create none of it", () => {
    expect(shouldShowChecklist(DEFAULT_ONBOARDING, false)).toBe(false);
  });

  it("stays gone once finished or dismissed", () => {
    expect(shouldShowChecklist({ status: "done", sample: null }, true)).toBe(false);
    expect(shouldShowChecklist({ status: "dismissed", sample: null }, true)).toBe(false);
  });
});

describe("sample row bookkeeping", () => {
  const record: SampleRecord = {
    at: "2026-08-11T00:00:00.000Z",
    transactions: ["t1", "t2"],
    budgets: ["b1"],
    goals: ["g1"],
  };

  it("gathers every id it created", () => {
    expect(sampleIds(record)).toEqual(["t1", "t2", "b1", "g1"]);
    expect(sampleIds(null)).toEqual([]);
  });

  it("keeps the per-table lists apart, so an exclusion filter is exact", () => {
    expect(sampleIdsFor(record, "transactions")).toEqual(["t1", "t2"]);
    expect(sampleIdsFor(record, "budgets")).toEqual(["b1"]);
    expect(sampleIdsFor(null, "goals")).toEqual([]);
  });
});

describe("the sample workspace", () => {
  const now = new Date("2026-08-11T10:00:00.000Z");
  const plan = buildSamplePlan(now);

  it("creates enough to fill a dashboard without being a wall of rows", () => {
    expect(plan.transactions.length).toBeGreaterThanOrEqual(8);
    expect(samplePlanSize(plan)).toBeLessThanOrEqual(20);
    expect(plan.goals).toHaveLength(1);
    expect(plan.budgets.length).toBeGreaterThan(0);
  });

  it("labels every row it creates, so it is identifiable in the ledger itself", () => {
    for (const t of plan.transactions) expect(t.description.startsWith(SAMPLE_PREFIX), t.description).toBe(true);
    for (const g of plan.goals) expect(g.title.startsWith(SAMPLE_PREFIX)).toBe(true);
  });

  it("uses only categories the app actually knows", () => {
    // An invented category renders as an unknown grey chip and lands in the
    // wrong budget jar — a demo that misrepresents the product.
    for (const t of plan.transactions) {
      const known = t.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      expect(known as readonly string[], t.category).toContain(t.category);
    }
    for (const b of plan.budgets) expect(BUDGET_BUCKETS as readonly string[]).toContain(b.bucket);
    for (const g of plan.goals) expect(GOAL_CATEGORIES as readonly string[]).toContain(g.category);
  });

  it("budgets only the jars its own spending feeds", () => {
    // A budget with no matching category shows a flat zero forever, which
    // looks like the app failing to track spend.
    const fed = new Set(
      plan.transactions.filter((t) => t.type === "expense").map((t) => bucketForCategory(t.category)),
    );
    for (const b of plan.budgets) expect(fed, b.bucket).toContain(b.bucket);
  });

  it("never dates a row in the future", () => {
    for (const t of plan.transactions) {
      expect(new Date(t.occurred_at).getTime(), t.description).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("keeps the whole set inside the last two months", () => {
    for (const t of plan.transactions) {
      expect(now.getTime() - new Date(t.occurred_at).getTime(), t.description).toBeLessThan(
        70 * 24 * 3600 * 1000,
      );
    }
  });

  const inMonth = (iso: string, ref: Date) => {
    const d = new Date(iso);
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  };

  it("puts income AND spending in the current month, on any day it is loaded", () => {
    // 🔴 The regression this catches: with "days ago" dating, a load on the
    // 11th put the salary in last month and left the dashboard — which shows
    // the CURRENT month — reading "monthly savings −₹5,849" with no income.
    for (const day of [1, 3, 11, 17, 28]) {
      const at = new Date(2026, 7, day, 23, 0, 0);
      const p = buildSamplePlan(at);
      const thisMonth = p.transactions.filter((t) => inMonth(t.occurred_at, at));
      const income = thisMonth.filter((t) => t.type === "income");
      const expense = thisMonth.filter((t) => t.type === "expense");
      expect(income.length, `day ${day}`).toBeGreaterThan(0);
      expect(expense.length, `day ${day}`).toBeGreaterThan(0);
      const sum = (rows: typeof thisMonth) => rows.reduce((a, t) => a + t.amount, 0);
      expect(sum(income), `day ${day}`).toBeGreaterThan(sum(expense));
    }
  });

  it("also fills the previous month, so month-over-month has two points", () => {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    expect(plan.transactions.some((t) => inMonth(t.occurred_at, prev))).toBe(true);
  });

  it("allocates each budget above what the sample spends against it", () => {
    // Otherwise the first thing a new user sees is a budget already blown.
    const spend = new Map<string, number>();
    for (const t of plan.transactions) {
      if (t.type !== "expense" || !inMonth(t.occurred_at, now)) continue;
      const jar = bucketForCategory(t.category);
      spend.set(jar, (spend.get(jar) ?? 0) + t.amount);
    }
    for (const b of plan.budgets) {
      expect(b.allocated, b.bucket).toBeGreaterThan(spend.get(b.bucket) ?? 0);
    }
  });

  it("dates the goal in the future", () => {
    expect(new Date(plan.goals[0].target_date).getTime()).toBeGreaterThan(now.getTime());
  });

  it("moves with the clock rather than sitting on fixed dates", () => {
    const later = buildSamplePlan(new Date(2027, 0, 4, 10, 0, 0));
    expect(later.transactions[0].occurred_at).not.toBe(plan.transactions[0].occurred_at);
  });

  it("shows a household that earns more than it spends", () => {
    const sum = (type: "income" | "expense") =>
      plan.transactions.filter((t) => t.type === type).reduce((a, t) => a + t.amount, 0);
    expect(sum("income")).toBeGreaterThan(sum("expense"));
  });

  it("writes the workspace's currency into every row", () => {
    const usd = buildSamplePlan(now, "USD");
    for (const t of usd.transactions) expect(t.currency).toBe("USD");
    for (const g of usd.goals) expect(g.currency).toBe("USD");
    expect(plan.transactions[0].currency).toBe("INR"); // default
  });

  it("keeps the goal short of its target, so the progress bar has something to show", () => {
    for (const g of plan.goals) expect(g.current_amount).toBeLessThan(g.target_amount);
  });
});
