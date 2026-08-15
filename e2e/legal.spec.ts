import { test, expect } from "@playwright/test";

/** Stage 5.1 — the legal pages must be reachable without an account. */

test("privacy policy renders, unauthenticated", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  const text = await page.locator("body").innerText();
  for (const s of ["The short version", "What we store", "How long we keep it", "Your rights", "400 days"]) {
    expect(text, s).toContain(s);
  }
});

test("terms of service renders, unauthenticated", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeVisible();
  const text = await page.locator("body").innerText();
  for (const s of ["Shared workspaces", "not financial advice", "Plans and payment"]) {
    expect(text, s).toContain(s);
  }
});

test("the landing footer links to both, and they are not '#'", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2500);
  const privacy = page.locator('footer a[href="/privacy"]');
  const terms = page.locator('footer a[href="/terms"]');
  await expect(privacy).toHaveCount(1);
  await expect(terms).toHaveCount(1);
  expect(await page.locator('footer a[href="#"]').count()).toBe(0);
  await privacy.click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test("sign-up shows the consent notice with both documents linked", async ({ page }) => {
  await page.goto("/auth?tab=signup");
  await page.waitForTimeout(1200);
  const form = page.locator("form").filter({ hasText: /Create account/i });
  const text = await form.innerText();
  expect(text).toMatch(/By creating an account you agree/i);
  await expect(form.locator('a[href="/terms"]')).toBeVisible();
  await expect(form.locator('a[href="/privacy"]')).toBeVisible();
});
