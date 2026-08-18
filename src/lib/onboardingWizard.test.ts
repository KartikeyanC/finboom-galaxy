import { describe, it, expect } from "vitest";
import {
  AGE_RANGES,
  COUNTRIES,
  CURRENCIES,
  INCOME_SOURCES,
  INCOME_RANGES_BY_CURRENCY,
  ASSET_TYPES,
  LIABILITY_TYPES,
  GOAL_TYPES,
  GOALS_MAX,
  TIMELINES,
  INSURANCE_TYPES,
  SPEND_CATEGORIES,
  SPEND_CATEGORIES_MAX,
  PRIORITIES,
  TOTAL_STEPS,
  incomeRangesFor,
  toggleInList,
  canProceed,
  buildSummary,
  type OnboardingSelections,
} from "./onboardingWizard";

describe("option lists", () => {
  it("cover every currency the spec lists, plus a fallback for Other", () => {
    for (const c of CURRENCIES) {
      expect(INCOME_RANGES_BY_CURRENCY[c.id]).toHaveLength(5);
    }
  });

  it("every option list has unique ids", () => {
    const lists = [
      AGE_RANGES, COUNTRIES, CURRENCIES, INCOME_SOURCES, ASSET_TYPES,
      LIABILITY_TYPES, GOAL_TYPES, TIMELINES, INSURANCE_TYPES,
      SPEND_CATEGORIES, PRIORITIES,
    ];
    for (const list of lists) {
      const ids = list.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("has exactly 5 steps", () => {
    expect(TOTAL_STEPS).toBe(5);
  });
});

describe("incomeRangesFor", () => {
  it("returns the currency's own bands", () => {
    expect(incomeRangesFor("INR")[0].label).toContain("₹");
    expect(incomeRangesFor("USD")[0].label).toContain("$");
  });

  it("falls back to the generic bands for undefined/unknown currency", () => {
    expect(incomeRangesFor(undefined)).toEqual(INCOME_RANGES_BY_CURRENCY.OTHER);
  });
});

describe("toggleInList", () => {
  it("adds an id that is not present", () => {
    expect(toggleInList(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes an id that is present, regardless of the cap", () => {
    expect(toggleInList(["a", "b", "c"], "b", 3)).toEqual(["a", "c"]);
  });

  it("refuses to add past the cap", () => {
    expect(toggleInList(["a", "b", "c"], "d", 3)).toEqual(["a", "b", "c"]);
  });

  it("treats an undefined list as empty", () => {
    expect(toggleInList(undefined, "a")).toEqual(["a"]);
  });
});

describe("canProceed", () => {
  it("step 1 needs age, country and currency all three", () => {
    expect(canProceed(1, {})).toBe(false);
    expect(canProceed(1, { ageRange: "25-34" })).toBe(false);
    expect(canProceed(1, { ageRange: "25-34", country: "india", currency: "INR" })).toBe(true);
  });

  it("step 4 needs goals, a timeline and an insurance answer (None counts)", () => {
    const base: OnboardingSelections = { goals: ["home"], goalTimeline: "1_3y" };
    expect(canProceed(4, base)).toBe(false);
    expect(canProceed(4, { ...base, insurance: ["none"] })).toBe(true);
  });

  it("an unknown step never blocks", () => {
    expect(canProceed(99, {})).toBe(true);
  });
});

describe("goals and spend-category caps", () => {
  it("the max-3 constants match the spec", () => {
    expect(GOALS_MAX).toBe(3);
    expect(SPEND_CATEGORIES_MAX).toBe(3);
  });

  it("toggleInList enforces the goals cap the same way the UI does", () => {
    let goals: string[] = [];
    for (const id of ["home", "education", "marriage", "travel"]) {
      goals = toggleInList(goals, id, GOALS_MAX);
    }
    expect(goals).toEqual(["home", "education", "marriage"]);
  });
});

describe("buildSummary", () => {
  it("is empty for no selections", () => {
    expect(buildSummary({})).toEqual([]);
  });

  it("summarizes a fully answered wizard in plain language", () => {
    const lines = buildSummary({
      ageRange: "25-34",
      country: "india",
      currency: "INR",
      incomeSources: ["salary"],
      incomeRange: "50k_1l",
      assets: ["cash_bank"],
      liabilities: ["no_debt"],
      goals: ["emergency_fund", "home"],
      goalTimeline: "1_3y",
      insurance: ["health"],
      topSpendCategories: ["housing", "food"],
      topPriority: "save_more",
    });
    expect(lines.join(" | ")).toContain("25–34");
    expect(lines.join(" | ")).toContain("Salary / Job");
    expect(lines.join(" | ")).toContain("Cash / Bank");
    expect(lines.join(" | ")).toContain("No Debt");
    expect(lines.join(" | ")).toContain("Emergency Fund");
    expect(lines.join(" | ")).toContain("Save More");
  });

  it("never throws on an id that somehow isn't in the option list", () => {
    expect(() =>
      buildSummary({ goals: ["not-a-real-id" as never] }),
    ).not.toThrow();
  });
});
