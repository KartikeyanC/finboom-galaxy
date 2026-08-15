import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import {
  DEVICE_LOCAL_STATE,
  MIGRATION_FLAG_PREFIXES,
  LEGACY_IMPORT_ONLY_KEYS,
  isRegisteredDeviceLocal,
  deviceLocalEntry,
} from "./deviceLocal";

/**
 * Stage 3.2 / UX-043 — the guard that makes device-local a decision.
 *
 * BUG-026/071 happened because five features became device-local by default:
 * someone reached for localStorage, and nobody ever revisited it. This test
 * scans the source for storage keys and fails on any that are not accounted
 * for, so the next `localStorage.setItem` forces the same question — should
 * this follow the user, or the browser?
 */

const SRC = resolve(__dirname, "..");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });

/** Every string literal handed to localStorage/sessionStorage across the app. */
function storageKeysInSource(): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = [];
  for (const f of walk(SRC)) {
    const rel = relative(SRC, f).replace(/\\/g, "/");
    // Only the registry itself is allowed to list keys without touching storage.
    if (rel === "lib/deviceLocal.ts") continue;
    const src = readFileSync(f, "utf8");

    // Direct literal: localStorage.getItem("finroot.theme")
    for (const m of src.matchAll(
      /(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*["'`]([^"'`$]+)["'`]/g,
    )) {
      found.push({ key: m[1], file: rel });
    }
    // Template head: `finroot.pin.${uid}` -> record the static prefix.
    for (const m of src.matchAll(
      /(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*`([^`$]*)\$\{/g,
    )) {
      if (m[1]) found.push({ key: m[1], file: rel });
    }
    // Indirect: `const STORAGE_KEY = "…"` then `getItem(STORAGE_KEY)`.
    // Without this the scan misses the most idiomatic form there is — which it
    // did, until `insurance.policies.v1` turned up during Stage 3.3.
    for (const m of src.matchAll(
      /(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g,
    )) {
      // Require the declaration to be a COMPLETE string assignment. Without the
      // trailing `;`/newline anchor this also matches the first literal of a
      // concatenation — e.g. appLock's `const newKey = "finroot." + key.slice(…)`,
      // which is a computed rename, not a key.
      const decl = new RegExp(
        `\\b(?:const|let|var)\\s+${m[1]}\\s*(?::[^=]+)?=\\s*["'\`]([^"'\`]+)["'\`]\\s*(?:;|$)`,
        "m",
      );
      const hit = decl.exec(src);
      if (hit) found.push({ key: hit[1], file: rel });
    }
  }
  return found;
}

const accountedFor = (key: string) =>
  isRegisteredDeviceLocal(key) ||
  MIGRATION_FLAG_PREFIXES.some((p) => key.startsWith(p)) ||
  LEGACY_IMPORT_ONLY_KEYS.includes(key);

describe("device-local registry", () => {
  it("registers a non-trivial amount of state", () => {
    expect(DEVICE_LOCAL_STATE.length).toBeGreaterThan(5);
  });

  it("gives every entry a user-facing label and a real reason", () => {
    for (const e of DEVICE_LOCAL_STATE) {
      expect(e.label.length, e.key).toBeGreaterThan(0);
      // A reason short enough to be a restatement of the key is not a reason.
      expect(e.reason.length, e.key).toBeGreaterThan(40);
    }
  });

  it("has no duplicate keys", () => {
    const keys = DEVICE_LOCAL_STATE.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps the per-tab unlock flag in sessionStorage", () => {
    // If this ever becomes localStorage the app-lock silently stops re-prompting
    // on a new tab, which is the entire mechanism.
    const unlock = deviceLocalEntry("finroot.unlocked.abc123");
    expect(unlock?.store).toBe("session");
  });

  it("matches prefixed keys but not near-misses", () => {
    expect(isRegisteredDeviceLocal("finroot.pin.abc-123")).toBe(true);
    expect(isRegisteredDeviceLocal("finroot.theme")).toBe(true);
    expect(isRegisteredDeviceLocal("finroot.theme.extra")).toBe(false);
    expect(isRegisteredDeviceLocal("something.invented")).toBe(false);
  });
});

describe("no unregistered browser storage in the app", () => {
  const found = storageKeysInSource();

  it("finds storage usage to check", () => {
    expect(found.length).toBeGreaterThan(5);
  });

  it("every storage key is registered, a migration flag, or a legacy import", () => {
    const orphans = found
      .filter(({ key }) => !accountedFor(key))
      .map(({ key, file }) => `${file}: "${key}"`);
    expect(
      [...new Set(orphans)],
      "Add it to DEVICE_LOCAL_STATE with a reason, or move it to the server (Stage 3.1)",
    ).toEqual([]);
  });

  it("the five features moved in 3.1 are read only by their importers", () => {
    // A write to any of these would mean the feature drifted back to the device.
    const migrated = [
      "custom-categories-v1",
      "expense.custom-subcategories.v1",
      "budgetAllocator.v1",
      "finroot.baseCurrency",
      "finroot.recurring.reminders.v1",
    ];
    const writers: string[] = [];
    for (const f of walk(SRC)) {
      const rel = relative(SRC, f).replace(/\\/g, "/");
      if (rel === "lib/deviceLocal.ts" || rel === "lib/tenantSettings.ts") continue;
      const src = readFileSync(f, "utf8");
      for (const key of migrated) {
        const re = new RegExp(`setItem\\(\\s*["'\`]${key.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}`);
        if (re.test(src)) writers.push(`${rel}: ${key}`);
      }
    }
    expect(writers).toEqual([]);
  });
});
