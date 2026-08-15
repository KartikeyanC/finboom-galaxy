import { test, expect } from "@playwright/test";
import { EMAIL, PASSWORD, PIN, PIN_SETUP_COPY, signInAndUnlock } from "./auth";

/**
 * Stage 5.4 — the PIN stopped being a wall.
 *
 * Each test gets its own browser context, which is the only reason these are
 * testable at all: a fresh context has no stored PIN, so it lands on the offer
 * exactly as a new device would.
 */

test.describe("app lock", () => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  test("the PIN is offered, and 'Not now' is a real answer", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/auth");
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]:visible').first().click();

    // The offer, not an order — and it says what the lock is not.
    await expect(page.getByRole("heading", { name: PIN_SETUP_COPY })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("body")).toContainText(/does not encrypt/i);

    await page.getByRole("button", { name: /^not now$/i }).click();

    // Straight into the app, and it stays that way across a reload — a
    // declined lock that reappears is not optional, it is nagging.
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
    await expect(page.locator("main")).not.toBeEmpty();
    await page.reload();
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.locator("body")).not.toContainText(PIN_SETUP_COPY);

    // With no lock in force there is nothing for the Lock button to do.
    await expect(page.getByTitle(/^Lock —/)).toHaveCount(0);
  });

  test("a forgotten PIN is recoverable with the account password", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page); // accepts the offer, so a PIN exists
    await page.goto("/app");
    await expect(page.locator("main")).not.toBeEmpty();

    await page.getByTitle(/^Lock —/).click();
    await expect(page.getByText(/enter your \d-digit pin/i)).toBeVisible();

    // Before 5.4 the only way past this screen was signing out.
    await page.getByRole("button", { name: /forgot your pin/i }).click();
    await page.locator("#lock-pwd").fill(PASSWORD);
    await page.getByRole("button", { name: /verify & reset pin/i }).click();

    // The password — the credential that actually protects the data — hands
    // back exactly what was lost: the chance to set a new PIN.
    await expect(page.getByRole("heading", { name: /choose a new pin/i })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: `${PIN.length} digits` }).click();
    await page.locator("#pin-new").fill(PIN);
    await page.locator("#pin-confirm").fill(PIN);
    await page.getByRole("button", { name: /save new pin/i }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
    await expect(page.locator("main")).not.toBeEmpty();
  });

  // Both halves of the grace rule in ONE session on purpose: each test signs
  // in for real, and a spec that authenticates four times in a row against the
  // same account starts getting rate-limited — which fails as "the app didn't
  // render", the least informative failure there is.
  test("a quick tab switch is forgiven; a long absence is not", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app");
    await expect(page.locator("main")).not.toBeEmpty();

    // Playwright cannot really background a tab, so the visibility events are
    // dispatched directly — which is what the gate listens to either way.
    const away = (agoMs: number) =>
      page.evaluate((ago) => {
        const uid = Object.keys(localStorage)
          .filter((k) => k.startsWith("finroot.pin."))
          .map((k) => k.slice("finroot.pin.".length))[0];
        const set = (hidden: boolean) => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => (hidden ? "hidden" : "visible"),
          });
          document.dispatchEvent(new Event("visibilitychange"));
        };
        set(true);
        if (ago > 0) {
          // Rewind the away-clock past any offered grace period.
          sessionStorage.setItem(`finroot.lock.hiddenAt.${uid}`, String(Date.now() - ago));
        }
        set(false);
      }, agoMs);

    await away(0);
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.getByText(/enter your \d-digit pin/i)).toHaveCount(0);

    await away(60 * 60 * 1000);
    await expect(page.getByText(/enter your \d-digit pin/i)).toBeVisible();
  });
});
