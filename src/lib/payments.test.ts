import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative, sep } from "node:path";
import { paymentsConfigured, contactUpgradeHref, SUPPORT_EMAIL } from "./payments";

/**
 * Stage 2.11 / BUG-018.
 *
 * The coupon feature was removed from the customer-facing app because nothing
 * could redeem a code: the banner advertised "WELCOME20 — 20% off", the copy
 * button worked, and there was no checkout to apply it to. These tests pin both
 * halves of that decision — the gateway signal itself, and the fact that the
 * customer-facing app no longer reads `coupons` at all.
 */

afterEach(() => vi.unstubAllEnvs());

describe("paymentsConfigured", () => {
  it("is false when no client token is set", () => {
    vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", "");
    expect(paymentsConfigured()).toBe(false);
  });

  it("is false for a whitespace-only token", () => {
    // A half-filled .env is the likeliest way this goes wrong, and it must not
    // read as "gateway live" — that is exactly the dead-checkout case.
    vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", "   ");
    expect(paymentsConfigured()).toBe(false);
  });

  it("is true once a token is present", () => {
    vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", "test_abc123");
    expect(paymentsConfigured()).toBe(true);
  });
});

describe("contactUpgradeHref", () => {
  it("addresses the support inbox", () => {
    expect(contactUpgradeHref()).toContain(`mailto:${SUPPORT_EMAIL}`);
  });

  it("names the plan in the subject so the reply is actionable", () => {
    const href = contactUpgradeHref("Canopy");
    expect(href).toContain(`subject=${encodeURIComponent("Upgrade to Canopy")}`);
  });

  it("includes the workspace when known", () => {
    const href = contactUpgradeHref("Canopy", "Demo Owner's Workspace");
    expect(decodeURIComponent(href)).toContain("Demo Owner's Workspace");
  });

  it("escapes characters that would break the mailto", () => {
    const href = contactUpgradeHref("Canopy", "A&B / C?D");
    // The raw separators must not survive into the URL unencoded.
    const query = href.slice(href.indexOf("?") + 1);
    expect(query).not.toContain("&B");
    expect(query).not.toContain("?D");
    expect(decodeURIComponent(href)).toContain("A&B / C?D");
  });

  it("still works with no plan and no workspace", () => {
    const href = contactUpgradeHref();
    expect(href).toContain("subject=");
    expect(href).toContain("body=");
  });
});

describe("the coupon feature is gone from the customer-facing app", () => {
  const SRC = resolve(__dirname, "..");

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });

  // Everything except the PO console, which legitimately still owns the CRUD
  // (gated behind paymentsConfigured()) so the feature can be revived.
  const customerFacing = walk(SRC).filter((f) => {
    const rel = relative(SRC, f);
    return !rel.startsWith(`pages${sep}po${sep}`) && !/\.test\.(ts|tsx)$/.test(rel);
  });

  it("finds files to scan", () => {
    expect(customerFacing.length).toBeGreaterThan(50);
  });

  it("no customer-facing file queries the coupons table", () => {
    const offenders = customerFacing.filter((f) =>
      /from\(\s*["'`]coupons["'`]\s*\)/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it("the promo banner and its hook are not reintroduced", () => {
    const offenders = customerFacing.filter((f) =>
      /\b(PromoBanner|usePromo)\b/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });
});
