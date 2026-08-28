import { test, expect } from "@playwright/test";
import { EMAIL, PASSWORD, signInAndUnlock } from "./auth";

/**
 * Trackers — the end-to-end register.
 *
 * A tracker is an OPTIONAL contextual dimension on a transaction: which
 * project or life event it belongs to. It holds no money and owns no balance.
 * These cases exist to pin the three promises the feature is built on:
 *
 *   1. it never moves money,
 *   2. it never assigns anything the user did not tick,
 *   3. it never removes a transaction from anywhere it already appears.
 *
 * ⚠️ REQUIRES supabase/migrations/20260827120000_trackers.sql TO BE APPLIED.
 * Until it is, `trackers` and `transactions.tracker_id` do not exist and every
 * case here fails at the first query — that is the migration missing, not the
 * UI being broken.
 *
 * ⚠️ Run serially (`--workers=1`). Every spec file signs in as the same demo
 * account, and parallel runs fail on contention in a way that reads as a
 * product bug.
 */

const NAME = `E2E Tracker ${Date.now()}`;

test.describe.configure({ mode: "serial" });

test.describe("trackers", () => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  test("the page renders a real empty state, not a blank region", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app/trackers");

    // Anti-vacuity: without this, every assertion below would pass on a page
    // that failed to render at all.
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    await expect(page.getByRole("heading", { name: "Trackers", level: 1 })).toBeVisible();
    // UI-T13's rule, asserted here at the source: copy AND a way forward.
    await expect(page.getByRole("button", { name: /new tracker/i }).first()).toBeVisible();
  });

  test("creating a tracker takes a template, a name and a real start date", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app/trackers");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    await page.getByRole("button", { name: /new tracker/i }).first().click();

    // Step one is the template picker — recognition rather than recall.
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Home Construction", exact: true }).click();

    await page.getByLabel("Name").fill(NAME);
    // The start date is the PROJECT's start, which may long predate today.
    await page.getByLabel("Start date").fill("2026-01-01");
    await page.getByRole("button", { name: /create tracker/i }).click();

    // Creating a tracker whose start_date predates today OFFERS the historical
    // review — that is the designed behaviour, not an interruption to work
    // around. The first draft of this test asserted "the dialog closes" and
    // failed because a different, correct dialog had opened.
    // WAIT for it rather than sampling isVisible() once: the create dialog
    // closes first and the review opens a beat later, so an immediate check
    // races the transition and reports "no review" every time.
    const review = page.getByRole("dialog", { name: /review previous transactions/i });
    const appeared = await review
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) {
      // Nothing may be pre-selected. Asserted here, against real data, because
      // this is the invariant the whole flow exists to protect.
      await expect(review.getByRole("button", { name: /^assign/i })).toBeDisabled();
      await review.getByRole("button", { name: /skip for now/i }).click();
    }

    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 15_000 });
  });

  test("a tracker with no budget says so rather than showing a fake zero", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app/trackers");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    const card = page.locator("button", { hasText: NAME }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    // A ₹0 budget bar would read as "nothing spent yet", which is a different
    // claim entirely.
    await expect(card).toContainText(/no budget set/i);
  });

  test("opening a tracker is linkable and Back returns to the list", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app/trackers");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    await page.locator("button", { hasText: NAME }).first().click();

    // Master/detail is component state MIRRORED into ?id=, so the workspace
    // is shareable and the browser Back button behaves.
    await expect(page).toHaveURL(/\?id=/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: NAME, level: 1 })).toBeVisible();

    await page.goBack();
    await expect(page).not.toHaveURL(/\?id=/);
  });

  test("an unknown tracker id falls back to the list, never a blank screen", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app/trackers?id=00000000-0000-0000-0000-000000000000");

    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Trackers", level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("completing moves it to Completed with its total intact", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app/trackers");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    await page.locator("button", { hasText: NAME }).first().click();
    await expect(page.getByRole("heading", { name: NAME, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /^complete$/i }).click();

    // WAIT for the write to land before navigating. `page.goto()` immediately
    // after the click cancels the in-flight PATCH, and the tracker stays
    // active — which reads as "Complete is broken" when the real fault is the
    // test racing its own mutation. The header chip is the on-screen proof
    // the round trip finished.
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/app/trackers");
    await page.getByRole("tab", { name: /completed/i }).click();
    await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 15_000 });

    // And it is gone from Active.
    await page.getByRole("tab", { name: /^active$/i }).click();
    await expect(page.getByText(NAME)).toHaveCount(0);
  });

  test("deleting a tracker does not delete transactions", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);

    // The count before, from a page that has nothing to do with trackers.
    await page.goto("/app/expenses");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    const before = await page.locator("main").innerText();

    await page.goto("/app/trackers");
    await page.getByRole("tab", { name: /completed/i }).click();
    await page.locator("button", { hasText: NAME }).first().click();
    await page.getByRole("button", { name: /delete/i }).first().click();

    // The confirmation says it in words; this asserts it in behaviour.
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toContainText(/transactions are not deleted/i);
    await page.getByRole("button", { name: /delete tracker/i }).click();

    // WAIT for the soft delete to land before navigating — `page.goto()`
    // straight after the click cancels the in-flight request, exactly as it
    // did for Complete. Without this the test passed while the tracker was
    // still in the database: "transactions unchanged" is trivially true when
    // nothing happened at all, so the assertion below was vacuous.
    // Returning to the list and finding it gone is the proof.
    await expect(page).not.toHaveURL(/\?id=/, { timeout: 15_000 });
    await expect(page.getByText(NAME)).toHaveCount(0, { timeout: 15_000 });

    await page.goto("/app/expenses");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    expect(await page.locator("main").innerText()).toBe(before);
  });

  test("Quick Add never pre-selects a tracker", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    // `n` is the global Quick Add shortcut (DashboardLayout).
    await page.keyboard.press("n");
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 15_000 });

    // The invariant worth pinning: tagging is OPT-IN. Whether or not the
    // field renders — it is hidden entirely until the workspace has a tracker
    // — it must never arrive with one already chosen, because Quick Add is
    // the 5-second path and a silent default would tag spending the user
    // never attributed.
    const trackerTrigger = sheet.locator("#qa-tracker");
    if (await trackerTrigger.isVisible().catch(() => false)) {
      await expect(trackerTrigger).toContainText(/no tracker/i);
    }

    // And the fast path is still fast: the sheet is usable immediately.
    await expect(
      sheet.getByRole("button", { name: /record (expense|income)/i }).first(),
    ).toBeVisible();
  });
});
