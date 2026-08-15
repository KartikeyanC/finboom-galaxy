import { test, expect } from "@playwright/test";
import { EMAIL, PASSWORD, signInAndUnlock } from "./auth";

/**
 * Stage 5.5 — the upgrade prompts, from the side that must never see them.
 *
 * The demo workspace is on the top plan, so every assertion here is an
 * absence: no padlocks in the navigation, no upgrade page on a feature route.
 * Showing a paywall to somebody who has already paid is the one failure of
 * this feature that costs money rather than making it, and it is exactly the
 * kind of thing a later refactor of `menuLock()` would reintroduce quietly.
 *
 * The presence side (a Roots workspace seeing six locked rows and an
 * "Investments is part of Canopy" page) needs a second workspace on a cheaper
 * plan, which only the PO console can create; it was verified there by hand.
 */

test.describe("plan locks", () => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  test("an entitled workspace is never shown a paywall", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAndUnlock(page);
    await page.goto("/app");

    // The app really rendered — otherwise every absence below is vacuous.
    await expect(page.locator("main")).not.toBeEmpty();

    await expect(page.getByTestId("upgrade-lock")).toHaveCount(0);
    // The padlock rows announce themselves to screen readers with this copy.
    await expect(page.locator("nav").getByText(/included in|not included in your plan/i)).toHaveCount(
      0,
    );

    // A gated feature route renders the feature, not the sales page.
    await page.goto("/app/investments");
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.getByTestId("upgrade-lock")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/is part of .* plan/i);
  });
});
