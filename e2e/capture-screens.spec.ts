import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { hasCreds, signInAndUnlock } from "./auth";

/**
 * Saves real FinRoot screens for the marketing pages (see capture.config.ts).
 * Run with `npm run capture:screens`; never part of `npm run e2e`.
 */

const OUT = resolve(process.cwd(), "public/landing/screens");

const SCREENS = [
  { name: "dashboard", path: "/app" },
  { name: "budget", path: "/app/budget" },
  { name: "calendar", path: "/app/calendar" },
];

const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 900, scale: 1.5 },
  { tag: "mobile", width: 390, height: 844, scale: 2 },
];

/** Let data, charts and entrance animations finish before the shot. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.locator("main").first().waitFor({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2_500);
}

test("capture real app screens", async ({ browser }) => {
  test.skip(!hasCreds, "Set E2E_EMAIL and E2E_PASSWORD in .env.e2e");
  mkdirSync(OUT, { recursive: true });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
      isMobile: vp.tag === "mobile",
      hasTouch: vp.tag === "mobile",
    });
    const page = await context.newPage();
    await signInAndUnlock(page);

    for (const s of SCREENS) {
      await page.goto(s.path);
      await settle(page);
      await page.screenshot({
        path: resolve(OUT, `${s.name}-${vp.tag}.jpg`),
        type: "jpeg",
        quality: 82,
      });
    }
    await context.close();
  }
});
