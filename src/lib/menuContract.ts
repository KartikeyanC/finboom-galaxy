/**
 * Stage 2.15 / BUG-021 / AZ-001 — the menu-vs-paywall contract, as data.
 *
 * The decision (2026-08-05): a menu is a REAL permission and a REAL paywall
 * for every feature that owns its own table, and navigation-only for the
 * features that share `transactions`.
 *
 * This file is the single written statement of that split. It exists as code
 * rather than prose so it can be *tested*: `menuContract.test.ts` asserts that
 *
 *   1. every id in ACCESS_MENUS is classified exactly once here, and
 *   2. the RLS side of the contract — the table/menu pairs in migration
 *      `20260805230000_stage2_menu_paywall.sql` — matches ENFORCED_MENUS.
 *
 * So adding a menu to ACCESS_MENUS, or gating a new table in SQL, fails the
 * suite until this file is updated too. That is the whole point: AZ-001 was
 * caused by the client and the server holding different beliefs about what a
 * menu means, and the only durable fix is to make disagreement loud.
 *
 * @see supabase/migrations/20260805230000_stage2_menu_paywall.sql
 * @see docs/Authorization_Flow.md (AZ-001)
 */

/**
 * Menus enforced in RLS, mapped to the tables carrying the `has_menu()`
 * predicate. Denying one of these — by plan, by tenant deny-list, or by
 * per-member allow-list — makes the underlying rows unreadable and
 * unwritable over REST, not merely un-navigable.
 */
export const ENFORCED_MENUS: Readonly<Record<string, readonly string[]>> = {
  investments: ["investments", "demat_accounts", "demat_ledger"],
  insurance: ["insurance"],
  trips: ["trips"],
  "net-worth": ["net_worth_entries", "net_worth_snapshots"],
  reminders: ["reminders"],
  goals: ["goals"],
  budget: ["budgets"],
  income: ["income_streams"],
} as const;

/**
 * Menus that hide the link and block the route, and nothing more. These read
 * and write the shared `transactions` table (or no table at all), so a row
 * cannot be attributed to one menu without inventing a category→menu mapping
 * — and a wrong mapping would silently drop rows out of the dashboard, the
 * budget-spend derivation and every aggregate.
 *
 * Do not describe these as permissions in UI copy. They are navigation.
 */
export const NAVIGATION_ONLY_MENUS: readonly string[] = [
  "dashboard",
  "expenses",
  "import",
  "export",
  "bill-scan",
  "calculator",
  "billing",
] as const;

/** Menu ids whose data is genuinely gated server-side. */
export const ENFORCED_MENU_IDS: readonly string[] = Object.keys(ENFORCED_MENUS);

/** True when denying `menuId` also denies the underlying data. */
export function isEnforcedMenu(menuId: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENFORCED_MENUS, menuId);
}

/**
 * One-line explanation for UI copy next to a menu toggle, so an owner or PO
 * knows whether they are restricting data or only tidying the sidebar.
 */
export function menuEnforcementNote(menuId: string): string {
  return isEnforcedMenu(menuId)
    ? "Turning this off also blocks access to the data, not just the menu."
    : "Hides the menu and its page. The underlying records stay reachable to members.";
}
