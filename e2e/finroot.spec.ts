import { test, expect } from "@playwright/test";
// Credentials come from .env.e2e (gitignored). If absent, the authenticated
// tests are skipped and only the public smoke tests run. The sign-in + PIN
// gate dance lives in ./auth so all four specs share one copy of it.
import { PIN_SETUP_COPY, hasCreds, signInAndUnlock } from "./auth";

// ─────────────────────────────── Public smoke ───────────────────────────────
test.describe("public", () => {
  test("landing renders with title and an auth CTA", async ({ page }) => {
    const resp = await page.goto("/");
    expect(resp?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/finroot/i);
    // `goto` resolves on load, before React has mounted, so counting matches
    // right away is a race: on a cold dev server the app renders nothing at
    // t=0 and the assertion fails for the wrong reason. Wait for the element.
    const cta = page.locator("a, button").filter({ hasText: /sign in|get started|log in/i });
    await expect(cta.first()).toBeVisible();
  });

  test("auth page shows email + password fields", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("unauthenticated /app redirects to /auth", async ({ page }) => {
    await page.goto("/app");
    await page.waitForTimeout(1200);
    await expect(page).toHaveURL(/\/auth/);
  });

  test("unknown route shows NotFound", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-xyz");
    await expect(page.locator("body")).toContainText(/404|not found|doesn'?t exist/i);
  });

  /**
   * Stage 4.6 / BUG-028.
   *
   * The original version of this test set the viewport BEFORE navigating and
   * sampled once. It passed for months while the page really did overflow by
   * 36 px, because the offender was a testimonial slide that only sticks out
   * mid-transition — and the carousel advances every 5.2 s.
   *
   * So this now does the two things that actually catch it: resize AFTER load
   * (the real user action: rotating, or opening devtools), and sample across a
   * full carousel cycle instead of trusting one instant.
   */
  const measureOverflow = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  test("landing has no horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    expect(await measureOverflow(page)).toBeLessThanOrEqual(2);
  });

  test("landing has no horizontal overflow after a post-load resize", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Desktop first, then shrink — full-bleed layers sized against the wider
    // document are what the load-time-only check could never see.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(600);
    expect(await measureOverflow(page)).toBeLessThanOrEqual(2);
  });

  test("landing stays within the viewport across a carousel cycle", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    let worst = 0;
    // ~12 s covers more than two auto-advances at 5.2 s apart.
    for (let i = 0; i < 24; i++) {
      worst = Math.max(worst, await measureOverflow(page));
      await page.waitForTimeout(500);
    }
    expect(worst, `worst overflow across the cycle was ${worst}px`).toBeLessThanOrEqual(2);
  });
});

// ─────────────────────────── Authenticated journey ──────────────────────────
/**
 * 🔴 **One sign-in for the whole block, not one per test.**
 *
 * Every `signInAndUnlock` is a real Supabase auth call, and the free tier rate-
 * limits them per IP. With a fresh sign-in per feature page this file alone
 * spent eight of them, and adding a ninth route pushed the whole suite over the
 * limit — at which point unrelated specs fail as "the app didn't render", which
 * is about the most misleading failure available. Serial mode plus a shared
 * page keeps the cost at one, and the routes are read-only so they cannot
 * interfere with each other.
 */
test.describe("authenticated", () => {
  // Scoped to this block: the public tests above stay independent, so one
  // failure there does not skip the rest.
  test.describe.configure({ mode: "serial" });
  test.skip(!hasCreds, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  let page: import("@playwright/test").Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signInAndUnlock(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("can sign in, pass the PIN gate, and reach the app", async () => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app/);
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.locator("body")).not.toContainText(PIN_SETUP_COPY);
  });

  for (const path of [
    "/app/income",
    "/app/expenses",
    "/app/budget",
    "/app/goals",
    "/app/investments",
    "/app/import",
    // BUG-087 touched every date on this page; it was the one feature route
    // with no smoke test at all.
    "/app/insurance",
  ]) {
    test(`feature page renders: ${path}`, async () => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
      // Every route is a lazy chunk (Stage 4.1) and /app/import pulls the
      // heaviest one, so a fixed wait is a race: the assertion below has to be
      // the thing that waits, or a slow chunk reads as an empty page.
      await expect(page.locator("main")).not.toBeEmpty();
      await expect(page.locator("body")).not.toContainText(PIN_SETUP_COPY);
      await expect(page.locator("body")).not.toContainText(/enter your \d-digit pin/i);
      const text = await page.locator("body").innerText();
      expect(text.trim().length).toBeGreaterThan(40);
      // BUG-087: a nullable date formatted unconditionally reads as "Invalid
      // Date" / "NaN DAYS". Neither string has any business on any screen, so
      // the check is cheap enough to run on all of them.
      expect(text).not.toMatch(/Invalid Date/i);
      expect(text).not.toMatch(/\bNaN\b/);
    });
  }
});
