import { describe, it, expect } from "vitest";
import {
  ALL_MENUS_TOKEN,
  MENU_BLURBS,
  defaultPlan,
  lockTooltip,
  menuBlurb,
  menuLock,
  planIncludes,
  resolveCurrentPlan,
  upgradeTarget,
  type PlanCatalogueRow,
} from "./menuUpsell";
import { ACCESS_MENUS, ALL_MENU_IDS } from "./accessMenus";

/**
 * Stage 5.5. Two questions decide everything the paywall UI shows: *is* this
 * locked, and would paying unlock it? Getting the second one wrong shows a
 * sales pitch to somebody whose own admin switched the feature off — or, worse,
 * to somebody who already paid for it.
 */

const plan = (
  name: string,
  price_cents: number,
  menu_set: string[],
  extra: Partial<PlanCatalogueRow> = {},
): PlanCatalogueRow => ({
  id: name.toLowerCase(),
  name,
  price_cents,
  currency: "INR",
  interval: "month",
  is_active: true,
  is_default: false,
  created_at: "2026-01-01T00:00:00Z",
  menu_set,
  ...extra,
});

const ROOTS = plan("Roots", 0, ["dashboard", "income", "expenses", "budget", "goals"], {
  is_default: true,
});
const CANOPY = plan("Canopy", 29900, ["dashboard", "income", "expenses", "budget", "goals", "investments", "net-worth"]);
const HERITAGE = plan("Heritage", 89900, [ALL_MENUS_TOKEN]);
const PLANS = [ROOTS, CANOPY, HERITAGE];

describe("what a plan includes", () => {
  it("reads an explicit menu list", () => {
    expect(planIncludes(CANOPY, "investments")).toBe(true);
    expect(planIncludes(CANOPY, "trips")).toBe(false);
  });

  it("treats ['*'] as everything, including menus added later", () => {
    expect(planIncludes(HERITAGE, "trips")).toBe(true);
    expect(planIncludes(HERITAGE, "a-menu-invented-next-year")).toBe(true);
  });

  it("says no for a missing plan rather than throwing", () => {
    expect(planIncludes(null, "investments")).toBe(false);
  });
});

describe("which plan is in force", () => {
  it("uses the subscribed plan while the subscription is entitling", () => {
    for (const status of ["active", "trialing", "ACTIVE"]) {
      expect(resolveCurrentPlan(PLANS, { plan_name: "Canopy", status })?.name, status).toBe("Canopy");
    }
  });

  it("falls back to the default plan when the subscription has lapsed", () => {
    // 🔴 The one that matters: an EXPIRED Canopy subscription must not report
    // Canopy, or an expired customer is told their locked features are already
    // included and the paywall looks like a bug.
    for (const status of ["expired", "canceled", "past_due", null]) {
      expect(resolveCurrentPlan(PLANS, { plan_name: "Canopy", status })?.name, String(status)).toBe(
        "Roots",
      );
    }
  });

  it("falls back when there is no subscription at all", () => {
    expect(resolveCurrentPlan(PLANS, null)?.name).toBe("Roots");
  });

  it("mirrors SQL default_plan(): flagged default, else cheapest, else oldest", () => {
    expect(defaultPlan(PLANS)?.name).toBe("Roots");
    const noFlag = [plan("B", 500, []), plan("A", 100, [])];
    expect(defaultPlan(noFlag)?.name).toBe("A");
    const sameCost = [
      plan("Newer", 0, [], { created_at: "2026-06-01T00:00:00Z" }),
      plan("Older", 0, [], { created_at: "2025-01-01T00:00:00Z" }),
    ];
    expect(defaultPlan(sameCost)?.name).toBe("Older");
  });

  it("ignores inactive plans", () => {
    const retired = plan("Retired", 0, [], { is_default: true, is_active: false });
    expect(defaultPlan([retired, ROOTS])?.name).toBe("Roots");
    expect(resolveCurrentPlan([retired, ROOTS], { plan_name: "Retired", status: "active" })?.name).toBe(
      "Roots",
    );
  });

  it("returns null when the catalogue is empty", () => {
    expect(defaultPlan([])).toBeNull();
    expect(resolveCurrentPlan([], { plan_name: "Canopy", status: "active" })).toBeNull();
  });
});

describe("what to sell", () => {
  it("offers the cheapest plan that actually includes the feature", () => {
    expect(upgradeTarget(PLANS, ROOTS, "investments")?.name).toBe("Canopy");
    expect(upgradeTarget(PLANS, ROOTS, "trips")?.name).toBe("Heritage");
  });

  it("never offers a plan that costs the same or less", () => {
    // A sideways move is not an upgrade, and offering a CHEAPER plan as the
    // way to unlock something reads as a trap even when it is true.
    const oddCatalogue = [
      plan("Budget tier", 9900, ["trips"]),
      CANOPY, // 29900, no trips
      plan("Peer", 29900, ["trips"]),
      HERITAGE,
    ];
    expect(upgradeTarget(oddCatalogue, CANOPY, "trips")?.name).toBe("Heritage");
  });

  it("offers nothing from the top of the catalogue", () => {
    expect(upgradeTarget(PLANS, HERITAGE, "trips")).toBeNull();
  });

  it("offers nothing when no sellable plan includes the feature", () => {
    const nobodyHasIt = [ROOTS, plan("Mid", 100, ["dashboard"])];
    expect(upgradeTarget(nobodyHasIt, ROOTS, "trips")).toBeNull();
  });
});

describe("why a menu is unavailable", () => {
  const base = { plans: PLANS, currentPlan: ROOTS };

  it("is not locked when the menu is allowed", () => {
    expect(menuLock({ ...base, menuId: "budget", allowedMenus: ["budget"] })).toEqual({
      kind: "none",
    });
  });

  it("is a plan lock when the plan does not include it", () => {
    const lock = menuLock({ ...base, menuId: "investments", allowedMenus: ["budget"] });
    expect(lock.kind).toBe("plan");
    expect(lock.kind === "plan" && lock.upgrade?.name).toBe("Canopy");
  });

  it("is a PERMISSION lock when the plan includes it but the workspace does not", () => {
    // 🔴 The distinction the whole module exists for. The owner switched
    // `goals` off for this member; paying more would change nothing, so this
    // must never render an upgrade pitch.
    const lock = menuLock({ ...base, menuId: "goals", allowedMenus: ["budget"] });
    expect(lock).toEqual({ kind: "permission" });
  });

  it("stays unknown while access is still loading", () => {
    // Flashing a paywall at a paying customer is the worst failure here, so
    // every uncertainty resolves to "render nothing".
    expect(menuLock({ ...base, menuId: "investments", allowedMenus: null }).kind).toBe("unknown");
  });

  it("stays unknown while the catalogue is missing", () => {
    expect(
      menuLock({ menuId: "investments", allowedMenus: ["budget"], plans: undefined, currentPlan: null })
        .kind,
    ).toBe("unknown");
    expect(
      menuLock({ menuId: "investments", allowedMenus: ["budget"], plans: [], currentPlan: null }).kind,
    ).toBe("unknown");
  });

  it("locks by plan, with nothing to sell, on the top plan's own gaps", () => {
    const top = [ROOTS, plan("Top", 999, ["dashboard"])];
    const lock = menuLock({
      menuId: "trips",
      allowedMenus: ["dashboard"],
      plans: top,
      currentPlan: top[1],
    });
    expect(lock).toEqual({ kind: "plan", upgrade: null });
  });
});

describe("copy", () => {
  it("names the plan in the tooltip when there is one to name", () => {
    expect(lockTooltip("Investments", { kind: "plan", upgrade: CANOPY })).toContain("Canopy");
    expect(lockTooltip("Trips", { kind: "plan", upgrade: null })).toMatch(/not included/i);
    expect(lockTooltip("Budget", { kind: "none" })).toBe("Budget");
  });

  it("describes every menu the app can lock", () => {
    // A paywall that says only "upgrade to unlock Trips" asks somebody to pay
    // for a word. A new menu id must come with a sentence.
    const missing = ALL_MENU_IDS.filter((id) => !MENU_BLURBS[id]);
    expect(missing, `add a line to MENU_BLURBS for: ${missing.join(", ")}`).toEqual([]);
  });

  it("falls back to the label rather than rendering nothing", () => {
    expect(menuBlurb("brand-new-menu", "Brand New")).toContain("Brand New");
  });

  it("keeps the blurb map free of ids the app does not have", () => {
    const stale = Object.keys(MENU_BLURBS).filter((id) => !ALL_MENU_IDS.includes(id));
    expect(stale, `MENU_BLURBS has ids no menu uses: ${stale.join(", ")}`).toEqual([]);
    expect(ACCESS_MENUS.length).toBeGreaterThan(0);
  });
});
