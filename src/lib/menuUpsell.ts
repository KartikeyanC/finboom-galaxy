import { type PlanRow } from "@/lib/pricing";

/**
 * Stage 5.5 — why a menu is unavailable, and whether money would fix it.
 *
 * The app has exactly two reasons for hiding a feature, and they call for
 * opposite responses:
 *
 *  * **The plan does not include it.** That is a sales conversation. Show the
 *    feature, say what it does, and offer the upgrade.
 *  * **The workspace owner switched it off** for this tenant or this member
 *    (Stage 3 overrides). That is somebody else's decision about this account,
 *    and dangling "Upgrade to unlock" in front of it would be a lie — paying
 *    more would change nothing.
 *
 * `get_effective_menus()` returns only the final list, which cannot tell the
 * two apart. The distinction is recovered here by comparing that list with the
 * plan's own `menu_set`, both of which the client can already read (`plans` is
 * public catalogue data). This is presentation only — the paywall itself is
 * enforced by `plan_menus()` / `has_menu()` in RLS (Stage 2.15), and nothing
 * here can grant anything.
 */

/** `menu_set` value meaning "every feature menu, including future ones". */
export const ALL_MENUS_TOKEN = "*";

/** The `plans` columns this needs, on top of the pricing ones. */
export interface PlanCatalogueRow extends PlanRow {
  menu_set: string[];
  is_default: boolean;
  created_at: string;
}

export interface SubscriptionLike {
  plan_name: string | null;
  status: string | null;
}

/** Statuses `plan_menus()` accepts as entitling. Anything else falls back. */
const ENTITLING = new Set(["active", "trialing"]);

export function planIncludes(plan: PlanCatalogueRow | null | undefined, menuId: string): boolean {
  if (!plan) return false;
  const set = plan.menu_set ?? [];
  return set.includes(ALL_MENUS_TOKEN) || set.includes(menuId);
}

/**
 * The plan a workspace falls back to — mirrors SQL `default_plan()`:
 * the flagged default, else the cheapest active plan, else the oldest.
 */
export function defaultPlan(plans: PlanCatalogueRow[]): PlanCatalogueRow | null {
  const active = plans.filter((p) => p.is_active);
  if (!active.length) return null;
  return [...active].sort(
    (a, b) =>
      Number(b.is_default) - Number(a.is_default) ||
      a.price_cents - b.price_cents ||
      (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  )[0];
}

/**
 * The plan whose menus are actually in force.
 *
 * Mirrors `plan_menus()`: a subscription only entitles while it is active or
 * trialing, so an EXPIRED Canopy subscription resolves to the default plan —
 * not to Canopy. Reading the name off the subscription alone would tell an
 * expired customer their locked features are already included, which is the
 * one message guaranteed to make them contact support.
 */
export function resolveCurrentPlan(
  plans: PlanCatalogueRow[],
  sub: SubscriptionLike | null | undefined,
): PlanCatalogueRow | null {
  const fallback = defaultPlan(plans);
  if (!sub || !sub.plan_name || !ENTITLING.has((sub.status ?? "").toLowerCase())) return fallback;
  const key = sub.plan_name.trim().toLowerCase();
  return plans.find((p) => p.is_active && p.name.trim().toLowerCase() === key) ?? fallback;
}

/**
 * The cheapest active plan that would unlock `menuId`.
 *
 * Strictly more expensive than the current plan: a sideways move at the same
 * price is not an upgrade, and offering one reads as a downgrade trap.
 */
export function upgradeTarget(
  plans: PlanCatalogueRow[],
  currentPlan: PlanCatalogueRow | null,
  menuId: string,
): PlanCatalogueRow | null {
  const floor = currentPlan?.price_cents ?? -1;
  const candidates = plans
    .filter((p) => p.is_active && p.price_cents > floor && planIncludes(p, menuId))
    .sort((a, b) => a.price_cents - b.price_cents);
  return candidates[0] ?? null;
}

export type MenuLock =
  /** Available — render the feature. */
  | { kind: "none" }
  /** Not resolved yet. Render neither the feature nor a paywall. */
  | { kind: "unknown" }
  /** Outside the plan. `upgrade` is null when no sellable plan includes it. */
  | { kind: "plan"; upgrade: PlanCatalogueRow | null }
  /** Inside the plan, switched off for this workspace or member. */
  | { kind: "permission" };

export interface MenuLockInput {
  menuId: string;
  /** `get_effective_menus()`; null while it is still loading. */
  allowedMenus: string[] | null;
  plans: PlanCatalogueRow[] | undefined;
  currentPlan: PlanCatalogueRow | null;
}

/**
 * 🔴 The failure mode this function exists to avoid is showing a paywall to
 * somebody who has already paid. Every uncertainty therefore resolves to
 * `unknown` (render nothing) rather than to `plan` (render a sales pitch).
 */
export function menuLock({ menuId, allowedMenus, plans, currentPlan }: MenuLockInput): MenuLock {
  if (allowedMenus === null) return { kind: "unknown" };
  if (allowedMenus.includes(menuId)) return { kind: "none" };
  if (!plans || !plans.length) return { kind: "unknown" };
  // The plan is known and includes it, yet it is not allowed → somebody turned
  // it off. Never a sales opportunity.
  if (planIncludes(currentPlan, menuId)) return { kind: "permission" };
  return { kind: "plan", upgrade: upgradeTarget(plans, currentPlan, menuId) };
}

/** Human label for a locked menu's state, used in the sidebar tooltip. */
export function lockTooltip(menuTitle: string, lock: MenuLock): string {
  if (lock.kind !== "plan") return menuTitle;
  return lock.upgrade
    ? `${menuTitle} — included in ${lock.upgrade.name}`
    : `${menuTitle} — not included in your plan`;
}

/**
 * One line on what each feature actually does, for the locked page.
 *
 * A paywall that only says "upgrade to unlock Trips" asks somebody to pay for
 * a word. `menuBlurb` falls back to the menu label so a new menu id is a
 * missing sentence, never a missing screen — `menuUpsell.test.ts` fails if one
 * is added without a line here.
 */
export const MENU_BLURBS: Record<string, string> = {
  dashboard: "Your net worth, cash flow and goals on one screen.",
  income: "Track every stream — salary, freelance, rent, dividends — and see what is actually recurring.",
  expenses: "Categorised spending, recurring bills, subscriptions and split expenses in one ledger.",
  investments: "Holdings across demat, mutual funds and deposits, valued with live prices.",
  budget: "Seven-jar budgets whose spend is derived from your real transactions, not typed in.",
  goals: "Savings targets with progress, contributions and a date you can actually hit.",
  reminders: "Due dates for bills, premiums and maturities, before they become late fees.",
  calculator: "SIP, EMI, and goal calculators that use the numbers already in your workspace.",
  "bill-scan": "Photograph a bill and have the line items categorised and logged for you.",
  import: "Bring in statements as CSV, Excel or PDF, with duplicate detection.",
  export: "Export your workspace data as CSV, scoped to what you can already see.",
  insurance: "Every policy, premium date and document in one place, with carryover tracking.",
  "net-worth": "Assets minus liabilities over time, derived from your accounts and holdings.",
  trips: "Trip budgets with companions, shared costs and per-person settlement.",
  billing: "Your plan, invoices and payment method.",
};

export function menuBlurb(menuId: string, fallbackLabel: string): string {
  return MENU_BLURBS[menuId] ?? `${fallbackLabel} is part of a higher plan.`;
}
