import type { Page } from "@playwright/test";

/**
 * The sign-in + PIN-gate dance, in one place.
 *
 * It was copy-pasted into four specs, and Stage 5.4 — which turned the PIN
 * from a wall into an offer and reworded every screen in the gate — would have
 * had to edit all four copies identically or leave a spec signing in against
 * copy that no longer exists.
 */

export const EMAIL = process.env.E2E_EMAIL || "";
export const PASSWORD = process.env.E2E_PASSWORD || "";
export const PIN = process.env.E2E_PIN || "3210";
export const hasCreds = !!(EMAIL && PASSWORD);

/** The PIN-setup screen: offered on a device with no PIN, or after a reset. */
export const PIN_SETUP_COPY = /add a pin to this device|choose a new pin/i;
/** The lock screen, in its everyday PIN form. */
export const LOCK_SCREEN_COPY = /enter your \d-digit pin/i;

/**
 * Sign in, then get past whichever gate this browser profile lands on.
 *
 * A fresh Playwright context has no stored PIN, so it is offered one and this
 * accepts: the authenticated specs test the app behind the lock, and declining
 * would leave the locked path untested everywhere else.
 */
export async function signInAndUnlock(page: Page) {
  await page.goto("/auth");
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]:visible').first().click();
  await page.waitForTimeout(3500);

  const body = await page.locator("body").innerText();

  if (PIN_SETUP_COPY.test(body)) {
    // Pick the length explicitly. The offer defaults to 6 digits since
    // BUG-091, and E2E_PIN is 4 — filling a 4-digit PIN into a form expecting
    // 6 just raises "PIN must be 6 digits" and leaves the offer on screen.
    await page.getByRole("button", { name: `${PIN.length} digits` }).click();
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill(PIN);
    await pw.nth(1).fill(PIN);
    await page.getByRole("button", { name: /turn on app lock|save new pin/i }).click();
    await page.waitForTimeout(2000);
    return;
  }

  if (LOCK_SCREEN_COPY.test(body)) {
    // The PIN boxes are one hidden numeric input; it unlocks on the last digit.
    await page.locator('input[aria-label="PIN"]').fill(PIN);
    await page.waitForTimeout(1500);
    return;
  }

  if (/re-enter your password/i.test(body)) {
    await page.locator("#lock-pwd").fill(PASSWORD);
    await page.getByRole("button", { name: /^unlock$/i }).click();
    await page.waitForTimeout(1500);
  }
}
