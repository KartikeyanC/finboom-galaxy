import { test, expect, devices, chromium, firefox, webkit, type Browser } from "@playwright/test";

/**
 * UI-T16 — cross-browser.
 *
 * The repo's Playwright config has one project (chromium), which is the right
 * default for a suite that runs on every change. This case is the periodic
 * check that the other two engines still agree, so it drives them directly
 * rather than adding two permanent projects that would triple every run.
 *
 * It is deliberately narrow: layout, the landmark structure and the hero
 * copy. Anything needing a sign-in is left to the chromium suite, because
 * three engines each doing a real Supabase auth is how you get rate-limited.
 */

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";
const ENGINES = { chromium, firefox, webkit };

const ROUTES = ["/", "/auth", "/privacy", "/support"];

type Reading = {
  title: string;
  h1: string;
  mains: number;
  skipLinks: number;
  overflow: number;
};

test("UI-T16 · chromium, firefox and webkit agree on the public pages", async () => {
  test.setTimeout(600_000);

  const readings: Record<string, Record<string, Reading>> = {};
  const unavailable: string[] = [];

  for (const [name, engine] of Object.entries(ENGINES)) {
    let browser: Browser | null = null;
    try {
      try {
        browser = await engine.launch();
      } catch (err) {
        // An engine that will not start is an environment fact, not a finding
        // about the product. Recording it and carrying on is worth more than
        // failing the case and learning nothing about the engines that DID
        // run — but it must be reported, or a partial run reads as a full one.
        unavailable.push(`${name}: ${String(err).split("\n")[0]}`);
        continue;
      }
      const context = await browser.newContext({
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();
      readings[name] = {};

      for (const route of ROUTES) {
        await page.goto(BASE + route);
        await page.waitForLoadState("networkidle");
        // The landing preloader runs ~2.8 s; reading before it clears would
        // compare a splash screen across three engines and call it agreement.
        await page.waitForTimeout(route === "/" ? 3500 : 800);

        readings[name][route] = await page.evaluate(() => ({
          title: document.title,
          h1: (document.querySelector("h1")?.textContent ?? "").replace(/\s+/g, " ").trim(),
          mains: document.querySelectorAll("main").length,
          skipLinks: [...document.querySelectorAll("a")].filter((a) =>
            /skip to main content/i.test(a.textContent ?? ""),
          ).length,
          overflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
      }
      await context.close();
    } finally {
      await browser?.close();
    }
  }

  // Report first — a diff is far more useful than "expected X received Y" when
  // several engines are involved.
  console.log("UI-T16 readings:\n" + JSON.stringify(readings, null, 2));
  if (unavailable.length) console.log("UI-T16 engines unavailable:\n  " + unavailable.join("\n  "));

  const ran = Object.keys(readings);
  expect(ran, "chromium must be one of the engines that ran").toContain("chromium");
  expect(
    ran.length,
    `only chromium ran — nothing was compared. Unavailable: ${unavailable.join("; ")}`,
  ).toBeGreaterThan(1);

  const disagreements: string[] = [];
  for (const route of ROUTES) {
    const base = readings.chromium[route];
    for (const engine of ran.filter((e) => e !== "chromium")) {
      const other = readings[engine][route];
      for (const key of ["title", "h1", "mains", "skipLinks"] as const) {
        if (base[key] !== other[key]) {
          disagreements.push(
            `${route} · ${key}: chromium="${base[key]}" ${engine}="${other[key]}"`,
          );
        }
      }
    }
  }
  expect(disagreements, disagreements.join("\n")).toEqual([]);

  // Overflow is checked per engine rather than compared: identical overflow in
  // all three would be "agreement" and still a broken page.
  const overflowing: string[] = [];
  for (const engine of ran) {
    for (const route of ROUTES) {
      const px = readings[engine][route].overflow;
      if (px > 2) overflowing.push(`${engine} ${route} overflows by ${px}px`);
    }
  }
  expect(overflowing, overflowing.join("\n")).toEqual([]);
});
