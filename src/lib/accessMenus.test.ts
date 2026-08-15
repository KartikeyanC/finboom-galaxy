import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ACCESS_MENUS, ALL_MENU_IDS } from "./accessMenus";

/**
 * The client's menu ids (ACCESS_MENUS) and the database's all_feature_menus()
 * must stay in step. If they drift, the effects are quiet and confusing:
 *
 *  - an id the DB has but the client doesn't  -> a menu nobody can ever reach
 *  - an id the client has but the DB doesn't  -> get_effective_menus() never
 *    returns it, so the page is invisible even to owners on the top plan
 *
 * That is exactly how 'budget-allocator' and 'subscriptions' lingered in the DB
 * after their pages were deleted. Rather than require a live database, this
 * reads the migration that defines the function, so it runs in CI offline.
 */

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

/** Menu ids from the most recent migration that (re)defines all_feature_menus(). */
function menuIdsFromMigrations(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let latest: string | null = null;
  for (const f of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, f), "utf8");
    if (/FUNCTION\s+public\.all_feature_menus\s*\(/i.test(sql)) latest = sql;
  }
  if (!latest) throw new Error("No migration defines all_feature_menus()");

  // Grab the ARRAY[ ... ] literal and pull out the quoted ids.
  const arr = latest.match(/ARRAY\s*\[([\s\S]*?)\]/i);
  if (!arr) throw new Error("Could not parse the ARRAY[...] literal");

  return [...arr[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("menu ids: client vs database", () => {
  const dbMenus = menuIdsFromMigrations();

  it("parses a non-empty list out of the migration", () => {
    expect(dbMenus.length).toBeGreaterThan(0);
  });

  it("has no duplicates on either side", () => {
    expect(new Set(dbMenus).size).toBe(dbMenus.length);
    expect(new Set(ALL_MENU_IDS).size).toBe(ALL_MENU_IDS.length);
  });

  it("exposes no database menu the client cannot render", () => {
    const orphaned = dbMenus.filter((m) => !ALL_MENU_IDS.includes(m));
    expect(orphaned, `in all_feature_menus() but not ACCESS_MENUS: ${orphaned.join(", ")}`).toEqual([]);
  });

  it("has no client menu the database will never grant", () => {
    const ungrantable = ALL_MENU_IDS.filter((m) => !dbMenus.includes(m));
    expect(
      ungrantable,
      `in ACCESS_MENUS but not all_feature_menus(): ${ungrantable.join(", ")}`,
    ).toEqual([]);
  });

  it("matches exactly, ignoring order", () => {
    expect([...ALL_MENU_IDS].sort()).toEqual([...dbMenus].sort());
  });

  it("gives every menu a non-empty label", () => {
    for (const m of ACCESS_MENUS) {
      expect(m.id.trim().length, `empty id`).toBeGreaterThan(0);
      expect(m.label.trim().length, `empty label for ${m.id}`).toBeGreaterThan(0);
    }
  });
});
