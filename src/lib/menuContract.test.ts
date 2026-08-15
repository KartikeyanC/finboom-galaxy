import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_MENU_IDS } from "./accessMenus";
import {
  ENFORCED_MENUS,
  ENFORCED_MENU_IDS,
  NAVIGATION_ONLY_MENUS,
  isEnforcedMenu,
  menuEnforcementNote,
} from "./menuContract";

/**
 * Stage 2.15 / AZ-001 drift guard.
 *
 * AZ-001 happened because the client believed menus were permissions while the
 * database had never heard of them. The fix is only durable if the two halves
 * cannot drift again, so this asserts both directions offline:
 *
 *   - every menu id is classified exactly once (enforced XOR navigation-only),
 *     so a new menu cannot be added without someone deciding which it is;
 *   - the table→menu pairs that actually carry the has_menu() predicate in SQL
 *     are exactly the ones ENFORCED_MENUS claims.
 *
 * Sibling of accessMenus.test.ts, which pins ACCESS_MENUS to all_feature_menus().
 */

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

/**
 * The (table, menu) pairs from the VALUES list in the most recent migration
 * that defines has_menu(). That loop is what rebuilds the RLS policies, so it
 * is the authoritative statement of what is gated server-side.
 */
function gatedPairsFromMigrations(): Array<{ table: string; menu: string }> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let latest: string | null = null;
  for (const f of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, f), "utf8");
    if (/FUNCTION\s+public\.has_menu\s*\(/i.test(sql)) latest = sql;
  }
  if (!latest) throw new Error("No migration defines has_menu()");

  // Scope to the VALUES block before matching triples — a bare triple regex
  // also catches things like IN ('weekly', 'monthly', 'yearly') further down.
  const block = latest.match(/FROM\s+\(VALUES([\s\S]*?)\)\s+AS\s+t\s*\(\s*tbl/i);
  if (!block) throw new Error("Could not locate the VALUES block in has_menu migration");

  // ('investments', 'investments', 'investments'),  -- (table, menu, prefix)
  const rows = [
    ...block[1].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z-]+)'\s*,\s*'([a-z_]+)'\s*\)/g),
  ];
  if (rows.length === 0) throw new Error("Could not parse the VALUES list");

  return rows.map((m) => ({ table: m[1], menu: m[2] }));
}

describe("menu-vs-paywall contract (AZ-001)", () => {
  const pairs = gatedPairsFromMigrations();

  it("parses the gated table list out of the migration", () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("classifies every menu exactly once", () => {
    const classified = [...ENFORCED_MENU_IDS, ...NAVIGATION_ONLY_MENUS].sort();
    expect(classified).toEqual([...ALL_MENU_IDS].sort());
  });

  it("never classifies a menu as both enforced and navigation-only", () => {
    const overlap = NAVIGATION_ONLY_MENUS.filter((m) => isEnforcedMenu(m));
    expect(overlap).toEqual([]);
  });

  it("gates exactly the tables ENFORCED_MENUS claims", () => {
    const fromSql = pairs.map((p) => `${p.menu}:${p.table}`).sort();
    const fromTs = Object.entries(ENFORCED_MENUS)
      .flatMap(([menu, tables]) => tables.map((t) => `${menu}:${t}`))
      .sort();
    expect(fromSql).toEqual(fromTs);
  });

  it("gates each table under one menu only", () => {
    const tables = pairs.map((p) => p.table);
    expect(new Set(tables).size).toBe(tables.length);
  });

  it("only gates menus the client actually knows about", () => {
    for (const { menu } of pairs) expect(ALL_MENU_IDS).toContain(menu);
  });

  it("leaves the transactions-backed menus ungated", () => {
    // The reason these are navigation-only: gating them means gating
    // `transactions`, which every aggregate reads.
    const gatedMenus = new Set(pairs.map((p) => p.menu));
    for (const m of NAVIGATION_ONLY_MENUS) expect(gatedMenus.has(m)).toBe(false);
  });

  it("never gates the shared or always-allowed tables", () => {
    const forbidden = ["transactions", "accounts", "profiles", "tenants", "tenant_members"];
    for (const { table } of pairs) expect(forbidden).not.toContain(table);
  });

  it("describes enforcement honestly in UI copy", () => {
    expect(menuEnforcementNote("investments")).toMatch(/blocks access to the data/i);
    expect(menuEnforcementNote("expenses")).toMatch(/stay reachable/i);
  });
});

describe("the SECURITY DEFINER write paths are gated too", () => {
  // RLS does not apply inside a SECURITY DEFINER function, so goal_contribute
  // and budget_set_allocation would otherwise be an open side door into two
  // tables this migration gates.
  const sql = (() => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    let latest: string | null = null;
    for (const f of files) {
      const body = readFileSync(resolve(MIGRATIONS_DIR, f), "utf8");
      if (/FUNCTION\s+public\.has_menu\s*\(/i.test(body)) latest = body;
    }
    return latest as string;
  })();

  it("goal_contribute checks the goals menu", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.goal_contribute"));
    expect(fn).toMatch(/has_menu\([^)]*'goals'\)/);
  });

  it("budget_set_allocation checks the budget menu", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.budget_set_allocation"));
    expect(fn).toMatch(/has_menu\([^)]*'budget'\)/);
  });
});
