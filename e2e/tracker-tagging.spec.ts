import { test, expect } from "@playwright/test";
import { EMAIL, PASSWORD, signInAndUnlock } from "./auth";

/**
 * Phase 3 — transaction integration, end to end.
 *
 * The trackers spec covers creating and managing trackers. It never tags a
 * transaction, which is the whole point of the feature, so this covers the
 * round trip: record an expense against a tracker from Quick Add, find it in
 * the tracker, find its badge in the ledger, then untag it.
 *
 * 🔴 The assertion that matters most is the LAST one: untagging must leave
 * the expense exactly where it was. A tracker is a label. If tagging or
 * untagging ever moved money, this is where it would show.
 *
 * ⚠️ Run serially (`--workers=1`). Shared demo account.
 */

const TRACKER = `E2E Tag ${Date.now()}`;
const NOTE = `E2E tagged expense ${Date.now()}`;
const AMOUNT = "1234";

test.describe.configure({ mode: "serial" });

test.describe("tracker tagging", () => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  test("a tracker can be created for tagging", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app/trackers");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    await page.getByRole("button", { name: /new tracker/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Home Construction", exact: true }).click();
    await page.getByLabel("Name").fill(TRACKER);
    // TODAY's date, deliberately: a start date in the past triggers the
    // historical-review offer, which is a different flow and not what this
    // spec is about.
    await page.getByLabel("Start date").fill(new Date().toISOString().slice(0, 10));
    await page.getByRole("button", { name: /create tracker/i }).click();

    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(TRACKER).first()).toBeVisible({ timeout: 15_000 });
  });

  test("Quick Add records an expense against the tracker", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    await page.keyboard.press("n");
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 15_000 });

    // The amount field had NO accessible name until the QuickAddSheet label
    // fix; getByLabel working here is that fix, asserted.
    await sheet.getByLabel("Amount").fill(AMOUNT);
    await sheet.getByLabel(/note/i).fill(NOTE);

    // The tracker field only renders once a tracker exists — which it now
    // does. It must still default to "no tracker": opt-in, never automatic.
    const tracker = sheet.locator("#qa-tracker");
    await expect(tracker).toBeVisible({ timeout: 10_000 });
    await expect(tracker).toContainText(/no tracker/i);

    await tracker.click();
    await page.getByRole("option", { name: TRACKER }).click();
    await expect(tracker).toContainText(TRACKER);

    await sheet.getByRole("button", { name: /record expense/i }).click();
    await expect(sheet).toBeHidden({ timeout: 15_000 });
  });

  test("the tagged expense appears inside the tracker", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app/trackers");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    await page.locator("button", { hasText: TRACKER }).first().click();
    await expect(page.getByRole("heading", { name: TRACKER, level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    // The row is here...
    await expect(page.getByText(NOTE).first()).toBeVisible({ timeout: 15_000 });
    // ...and the derived total reflects it. Spend is computed from the
    // transactions, never stored, so this figure is the proof the fold works
    // against real data.
    //
    // Scoped to the row rather than a bare text match: the print-only
    // statement header (`hidden print:block`) also contains the amount and
    // comes FIRST in the DOM, so `getByText(/1,234/).first()` resolves to an
    // element that is correctly invisible on screen.
    await expect(page.getByRole("listitem").filter({ hasText: NOTE })).toContainText(
      "1,234",
      { timeout: 15_000 },
    );
  });

  test("the same row is still in the expenses ledger, wearing its badge", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app/expenses");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    // Tagging adds a label; it must never remove the row from anywhere it
    // already appeared.
    const row = page.locator("div", { hasText: NOTE }).last();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // The tracker chip renders the name. Its sr-only span carries the full,
    // unprefixed name, which is what a screen reader gets.
    await expect(page.getByText(`Tracker: ${TRACKER}`).first()).toBeAttached({
      timeout: 15_000,
    });
  });

  test("untagging leaves the expense exactly where it was", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);

    // Snapshot the MONEY before untagging — not the raw text. The badge swap
    // legitimately changes the markup (tracker chip out, category chip back
    // in, two sr-only spans gone), so a whole-page string compare fails on
    // differences that are the feature working correctly. What must not move
    // is the arithmetic.
    const money = async () => {
      const t = await page.locator("main").innerText();
      return {
        month: /THIS MONTH\s+(₹[\d,]+)/.exec(t)?.[1],
        records: /TOTAL RECORDS\s+(\d+)/.exec(t)?.[1],
        rowAmount: new RegExp(`${NOTE}\\s*−?\\s*(₹[\\d,]+)`).exec(t)?.[1],
      };
    };

    await page.goto("/app/expenses");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    await expect(page.getByText(NOTE).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    const before = await money();
    // Anti-vacuity: if the regexes matched nothing, the comparison below would
    // pass on two identical bags of undefined.
    expect(before.month).toBeTruthy();
    expect(before.records).toBeTruthy();

    // Untag from the tracker workspace.
    await page.goto("/app/trackers");
    await page.locator("button", { hasText: TRACKER }).first().click();
    await expect(page.getByRole("heading", { name: TRACKER, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: new RegExp(`Remove .* from ${TRACKER}`, "i") }).click();

    // Wait for the write, or the navigation below cancels it.
    await expect(page.getByText(NOTE)).toHaveCount(0, { timeout: 15_000 });

    await page.goto("/app/expenses");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    await expect(page.getByText(NOTE).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);

    // 🔴 Not one paisa moved.
    expect(await money()).toEqual(before);

    // The badge is gone, and the category chip is visible again in its place.
    await expect(page.getByText(`Tracker: ${TRACKER}`)).toHaveCount(0);
  });
});
