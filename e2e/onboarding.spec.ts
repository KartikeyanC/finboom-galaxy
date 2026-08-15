import { test, expect } from "@playwright/test";
import { EMAIL, PASSWORD, signInAndUnlock } from "./auth";

/**
 * Stage 5.3 — the checklist's most important property is one you cannot see:
 * it must NOT appear for a workspace that is already set up.
 *
 * The demo workspace has transactions, budgets and goals, so this asserts the
 * absence — and asserts the dashboard actually rendered first, because "the
 * card is missing" is also what a blank page looks like (the lesson from the
 * two flaky specs in 5.1/5.2: never let an empty page pass as a negative).
 */

test("an established workspace is never nagged with the setup checklist", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");
  test.setTimeout(120_000);
  await signInAndUnlock(page);
  await page.goto("/app");

  // The dashboard is really there — otherwise the assertion below is vacuous.
  await expect(page.locator("main")).not.toBeEmpty();
  await expect(page.getByText(/net worth|welcome back/i).first()).toBeVisible();

  await expect(page.getByTestId("onboarding-checklist")).toHaveCount(0);
});

test("settings offers sample-data removal only when there is sample data", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");
  test.setTimeout(120_000);
  await signInAndUnlock(page);
  await page.goto("/app/settings");

  // Settings rendered (the delete-account card is always there, 5.2).
  await expect(page.getByRole("button", { name: /i want to delete my account/i })).toBeVisible();

  // …and the sample-data card is not, because this workspace has none.
  await expect(page.getByRole("button", { name: /remove sample data/i })).toHaveCount(0);
});
