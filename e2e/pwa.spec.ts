import { test, expect } from "@playwright/test";

/**
 * UI-T17 — PWA install + standalone.
 *
 * The register marks this manual-only and blocked on physical devices, and one
 * clause genuinely is: whether the icon looks right on an Android home screen
 * needs an Android home screen. The rest is not. Installability is a checklist
 * the browser evaluates mechanically — manifest fields, real icon dimensions,
 * a service worker that actually controls the page, an offline shell — and if
 * any of it is wrong the install fails or the installed app opens on a blank
 * screen. That part is checkable here, and was worth checking: it had never
 * been run at all.
 *
 * ⚠️ Runs against the PRODUCTION build (`npm run build` first). The service
 * worker is registered only under `import.meta.env.PROD`.
 */

type Manifest = {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  id?: string;
  theme_color?: string;
  background_color?: string;
  icons?: { src: string; sizes: string; type?: string; purpose?: string }[];
  shortcuts?: { name: string; url: string; icons?: { src: string }[] }[];
};

/** Real pixel size from a PNG's IHDR — a manifest can claim any `sizes` it likes. */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test.describe("UI-T17 · PWA", () => {
  test("the manifest declares an installable app", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status(), "manifest is not served").toBe(200);

    const manifest: Manifest = await res.json();
    const problems: string[] = [];

    // Chrome's installability criteria, in the order it checks them.
    if (!manifest.name && !manifest.short_name) problems.push("no name or short_name");
    if (!manifest.start_url) problems.push("no start_url");
    if (!["standalone", "fullscreen", "minimal-ui"].includes(manifest.display ?? "")) {
      problems.push(`display is "${manifest.display}" — not an app-like value`);
    }
    const icons = manifest.icons ?? [];
    const sizeSet = new Set(icons.flatMap((i) => i.sizes.split(" ")));
    if (!sizeSet.has("192x192")) problems.push("no 192x192 icon (Android requires it)");
    if (!sizeSet.has("512x512")) problems.push("no 512x512 icon (splash screen)");
    if (!icons.some((i) => (i.purpose ?? "").includes("maskable"))) {
      problems.push("no maskable icon — Android will letterbox it in a white circle");
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("every icon it promises actually exists at the size it claims", async ({ request }) => {
    const manifest: Manifest = await (await request.get("/manifest.webmanifest")).json();
    const problems: string[] = [];

    const declared = [
      ...(manifest.icons ?? []).map((i) => ({ src: i.src, sizes: i.sizes })),
      // Shortcut icons too: a broken one breaks the long-press menu.
      ...(manifest.shortcuts ?? []).flatMap((s) =>
        (s.icons ?? []).map((i) => ({ src: i.src, sizes: "" })),
      ),
      // iOS ignores the manifest and uses this instead.
      { src: "/apple-touch-icon.png", sizes: "" },
    ];

    for (const icon of declared) {
      const r = await request.get(icon.src);
      if (r.status() !== 200) {
        problems.push(`${icon.src} → HTTP ${r.status()}`);
        continue;
      }
      const body = await r.body();
      if (!icon.src.endsWith(".png")) continue;
      const real = pngSize(body);
      if (!real) {
        problems.push(`${icon.src} is served but is not a valid PNG`);
        continue;
      }
      // A manifest that lies about its icon sizes is how an install ends up
      // with a blurry or missing home-screen icon.
      for (const claim of icon.sizes.split(" ").filter((s) => /^\d+x\d+$/.test(s))) {
        const [w, h] = claim.split("x").map(Number);
        if (real.w !== w || real.h !== h) {
          problems.push(`${icon.src} claims ${claim} but is really ${real.w}x${real.h}`);
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("the service worker registers, activates and takes control", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const state = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.ready;
      // `controller` is the one that matters: a worker can be active and still
      // not be controlling this page, in which case it caches nothing for it.
      return {
        supported: true,
        scope: reg.scope,
        active: reg.active?.state ?? null,
        controlled: !!navigator.serviceWorker.controller,
      };
    });

    expect(state.supported, "no serviceWorker in this browser").toBeTruthy();
    expect(state.active, "the worker never reached 'activated'").toBe("activated");
    expect(state.scope, "scope must cover the whole app").toMatch(/\/$/);
    expect(state.controlled, "the worker is active but is not controlling the page").toBeTruthy();
  });

  test("the offline shell loads with no network", async ({ page, context }) => {
    test.setTimeout(120_000);
    // Prime the cache, and wait for control — an uncontrolled first load
    // populates nothing.
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30_000 });
    await page.reload();
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    try {
      const res = await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(res?.status(), "the shell did not come back from cache").toBeLessThan(400);
      // Not just a 200 — the app has to actually mount from cache.
      await expect(page.locator("#root")).not.toBeEmpty({ timeout: 30_000 });
      const text = await page.locator("body").innerText();
      expect(text.trim().length, "the offline shell rendered nothing").toBeGreaterThan(20);
    } finally {
      await context.setOffline(false);
    }
  });

  test("start_url opens the app in standalone", async ({ browser }) => {
    test.setTimeout(120_000);
    const manifest = await (await browser.newContext()).request.get(
      "http://localhost:4173/manifest.webmanifest",
    );
    const { start_url, scope }: Manifest = await manifest.json();

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    // An installed PWA launches at start_url with display-mode: standalone.
    await page.emulateMedia({ media: "screen" });
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) =>
        q.includes("display-mode: standalone")
          ? ({ matches: true, media: q, onchange: null, addListener() {}, removeListener() {},
              addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as MediaQueryList)
          : real(q);
    });

    const res = await page.goto(start_url as string);
    expect(res?.status(), `start_url ${start_url} does not resolve`).toBeLessThan(400);
    // start_url must be inside scope, or the launch leaves the app immediately.
    expect(new URL(start_url as string, "http://x/").pathname.startsWith(scope ?? "/")).toBeTruthy();
    // Signed out, /app redirects to /auth — that is correct behaviour, and
    // either way the shell must render rather than showing a blank page.
    await expect(page.locator("#root")).not.toBeEmpty({ timeout: 30_000 });
    await context.close();
  });
});
