import { test, expect, type Page } from "@playwright/test";
import { EMAIL, PASSWORD, LOCK_SCREEN_COPY } from "./auth";

/**
 * The LOCK suite from docs/REMAINING_TESTS.md §1, executed.
 *
 * `app-lock.spec.ts` covers the three behaviours Stage 5.4 introduced. This
 * covers the register: the twelve numbered cases, several of which predate 5.4
 * and were rewritten against it rather than filed as bugs.
 *
 * Cases are grouped by how many real sign-ins they need, not by number. Every
 * test here authenticates against the live project, and a spec that signs in a
 * dozen times in three minutes gets throttled — which surfaces as "the app
 * never rendered", the least informative failure there is.
 */

const PIN4 = "3210";
const PIN6 = "654321";

const uidFromStorage = (page: Page) =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("finroot.pin."));
    return k ? k.slice("finroot.pin.".length) : null;
  });

const authToken = (page: Page) =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    return k ? localStorage.getItem(k) : null;
  });

/**
 * Sign in and stop at whatever gate this browser profile lands on.
 *
 * Three things make the naive version flaky, and each costs a whole test:
 *
 *  * The form remounts once `useAuth` resolves `getSession()` and the app
 *    swaps its loading boundary for the routed page — silently emptying a
 *    field that was filled a moment earlier. So the fields are filled and then
 *    *read back*, and the whole thing retried until the values stick.
 *  * The email field is not always there. Once a profile has been saved on the
 *    device, `/auth` greets you with a chip and a password box instead.
 *  * Since BUG-093, `/auth` has its own `<main>` (it was the one route
 *    missing the landmark). Every caller in this file uses
 *    `locator("main")).not.toBeEmpty()` as its "sign-in has actually landed
 *    somewhere" signal, and `/auth`'s own main satisfies that — so a caller
 *    could read that signal while the SIGNED_IN handler was still in flight,
 *    check the dashboard's state, then have that handler's delayed write
 *    (`setPasswordAuthNow`) land moments later and silently clobber whatever
 *    the test had just set up. Waiting for the URL to actually leave `/auth`
 *    is the one signal that is unambiguous — it only flips once `user` is
 *    set, which is the same state change that write depends on.
 */
async function signIn(page: Page) {
  await page.goto("/auth");
  const email = page.locator("#signin-email");
  const password = page.locator("#signin-password");
  await expect(password).toBeVisible({ timeout: 30_000 });

  await expect(async () => {
    if (await email.count()) {
      await email.fill(EMAIL);
      await expect(email).toHaveValue(EMAIL, { timeout: 2_000 });
    }
    await password.fill(PASSWORD);
    await expect(password).toHaveValue(PASSWORD, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await page.locator('button[type="submit"]:visible').first().click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });
}

/** Accept the PIN offer at the given length. */
async function acceptOffer(page: Page, pin: string) {
  await page.getByRole("button", { name: `${pin.length} digits` }).click();
  await page.locator("#pin-new").fill(pin);
  await page.locator("#pin-confirm").fill(pin);
  await page.getByRole("button", { name: /turn on app lock/i }).click();
  await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
}

test.describe("LOCK — app-lock PIN", () => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  /**
   * LOCK-001 · LOCK-003 (6-digit) · LOCK-009 · LOCK-005 · LOCK-004 · LOCK-007
   * One sign-in — everything here is reachable from a single live session.
   */
  test("offer, 6-digit PIN, lock button, wrong PIN, unlock, tab hide", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page);

    // ---- LOCK-001 (rewritten for 5.4): offered, not forced, and not skippable
    await expect(page.getByRole("heading", { name: /add a pin to this device/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /^not now$/i })).toBeVisible();
    // BUG-091: the offer opens on 6 digits. The KDF fixed the price per guess;
    // only the length fixes how many guesses there are, and the default is
    // what most people will accept without thinking about it.
    await expect(page.getByRole("button", { name: "6 digits" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // "Cannot bypass" survives 5.4 in the form that still matters: the offer is
    // a route gate, so a deeper URL does not get round it. Declining is an
    // answer; navigating past it is not.
    await page.goto("/app/transactions");
    await expect(page.getByRole("heading", { name: /add a pin to this device/i })).toBeVisible({
      timeout: 30_000,
    });

    // ---- LOCK-003, half one: a 6-digit PIN, and the length is remembered
    await acceptOffer(page, PIN6);
    const uid = await uidFromStorage(page);
    expect(uid).not.toBeNull();
    expect(await page.evaluate((u) => localStorage.getItem(`finroot.pinlen.${u}`), uid)).toBe("6");

    // ---- LOCK-009: locking is not signing out
    const tokenBefore = await authToken(page);
    expect(tokenBefore).not.toBeNull();

    await page.getByTitle(/^Lock —/).click();
    // The lock screen draws one box per stored digit — the 6 it was told about.
    await expect(page.getByText(/enter your 6-digit pin/i)).toBeVisible();
    expect(await authToken(page)).toBe(tokenBefore); // same Supabase session, still valid

    // ---- LOCK-005: three wrong PINs, no way through
    for (let i = 0; i < 3; i++) {
      await page.locator('input[aria-label="PIN"]').fill("111111");
      await expect(page.getByText(/incorrect pin/i)).toBeVisible();
      await expect(page.getByText(LOCK_SCREEN_COPY)).toBeVisible();
      await expect(page.locator("main")).toHaveCount(0);
    }

    // ---- LOCK-004: and the right one gets in, on the session that never went away
    await page.locator('input[aria-label="PIN"]').fill(PIN6);
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    // ---- LOCK-007 (rewritten for 5.4): hiding starts a clock, it does not lock
    // Playwright cannot really background a tab, so the visibility events are
    // dispatched directly — which is what the gate listens to either way.
    const away = (agoMs: number) =>
      page.evaluate(
        ({ ago, u }) => {
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
            sessionStorage.setItem(`finroot.lock.hiddenAt.${u}`, String(Date.now() - ago));
          }
          set(false);
        },
        { ago: agoMs, u: uid as string },
      );

    await away(0); // glanced at another tab
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.getByText(LOCK_SCREEN_COPY)).toHaveCount(0);

    await away(60 * 60 * 1000); // an hour away, well past the 5-minute default
    await expect(page.getByText(LOCK_SCREEN_COPY)).toBeVisible();
  });

  /**
   * LOCK-006 — a new tab must ask for the PIN, and so must a reload.
   *
   * This is BUG-090's regression test. `supabase-js` emits SIGNED_IN when it
   * recovers a stored session on load, and `useAuth` used to read that as a
   * fresh password login — so the lock fell to F5. Both halves are asserted
   * because they are one bug wearing two faces, and the reload is the one a
   * user hits by accident.
   */
  test("LOCK-006 · a second tab, and a reload, must re-lock", async ({ page, context }) => {
    test.setTimeout(180_000);

    await signIn(page);
    await expect(page.getByRole("heading", { name: /add a pin to this device/i })).toBeVisible({
      timeout: 30_000,
    });
    await acceptOffer(page, PIN4);

    // The PIN lives in localStorage (shared across tabs) but "unlocked" in
    // sessionStorage (per tab) — that split is the whole reason a second tab
    // is supposed to ask again.
    const tab2 = await context.newPage();
    await tab2.goto("/app");
    await expect(tab2.getByText(LOCK_SCREEN_COPY)).toBeVisible({ timeout: 30_000 });
    await tab2.close();

    // And a deliberate lock must survive the most obvious thing a person does.
    await page.getByTitle(/^Lock —/).click();
    await expect(page.getByText(LOCK_SCREEN_COPY)).toBeVisible();
    await page.reload();
    await expect(page.getByText(LOCK_SCREEN_COPY)).toBeVisible({ timeout: 30_000 });
  });

  /**
   * LOCK-003 (4-digit) · LOCK-002 · LOCK-008 · LOCK-010
   * Four sign-ins, deliberately in one test: each of these needs the previous
   * one's state, so splitting them would cost a fresh sign-in per case anyway.
   */
  test("4-digit PIN, no re-prompt after sign-out, the 12-hour rule, PIN recovery", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // ---- LOCK-003, half two: a 4-digit PIN, and the length is remembered
    await signIn(page);
    await expect(page.getByRole("heading", { name: /add a pin to this device/i })).toBeVisible({
      timeout: 30_000,
    });
    await acceptOffer(page, PIN4);
    const uid = (await uidFromStorage(page)) as string;
    expect(await page.evaluate((u) => localStorage.getItem(`finroot.pinlen.${u}`), uid)).toBe("4");

    // ---- LOCK-002: sign out, sign back in — the PIN is not re-created
    // The regression guard for the old re-prompt bug: the choice and the hash
    // are per device, so signing out must not look like a new device.
    await page.getByTitle(/^Sign out/).click();
    await expect(async () => expect(await authToken(page)).toBeNull()).toPass({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await signIn(page);
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(/add a pin to this device/i);
    expect(await page.evaluate((u) => localStorage.getItem(`finroot.pinlen.${u}`), uid)).toBe("4");

    // ---- LOCK-008: past 12 hours the PIN is not enough
    await page.evaluate(
      ({ u, ago }) => localStorage.setItem(`finroot.pwdauth.${u}`, String(Date.now() - ago)),
      { u: uid, ago: 13 * 60 * 60 * 1000 },
    );
    await page.getByTitle(/^Lock —/).click();
    await expect(page.getByText(/re-enter your password/i)).toBeVisible();
    await expect(page.getByText(LOCK_SCREEN_COPY)).toHaveCount(0);

    await page.locator("#lock-pwd").fill(PASSWORD);
    await page.getByRole("button", { name: /^unlock$/i }).click();
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    // ---- LOCK-010 (🔴 in the register; shipped in 5.4): recovery exists
    await page.getByTitle(/^Lock —/).click();
    await expect(page.getByText(LOCK_SCREEN_COPY)).toBeVisible(); // the anchor is fresh again
    await page.getByRole("button", { name: /forgot your pin/i }).click();
    await page.locator("#lock-pwd").fill(PASSWORD);
    await page.getByRole("button", { name: /verify & reset pin/i }).click();

    await expect(page.getByRole("heading", { name: /choose a new pin/i })).toBeVisible({
      timeout: 30_000,
    });
    // The forgotten PIN is gone, not merely stepped around.
    expect(await page.evaluate((u) => localStorage.getItem(`finroot.pin.${u}`), uid)).toBeNull();

    await page.getByRole("button", { name: "4 digits" }).click();
    await page.locator("#pin-new").fill(PIN4);
    await page.locator("#pin-confirm").fill(PIN4);
    await page.getByRole("button", { name: /save new pin/i }).click();
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
  });
});
