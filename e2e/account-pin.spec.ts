import { test, expect, type Page } from "@playwright/test";
import { EMAIL, PASSWORD, LOCK_SCREEN_COPY, PIN_OFFER_COPY } from "./auth";
import { ANON_KEY, SUPABASE_URL } from "./rest";

/**
 * One PIN per account (supabase/migrations/20261101120000_account_app_pin.sql).
 *
 * Set a PIN in one browser context; a completely fresh second context — a new
 * device, as far as storage is concerned — signs in, is NOT offered "Add a
 * PIN", and the SAME PIN opens its lock screen.
 *
 * Skipped automatically while `app_pin_status` does not exist on the target
 * project (PostgREST 404 / PGRST202), so the suite stays runnable before the
 * migration is applied.
 */

const PIN = "482916";

async function rpcExists(): Promise<boolean> {
  if (!SUPABASE_URL || !ANON_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/app_pin_status`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: "{}",
    });
    // anon has no EXECUTE grant, so an existing function answers 401/403;
    // only a missing one answers 404.
    return res.status !== 404;
  } catch {
    return false;
  }
}

const accessToken = (page: Page) =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    if (!k) return null;
    try {
      return (JSON.parse(localStorage.getItem(k) ?? "null") as { access_token?: string } | null)
        ?.access_token ?? null;
    } catch {
      return null;
    }
  });

async function clearAccountPin(page: Page) {
  const token = await accessToken(page);
  if (!token) return;
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/clear_app_pin`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
}

/** Same form-remount-tolerant sign-in as lock-suite.spec.ts. */
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

test.describe("account PIN — one PIN on every device", () => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  let available = false;
  test.beforeAll(async () => {
    available = await rpcExists();
  });

  test("a PIN set in one browser unlocks a fresh one, with no 'Add a PIN'", async ({ browser }) => {
    test.skip(!available, "app_pin_status is not on this project yet (migration 20261101120000)");
    test.setTimeout(180_000);

    // ---- Device A: start from an account with no PIN, then set one.
    const ctxA = await browser.newContext();
    const a = await ctxA.newPage();
    try {
      await signIn(a);
      await clearAccountPin(a);
      await a.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
          if (/^finroot\.(pin|pinlen|pinsrv|lock\.pref)\./.test(k)) localStorage.removeItem(k);
        }
      });
      await a.reload();
      await expect(a.getByRole("heading", { name: PIN_OFFER_COPY })).toBeVisible({ timeout: 30_000 });
      await a.getByRole("button", { name: "6 digits" }).click();
      await a.locator("#pin-new").fill(PIN);
      await a.locator("#pin-confirm").fill(PIN);
      await a.getByRole("button", { name: /turn on app lock/i }).click();
      await expect(a.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    } finally {
      await ctxA.close();
    }

    // ---- Device B: nothing in storage at all.
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    try {
      await signIn(b);
      // A real sign-in unlocks the tab, so B lands in the app — and must not
      // have been asked to create a second PIN on the way.
      await expect(b.locator("main")).not.toBeEmpty({ timeout: 30_000 });
      await expect(b.getByRole("heading", { name: PIN_OFFER_COPY })).toHaveCount(0);

      // Lock it: the lock screen asks for the account's 6-digit PIN…
      await b.getByTitle(/^Lock —/).click();
      await expect(b.getByText(LOCK_SCREEN_COPY)).toBeVisible();
      await expect(b.getByText(/enter your 6-digit pin/i)).toBeVisible();

      // …and the PIN set on device A opens it.
      await b.locator('input[aria-label="PIN"]').fill(PIN);
      await expect(b.locator("main")).not.toBeEmpty({ timeout: 30_000 });
      await expect(b.getByText(LOCK_SCREEN_COPY)).toHaveCount(0);
    } finally {
      // Leave the account without a PIN, so the device-PIN suites (which
      // expect a fresh context to be offered one) still start from the offer.
      await clearAccountPin(b).catch(() => {});
      await ctxB.close();
    }
  });
});
