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
/** The password fallback, shown when the PIN is forgotten or storage is blocked. */
export const PASSWORD_GATE_COPY = /re-enter your password/i;

type Gate = "pin-setup" | "lock" | "password" | "app" | "none";

/**
 * Which screen are we actually on?
 *
 * Read once, cheaply. `innerText` can throw mid-navigation, which is a "not
 * settled yet" answer rather than a failure — hence the catch.
 */
async function currentGate(page: Page): Promise<Gate> {
  const body = await page.locator("body").innerText().catch(() => "");
  if (PIN_SETUP_COPY.test(body)) return "pin-setup";
  if (LOCK_SCREEN_COPY.test(body)) return "lock";
  if (PASSWORD_GATE_COPY.test(body)) return "password";
  // 🔴 BOTH signals are required, because each alone gives a false positive:
  //   - <main> alone: `/auth` renders its own <main id="auth-main">, so the
  //     helper reports "we're in" while the sign-in form is still up.
  //   - URL alone: the URL becomes /app a beat BEFORE ProtectedRoute paints
  //     the PIN gate, so the helper returns during the gap and the caller
  //     walks into "Add a PIN to this device?".
  // The gate screens render no <main> at all, which is what makes the pair
  // decisive: /app + <main> means past every gate.
  const onAppUrl = /\/app(\/|$|\?|#)/.test(page.url());
  const hasMain = (await page.locator("main").count().catch(() => 0)) > 0;
  if (onAppUrl && hasMain) return "app";
  return "none";
}

/** Poll until a recognised screen appears, or give up and say so. */
async function waitForGate(page: Page, timeoutMs = 30_000): Promise<Gate> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const gate = await currentGate(page);
    if (gate !== "none") return gate;
    if (Date.now() > deadline) return "none";
    await page.waitForTimeout(250);
  }
}

/**
 * Set a React-controlled input's value without touching the keyboard or
 * waiting on actionability. See the call sites for why that is necessary.
 */
async function setReactInput(page: Page, id: string, value: string) {
  await page.waitForSelector(`#${id}`, { timeout: 10_000 });
  await page.evaluate(
    ([elId, val]) => {
      const el = document.getElementById(elId) as HTMLInputElement | null;
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [id, value] as const,
  );
}

/**
 * Sign in, then get past whichever gate this browser profile lands on.
 *
 * A fresh Playwright context has no stored PIN, so it is offered one and this
 * accepts: the authenticated specs test the app behind the lock, and declining
 * would leave the locked path untested everywhere else.
 *
 * 🔴 It WAITS for a gate rather than sampling once after a fixed sleep. The
 * previous version did `waitForTimeout(3500)` and then read `body` a single
 * time; when sign-in took longer than that — a slow network, a cold Supabase
 * connection — none of the branches matched, the function returned having done
 * nothing at all, and the caller walked straight into an un-dismissed
 * "Add a PIN to this device?" screen. The failure surfaced as
 * `locator('main')` not found, which reads like a broken page rather than an
 * unfinished sign-in, and it hit every authenticated spec at once.
 *
 * Loops because gates chain: accepting the PIN offer can land on the lock
 * screen, which then wants the PIN again.
 */
export async function signInAndUnlock(page: Page) {
  await page.goto("/auth");
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]:visible').first().click();

  // Three is enough for every real chain (setup → lock, or lock → password)
  // and still terminates if a gate somehow re-renders itself forever.
  for (let i = 0; i < 3; i++) {
    const gate = await waitForGate(page);

    if (gate === "app" || gate === "none") return;

    if (gate === "pin-setup") {
      // Pick the length explicitly. The offer defaults to 6 digits since
      // BUG-091, and E2E_PIN is 4 — filling a 4-digit PIN into a form
      // expecting 6 just raises "PIN must be 6 digits" and leaves the offer
      // on screen.
      //
      // 🔴 `force: true` throughout this block, and it is not laziness. The
      // gate animates in (framer-motion), so Playwright's stability check
      // never settles and every click retries until the 120 s test budget is
      // gone — reported as an unhelpful "Test timeout" rather than "the
      // dialog was still moving". The elements are already resolved by role
      // and id, so the actionability wait was buying nothing here.
      const lengthBtn = page.getByRole("button", { name: `${PIN.length} digits` });
      // Skip the click entirely when the length is already selected — the
      // default matched E2E_PIN's length in the run that found this.
      const alreadySet = await lengthBtn.getAttribute("aria-pressed").catch(() => null);
      if (alreadySet !== "true" && (await lengthBtn.isVisible().catch(() => false))) {
        await lengthBtn.click({ force: true, timeout: 10_000 });
      }

      // 🔴 Set the value through React's own native setter rather than
      // typing or fill()ing.
      //
      // These are controlled inputs inside an animating dialog, and they get
      // recreated mid-interaction: Playwright reported "element is not
      // stable", then "element was detached from the DOM", and fill() simply
      // hung until the 120 s test budget was gone. Every actionability-based
      // approach loses the race.
      //
      // Assigning via the prototype's value setter and dispatching a bubbling
      // `input` event is what React's synthetic event system actually listens
      // for — a plain `el.value = x` updates the DOM but leaves React's state
      // untouched, so the component would overwrite it on the next render.
      await setReactInput(page, "pin-new", PIN);
      await setReactInput(page, "pin-confirm", PIN);
      // Tolerant: setting both fields can be enough to let the gate resolve
      // itself, in which case the button is already gone and its absence is
      // success, not failure. The loop re-reads the gate either way.
      await page
        .getByRole("button", { name: /turn on app lock|save new pin/i })
        .click({ force: true, timeout: 5_000 })
        .catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
      continue;
    }

    if (gate === "lock") {
      // The PIN boxes are one hidden numeric input; it unlocks on the last digit.
      await page.locator('input[aria-label="PIN"]').click({ force: true, timeout: 10_000 });
      await page.keyboard.type(PIN, { delay: 30 });
      await page.waitForLoadState("networkidle").catch(() => {});
      continue;
    }

    if (gate === "password") {
      await page.locator("#lock-pwd").click({ force: true, timeout: 10_000 });
      await page.keyboard.type(PASSWORD, { delay: 10 });
      await page.getByRole("button", { name: /^unlock$/i }).click({ force: true, timeout: 10_000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      continue;
    }
  }
}
