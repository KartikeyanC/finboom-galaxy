import { test, expect, type Page } from "@playwright/test";
import { signInAndUnlock, hasCreds } from "./auth";

/**
 * Stage 6.1 — the new-user selection-only onboarding wizard.
 *
 * Distinct from `e2e/onboarding.spec.ts`, which covers the unrelated,
 * tenant-scoped "onboarding checklist" (Stage 5.3) — do not confuse the two.
 *
 * A fresh sign-up only reaches the wizard (rather than sitting on "check
 * your email to confirm") if the target Supabase project has email
 * autoconfirm ON. The cloud dev project does not; the local self-hosted
 * stack stood up for Stage 6 testing does (`ENABLE_EMAIL_AUTOCONFIRM=true`
 * in `selfhost/repo/docker/.env`). Point `E2E_BASE_URL`/Playwright's
 * `baseURL` at that stack to run this file meaningfully.
 */

test.describe.configure({ mode: "serial" });

async function signUpFresh(page: Page, name: string) {
  const email = `onboarding-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = "Onboard1ngE2E!";

  await page.goto("/auth?tab=signup");
  await page.locator("#signup-name").fill(name);
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-password").fill(password);
  await page.locator("#signup-confirm").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  return { email, password };
}

/** Answers Step 1 (the only non-skippable step) with fixed, valid choices. */
async function completeStepProfile(page: Page) {
  await expect(page.getByText("What best describes you?")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "25–34", exact: true }).click();
  await page.getByRole("button", { name: "India", exact: true }).click();
  await page.getByRole("button", { name: "INR ₹", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

test.describe("new-user onboarding wizard", () => {
  test("fresh signup walks the wizard and reaches the dashboard", async ({ page }) => {
    await signUpFresh(page, "Wizard E2E");
    await completeStepProfile(page);

    // Step 2 — skip is allowed here.
    await expect(page.getByText("How do you earn your money?")).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();

    // Step 3
    await expect(page.getByText("What do you currently have?")).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();

    // Step 4
    await expect(page.getByText("What are you working toward?")).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();

    // Step 5 — last question step; its Continue reads "Review".
    await expect(page.getByText("Where does most of your money go?")).toBeVisible();
    await page.getByRole("button", { name: "Review" }).click();

    // Summary screen.
    await expect(page.getByText("Your Finroot is ready.")).toBeVisible();
    await page.getByRole("button", { name: "Go to My Dashboard" }).click();

    // The wizard gate falls away and the real dashboard renders.
    await expect(page.getByText("Your Finroot is ready.")).not.toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/app\/?$/);
  });

  test("leaving mid-wizard and reloading resumes at the same step", async ({ page }) => {
    await signUpFresh(page, "Resume E2E");
    await completeStepProfile(page);

    // On Step 2 now. Reload the whole page — progress must have been
    // persisted server-side by Step 1's Continue, not just held in memory.
    await expect(page.getByText("How do you earn your money?")).toBeVisible();
    await page.reload();

    await expect(page.getByText("How do you earn your money?")).toBeVisible({ timeout: 10_000 });
    // And Step 1 is not shown again.
    await expect(page.getByText("What best describes you?")).not.toBeVisible();
  });

  test.skip(!hasCreds, "requires E2E_EMAIL/E2E_PASSWORD for the existing demo account");
  test("an existing account never sees the wizard", async ({ page }) => {
    await signInAndUnlock(page);
    await page.goto("/app");
    await expect(page.getByText("What best describes you?")).not.toBeVisible();
    await expect(page).toHaveURL(/\/app/);
  });

  test("completed once, the wizard never reappears on a later visit", async ({ page }) => {
    await signUpFresh(page, "Complete Once E2E");
    await completeStepProfile(page);
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /^(Skip|Review)$/ }).click();
    }
    await expect(page.getByText("Your Finroot is ready.")).toBeVisible();
    await page.getByRole("button", { name: "Go to My Dashboard" }).click();
    await expect(page).toHaveURL(/\/app\/?$/, { timeout: 10_000 });

    // Reload, and navigate around — the wizard must not come back.
    await page.reload();
    await expect(page.getByText("What best describes you?")).not.toBeVisible();
    await page.goto("/app/expenses");
    await expect(page.getByText("What best describes you?")).not.toBeVisible();
  });

  test("renders on mobile without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signUpFresh(page, "Mobile E2E");
    await completeStepProfile(page);
    await expect(page.getByText("How do you earn your money?")).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
