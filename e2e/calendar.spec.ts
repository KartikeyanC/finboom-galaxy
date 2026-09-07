import { test, expect, type Page } from "@playwright/test";
import { EMAIL, PASSWORD, signInAndUnlock } from "./auth";

/**
 * Calendar — the month view of the ledger.
 *
 * `/app/calendar` is a read-through visualisation of `transactions`: a month
 * grid with a per-day in/out roll-up, and a day panel that adds, edits and
 * deletes onto whichever day is selected. It owns no table and no migration —
 * it is navigation-only, resolved in AccessContext like Accounts.
 *
 * The cases pin the two promises the page makes:
 *
 *   1. the grid and its figures are really there (not a blank region), and
 *      month navigation moves the whole view together;
 *   2. "add" lands on the day you clicked — not today — and delete removes
 *      exactly that row and nothing else.
 *
 * One sign-in for the block (`beforeAll`), like the ui-a11y app-routes suite —
 * NOT `mode: "serial"`, so one failing case does not skip the rest. Case 4
 * cleans up the row it creates.
 *
 * ⚠️ Run the SUITE serially (`--workers=1`). Every spec file signs in as the
 * same demo account, and parallel runs fail on contention in a way that reads
 * as a product bug.
 */

/** The two feature regions, by their accessible names. */
const CAL = { name: /Transactions calendar/i };
const DAY = { name: /^Transactions on/i };

test.describe("calendar", () => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Sign-in against the shared demo account can be slow when the whole suite
    // has been hammering Supabase auth; the default 30s hook budget aborts the
    // entire block if it overruns. Give it the same room the tests get.
    test.setTimeout(120_000);
    page = await browser.newPage();
    await signInAndUnlock(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test.beforeEach(async () => {
    await page.goto("/app/calendar");
    // Anti-vacuity: every assertion below would pass on a page that never
    // rendered.
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
  });

  test("renders the grid, the month totals and the day panel", async () => {
    test.setTimeout(120_000);

    await expect(page.getByRole("heading", { name: "Monthly Activity", level: 1 })).toBeVisible();

    // The four month figures — labels, not values (the demo ledger changes).
    for (const label of ["Money In", "Money Out", "Net", "Entries"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // A real grid of day cells, not a list — 4 to 6 whole weeks.
    const grid = page.getByRole("region", CAL).getByRole("grid");
    await expect(grid).toBeVisible();
    const cells = await grid.getByRole("gridcell").count();
    expect(cells % 7).toBe(0);
    expect(cells).toBeGreaterThanOrEqual(28);

    // The day panel is present and, for an owner, offers a way to add onto the
    // selected day. UI-T13's rule: never a dead end.
    const day = page.getByRole("region", DAY);
    await expect(day.getByRole("button", { name: "In", exact: true })).toBeVisible();
    await expect(day.getByRole("button", { name: "Out", exact: true })).toBeVisible();

    // The legend names the four non-transaction record kinds the grid overlays.
    const cal = page.getByRole("region", CAL);
    for (const kind of ["Investment", "Budget", "Goal", "Insurance"]) {
      await expect(cal.getByText(kind, { exact: true })).toBeVisible();
    }
  });

  test("month navigation moves the whole view and Today returns", async () => {
    test.setTimeout(120_000);

    const monthHeading = page.getByRole("region", CAL).getByRole("heading", { level: 2 });
    const current = (await monthHeading.textContent())?.trim() ?? "";
    expect(current).not.toBe("");

    await page.getByRole("region", CAL).getByRole("button", { name: "Previous month" }).click();
    await expect(monthHeading).not.toHaveText(current, { timeout: 10_000 });

    // The prose under the H1 names the month too — header and grid are one
    // view, so it moves with the grid rather than lagging it.
    const moved = (await monthHeading.textContent())?.trim() ?? "";
    await expect(page.locator("main")).toContainText(moved);

    await page.getByRole("region", CAL).getByRole("button", { name: "Today" }).click();
    await expect(monthHeading).toHaveText(current, { timeout: 10_000 });
  });

  test("selecting a day marks the cell and updates the panel", async () => {
    test.setTimeout(120_000);

    const cal = page.getByRole("region", CAL);
    // The 20th exists in every month and is never one of the greyed
    // spill-over cells. Match on the cell's own text (the day number) rather
    // than its accessible name, whose date format is locale-dependent.
    const twentieth = cal.getByRole("gridcell").filter({ hasText: /^20(\D|$)/ }).first();
    await twentieth.click();

    await expect(twentieth).toHaveAttribute("aria-selected", "true");
    // Exactly one day is selected at a time.
    await expect(cal.getByRole("gridcell", { selected: true })).toHaveCount(1);
    // The panel followed the selection — its heading/date now names the 20th.
    await expect(page.getByRole("region", DAY)).toContainText(/\b20\b/);
  });

  test("adding from a day writes it onto that day, and delete removes only that row", async () => {
    test.setTimeout(120_000);
    const NOTE = `E2E calendar ${Date.now()}`;

    const cal = page.getByRole("region", CAL);
    const day = page.getByRole("region", DAY);
    const monthHeading = cal.getByRole("heading", { level: 2 });
    const thisMonth = (await monthHeading.textContent())?.trim() ?? "";

    // Step back a month: now nothing on the grid is "today", and the page
    // selects the 1st. Anything added here proves the seeded date — a row that
    // silently defaulted to today would land in a different month.
    await cal.getByRole("button", { name: "Previous month" }).click();
    await expect(monthHeading).not.toHaveText(thisMonth, { timeout: 10_000 });

    await day.getByRole("button", { name: "Out", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("0").first().fill("175");
    await dialog.getByPlaceholder("e.g. October salary").fill(NOTE);
    await dialog.getByRole("button", { name: "Add expense" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // It is on the 1st of last month...
    await expect(day.getByText(NOTE)).toBeVisible({ timeout: 15_000 });

    // ...and NOT on today.
    await cal.getByRole("button", { name: "Today" }).click();
    await expect(monthHeading).toHaveText(thisMonth, { timeout: 10_000 });
    await expect(day.getByText(NOTE)).toHaveCount(0, { timeout: 10_000 });

    // Back to where we put it, to prove it persisted and to clean up.
    await cal.getByRole("button", { name: "Previous month" }).click();
    await expect(day.getByText(NOTE)).toBeVisible({ timeout: 15_000 });

    const row = day.locator("div.group", { hasText: NOTE });
    await row.hover();
    await row.getByRole("button", { name: `Delete ${NOTE}` }).click({ force: true });
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(/cannot be undone/i);
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(day.getByText(NOTE)).toHaveCount(0, { timeout: 15_000 });
  });

  test("a goal's target date shows on the calendar as a Goal marker", async () => {
    test.setTimeout(120_000);
    const NAME = `E2E goal ${Date.now()}`;

    // A goal one week out — exactly +7 days, no month-length clamping.
    const target = new Date();
    target.setDate(target.getDate() + 7);

    // Create it on the Goals page (the Calendar only reads).
    await page.goto("/app/goals");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    await page.getByRole("button", { name: /add goal/i }).click();
    // Name the dialog — the date picker's popover also carries role="dialog".
    const goalDialog = page.getByRole("dialog", { name: /add goal/i });
    await goalDialog.getByPlaceholder("e.g. Emergency Fund").fill(NAME);
    // Title, then Target amount, then Saved so far — the money fields carry no
    // placeholder, so address them by position.
    await goalDialog.getByRole("textbox").nth(1).fill("50000");
    await goalDialog.getByRole("button", { name: /set target date/i }).click();
    await page.getByRole("button", { name: "+1 Week", exact: true }).click();
    await goalDialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(goalDialog).toBeHidden({ timeout: 15_000 });

    // On the Calendar, open the target month and select that day.
    await page.goto("/app/calendar");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    const cal = page.getByRole("region", CAL);
    const day = page.getByRole("region", DAY);
    if (target.getMonth() !== new Date().getMonth()) {
      await cal.getByRole("button", { name: "Next month" }).click();
    }
    await cal
      .getByRole("gridcell")
      .filter({ hasText: new RegExp(`^${target.getDate()}(\\D|$)`) })
      .first()
      .click();

    // It appears under "Also on this day", tagged Goal, linking to /app/goals.
    const marker = day.getByRole("link", { name: new RegExp(NAME) });
    await expect(marker).toBeVisible({ timeout: 10_000 });
    await expect(marker).toContainText(/goal/i);
    await expect(marker).toHaveAttribute("href", "/app/goals");

    // Clean up on the Goals page. The row's delete control is an icon-only
    // button (a known GoalManager a11y gap), so reach it structurally: it is
    // the last button in the goal's row.
    await page.goto("/app/goals");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
    const goalRow = page.locator("div.rounded-lg", { hasText: NAME }).first();
    await goalRow.getByRole("button").last().click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(/delete goal/i);
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(NAME)).toHaveCount(0, { timeout: 15_000 });
  });
});
