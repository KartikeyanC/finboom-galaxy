import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import {
  TENANT_SETTINGS,
  TENANT_SETTING_KEYS,
  TENANT_SETTING_KEY_FORMAT,
  isTenantSettingKey,
  importedFlagKey,
} from "./tenantSettings";

/**
 * Stage 3.1 drift guard.
 *
 * `tenant_settings` constrains the key's shape in SQL but not its spelling, so
 * this file is the spelling authority. A typo at a call site would not error —
 * it would quietly read a non-existent row and return the default, which looks
 * exactly like "this workspace has no custom categories". These tests make that
 * class of mistake fail the build instead.
 */

const SRC = resolve(__dirname, "..");
const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });

describe("tenant settings registry", () => {
  it("registers every key it claims to", () => {
    expect(TENANT_SETTING_KEYS.length).toBeGreaterThan(0);
    expect(new Set(TENANT_SETTING_KEYS).size).toBe(TENANT_SETTING_KEYS.length);
  });

  it("every key satisfies the SQL CHECK, so the client never round-trips a doomed write", () => {
    for (const key of TENANT_SETTING_KEYS) {
      expect(TENANT_SETTING_KEY_FORMAT.test(key), key).toBe(true);
    }
  });

  it("mirrors the CHECK expression in the migration", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    const sql = files
      .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
      .find((s) => /CREATE TABLE[\s\S]*?public\.tenant_settings/i.test(s));
    expect(sql, "no migration creates tenant_settings").toBeTruthy();
    // If the SQL rule is loosened or tightened, this constant has to move too.
    expect(sql).toContain("^[a-z][a-z0-9_]*$");
  });

  it("gives every migrated setting a distinct legacy localStorage key", () => {
    // Optional since 5.3: a setting introduced after 3.1 has no localStorage
    // predecessor. What must never happen is two settings claiming the SAME
    // legacy key — the importer would copy one feature's state into the other.
    const legacy = TENANT_SETTING_KEYS.map((k) => TENANT_SETTINGS[k].legacyKey).filter(
      (k): k is string => k !== undefined,
    );
    expect(new Set(legacy).size).toBe(legacy.length);
    for (const k of legacy) expect(k.length).toBeGreaterThan(0);
  });

  it("gives every setting a default, so a missing row never renders undefined", () => {
    for (const key of TENANT_SETTING_KEYS) {
      expect(TENANT_SETTINGS[key].defaultValue, key).toBeDefined();
    }
  });

  it("recognises only registered keys", () => {
    expect(isTenantSettingKey("custom_categories")).toBe(true);
    expect(isTenantSettingKey("custom_catgeories")).toBe(false);
    expect(isTenantSettingKey("")).toBe(false);
  });

  it("scopes the import flag per tenant", () => {
    // Not per-tenant would import one workspace's categories into another.
    const a = importedFlagKey("custom_categories", "tenant-a");
    const b = importedFlagKey("custom_categories", "tenant-b");
    expect(a).not.toBe(b);
    expect(a).toContain("tenant-a");
  });
});

describe("call sites only use registered keys", () => {
  const files = walk(SRC);

  it("finds source to scan", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("every useTenantSetting(...) argument is registered", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/useTenantSetting\(\s*["'`]([^"'`]+)["'`]/g)) {
        if (!isTenantSettingKey(m[1])) bad.push(`${relative(SRC, f)}: "${m[1]}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no source file touches a migrated localStorage key through the storage API", () => {
    // The one-time import in useTenantSetting is the ONLY thing allowed to read
    // these, and it does so via TENANT_SETTINGS[key].legacyKey — never a literal.
    // Matching on a storage CALL rather than a bare mention is deliberate: the
    // device-local registry documents these same key names in prose, and that
    // is not a regression.
    const legacy = TENANT_SETTING_KEYS.map((k) => TENANT_SETTINGS[k].legacyKey).filter(
      (k): k is string => k !== undefined,
    );
    const bad: string[] = [];
    for (const f of files) {
      const rel = relative(SRC, f).replace(/\\/g, "/");
      const src = readFileSync(f, "utf8");
      for (const key of legacy) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const call = new RegExp(
          `(?:localStorage|sessionStorage)\\.(?:get|set|remove)Item\\(\\s*["'\`]${escaped}["'\`]`,
        );
        if (call.test(src)) bad.push(`${rel}: ${key}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
