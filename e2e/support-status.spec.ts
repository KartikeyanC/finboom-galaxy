import { test, expect } from "@playwright/test";

/**
 * Stage 5.7 — the two pages that have to work when nothing else does.
 *
 * Both are checked **signed out**, on purpose: somebody who cannot sign in is
 * exactly the person who needs the support address and the status page, and a
 * regression that put either behind the auth gate would be invisible to every
 * other spec in this suite.
 */

test.describe("support and status", () => {
  test("the support page gives a real address, signed out", async ({ page }) => {
    await page.goto("/support");
    await expect(page.locator("main")).not.toBeEmpty();

    const mailto = page.locator('a[href^="mailto:"]').first();
    await expect(mailto).toBeVisible();
    const href = decodeURIComponent((await mailto.getAttribute("href")) ?? "");

    // The placeholder domain this stage removed (BUG-073). A "contact us" that
    // reaches nobody is worse than none at all.
    expect(href).not.toContain("@finroot.app");
    expect(href).toMatch(/^mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}\?/i);
    expect(href).toContain("subject=");

    // Signed out there is nothing to fill in, and the page says so rather than
    // writing empty labels into the mail.
    expect(href).not.toContain("User id:");
  });

  test("the status page reports live, and says where it checked from", async ({ page }) => {
    await page.goto("/status");
    const overall = page.getByTestId("status-overall");
    await expect(overall).toBeVisible();

    // Every probe settles — none is left spinning.
    await expect(overall).not.toHaveAttribute("data-state", "checking", { timeout: 20_000 });
    for (const id of ["api", "auth", "app"]) {
      await expect(page.getByTestId(`status-${id}`)).toBeVisible();
      await expect(page.getByTestId(`status-${id}`)).not.toHaveAttribute("data-state", "checking", {
        timeout: 20_000,
      });
    }

    // Against a working project this is the truthful answer; if it is ever not,
    // this test failing IS the signal.
    await expect(overall).toHaveAttribute("data-state", "operational");

    // The page must not claim more than it can see.
    await expect(page.locator("body")).toContainText(/in your browser/i);
  });

  test("both are reachable from the landing footer", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer").last();
    await expect(footer.getByRole("link", { name: /^support$/i })).toHaveAttribute("href", "/support");
    await expect(footer.getByRole("link", { name: /^status$/i })).toHaveAttribute("href", "/status");
  });
});
