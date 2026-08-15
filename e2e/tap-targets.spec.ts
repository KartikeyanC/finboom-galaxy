import { test, expect } from "@playwright/test";
import { EMAIL, PASSWORD, signInAndUnlock } from "./auth";

/**
 * Stage 4.7 — tap-target minimums (WCAG 2.5.8, 24×24 CSS px).
 *
 * Five controls in the product were under it and none of the fixes are
 * visible: they are padding, or in the carousel's case a transparent
 * pseudo-element. That makes them exactly the kind of thing a later styling
 * tweak removes by accident, which is why they are pinned here rather than
 * only measured once.
 */

test("landing: carousel dot is clickable 9px outside the visible dot", async ({ page }) => {
  // The carousel auto-advances every 5.2 s, and the active dot is wider than the
  // others — so between measuring a dot and clicking it, the row can reflow and
  // the click lands somewhere else. Reduced motion disables the interval, which
  // makes the geometry stable; it does not change the dots or their hit areas.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForTimeout(3000);
  const dots = page.locator('#voices button[aria-label^="Voice"]');
  await dots.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  // The active dot is the wide one (w-8); pick an inactive one so a landed
  // click has a visible consequence. Asserting on the quote alone would pass
  // for the wrong reason whenever the carousel auto-advances.
  const n = await dots.count();
  let target = -1;
  for (let i = 0; i < n; i++) {
    const b = (await dots.nth(i).boundingBox())!;
    if (b.width < 10) { target = i; break; }
  }
  expect(target, "expected at least one inactive dot").toBeGreaterThanOrEqual(0);

  const box = (await dots.nth(target).boundingBox())!;
  expect(box.height, "the dot must still LOOK 6px").toBeLessThanOrEqual(6.5);
  expect(box.width, "an inactive dot must still LOOK 6px wide").toBeLessThanOrEqual(6.5);

  // click 9 px above its centre — inside the enlarged hit area, outside the dot
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 9);
  await page.waitForTimeout(700);
  const after = (await dots.nth(target).boundingBox())!;
  expect(after.width, "the clicked dot should now be the active (wide) one").toBeGreaterThan(20);
});

test("landing: footer links are >=24px tall", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2500);
  const links = page.locator("footer a");
  const n = await links.count();
  for (let i = 0; i < n; i++) {
    const b = await links.nth(i).boundingBox();
    if (b) expect(b.height, await links.nth(i).innerText()).toBeGreaterThanOrEqual(24);
  }
});

test("app: the header, reminder and workspace controls clear 24px", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");
  test.setTimeout(180_000);
  await signInAndUnlock(page);
  const found: Record<string, { w: number; h: number }> = {};

  await page.goto("/app");
  await page.waitForTimeout(1600);
  const profile = page.locator('a[href="/app/profile"]').first();
  found.profileLink = (await profile.boundingBox())!;
  const bell = page.locator('button[title^="Filter:"]').first();
  if (await bell.count()) found.reminderFilter = (await bell.boundingBox())!;

  await page.goto("/app/workspace");
  await page.waitForTimeout(1600);
  const disclosure = page.locator("button", { hasText: /Pre-set module permissions/i }).first();
  found.presetModules = (await disclosure.boundingBox())!;

  for (const [k, b] of Object.entries(found)) {
    expect(b.height, k).toBeGreaterThanOrEqual(24);
  }
});

test("landing: the skip link clears 24px once focused", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2500);
  // sr-only until focused, so measuring it at rest reports 1x1 — a false alarm.
  await page.keyboard.press("Tab");
  const link = page.locator('a[href="#landing-main"]');
  const box = (await link.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(24);
  expect(box.width).toBeGreaterThanOrEqual(24);
});
