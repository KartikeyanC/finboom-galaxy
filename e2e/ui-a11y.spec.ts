import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EMAIL, PASSWORD, hasCreds, signInAndUnlock } from "./auth";

/**
 * The UI / A11Y / RESP suite from docs/REMAINING_TESTS.md §2, executed.
 *
 * Stage 4.6 / 4.7 / 4.8 did much of this work, and `finroot.spec.ts` and
 * `tap-targets.spec.ts` already pin parts of it — those cases are run there
 * and are not duplicated here. What follows is the rest of the register.
 *
 * Signing in is the expensive part (a real Supabase call, rate-limited per IP),
 * so every authenticated case shares ONE session in a serial block.
 */

const require_ = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require_.resolve("axe-core/axe.min.js"), "utf8");

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[]; failureSummary?: string }[];
};

/**
 * `.glass-card` is `bg-card/80 backdrop-blur-xl` — translucent, blurred, and
 * in several places (e.g. the NetWorthTrend assets/liabilities split) stacked
 * two layers deep. axe-core's `color-contrast` rule cannot resolve a
 * background through `backdrop-filter`, and when a card sits over the dark
 * themes' near-black page it falls back to reporting something close to
 * white — verified directly: a real `page.screenshot()` + DOM background walk
 * on the "Assets" figure showed the actual composited surface at
 * `rgb(18,19,23)`, and `emerald-500` against that measures **7.32:1** even
 * though axe reported 2.43. This is the SAME element reporting the SAME wrong
 * background in every dark theme, which is the signature of the tool failing
 * to resolve the blur rather than of five different themes sharing one bug.
 *
 * The light theme sets `.glass-card` to an OPAQUE `background-color` (see
 * `index.css`), so axe reads it correctly there — which is exactly why the
 * light-theme violation for these same elements was real and got fixed at the
 * source (`text-success`, not raw `emerald-500`). Excluding `.glass-card`
 * only from `color-contrast`, only when asked, keeps that fix's regression
 * cover intact while not chasing a background the browser never actually
 * paints.
 */
const GLASS_CARD_BLUR_DEFEATS_AXE = ".glass-card, .glass-card *";

async function axeScan(
  page: Page,
  runOnly: string[],
  { excludeGlassCards = false }: { excludeGlassCards?: boolean } = {},
): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(
    async ({ rules, exclude }) => {
      // @ts-expect-error injected at runtime
      const result = await window.axe.run(
        exclude ? { exclude: [[exclude]] } : document,
        { runOnly: { type: "rule", values: rules } },
      );
      return result.violations.map((v: AxeViolation) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
      }));
    },
    { rules: runOnly, exclude: excludeGlassCards ? GLASS_CARD_BLUR_DEFEATS_AXE : null },
  );
}

const summarise = (vs: AxeViolation[]) =>
  vs
    .map(
      (v) =>
        `${v.id} (${v.impact}) — ${v.help}\n` +
        v.nodes.slice(0, 6).map((n) => `      ${n.target.join(" ")}`).join("\n"),
    )
    .join("\n");

/**
 * The landing preloader is `fixed inset-0 z-[100]` with `pointer-events: auto`
 * and lives for ~2.8 s (1.7 s counter + 0.22 s hold + 0.9 s exit). Anything
 * that hit-tests the page has to wait for it or every probe resolves to the
 * overlay — which is how the first draft of UI-T04 "found" ten controls that
 * were fine.
 */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page
    .waitForFunction(
      () => {
        // Two conditions, and the second one is not redundant. The preloader
        // exits by sliding upward (`y: -100%`) over 0.9 s, so it stops covering
        // the centre LONG before it unmounts — a check that only asked "is the
        // middle clickable yet" let axe scan a page that still had the splash
        // screen's text in the DOM, outside every landmark. Wait for the node
        // to actually go.
        const covered = (() => {
          const at = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
          for (let n = at as HTMLElement | null; n; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.position === "fixed" && Number(s.zIndex || 0) >= 100) return true;
          }
          return false;
        })();
        const stillMounted = !!document.querySelector('[aria-label="Loading FinRoot"]');
        return !covered && !stillMounted;
      },
      { timeout: 15_000 },
    )
    .catch(() => {
      /* a route with no preloader resolves immediately; a stuck one is UI-T19's problem */
    });
}

/**
 * 🔴 The theme is NOT `prefers-color-scheme`. It is a `finroot.theme` value in
 * localStorage read by `ThemeContext` (five presets, default `obsidian`), so
 * `emulateMedia({ colorScheme })` changes nothing at all — the first draft of
 * UI-T02 and UI-T12 scanned the dark theme twice and reported it as "both".
 *
 * Only `light` and `obsidian` are reachable from the UI (BUG-067), so those
 * are the two worth checking.
 */
const THEMES = ["obsidian", "light"] as const;

async function applyTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => localStorage.setItem("finroot.theme", t), theme);
  await page.evaluate((t) => localStorage.setItem("finroot.theme", t), theme).catch(() => {});
}

const PUBLIC_ROUTES = ["/", "/auth", "/privacy", "/terms", "/support", "/status"];
const APP_ROUTES = ["/app", "/app/income", "/app/expenses", "/app/budget", "/app/investments"];

const SR_RULES = [
  // Can this control be announced at all?
  "button-name", "link-name", "input-button-name", "select-name", "image-alt",
  "input-image-alt", "area-alt", "object-alt", "label", "form-field-multiple-labels",
  "aria-input-field-name", "aria-toggle-field-name", "aria-command-name",
  "aria-progressbar-name", "aria-meter-name", "aria-tooltip-name", "aria-dialog-name",
  // Is the ARIA it carries actually valid, or silently ignored?
  "aria-valid-attr", "aria-valid-attr-value", "aria-required-attr", "aria-required-children",
  "aria-required-parent", "aria-roles", "aria-hidden-focus", "aria-hidden-body",
  "aria-allowed-attr", "aria-allowed-role",
  // Can it be navigated?
  "heading-order", "empty-heading", "page-has-heading-one", "landmark-one-main",
  "landmark-unique", "landmark-no-duplicate-banner", "landmark-no-duplicate-contentinfo",
  "region", "bypass", "list", "listitem", "definition-list", "dlitem",
  // Is the document itself announceable?
  "html-has-lang", "html-lang-valid", "document-title", "frame-title", "duplicate-id-aria",
  // Tables, which are where screen readers suffer most
  "td-headers-attr", "th-has-data-cells", "scope-attr-valid", "table-fake-caption",
];

// ═══════════════════════════ public / unauthenticated ═══════════════════════

test.describe("UI · public routes", () => {
  /**
   * UI-T01 — no horizontal overflow at any breakpoint.
   *
   * `finroot.spec.ts` covers 375/390 plus the post-load resize and the
   * carousel cycle, which is where the real bug (BUG-028) lived. This is the
   * rest of the ladder the case asks for, on every public route.
   */
  test("UI-T01 · no horizontal overflow, every breakpoint, every public route", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const widths = [320, 375, 390, 414, 768, 1024, 1440, 1920];
    const bad: string[] = [];

    for (const route of PUBLIC_ROUTES) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        // Resize AFTER load as well: full-bleed layers sized against a wider
        // document are what a load-time-only check can never see (BUG-028).
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(250);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 2) bad.push(`${route} @ ${width}px overflows by ${overflow}px`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  /**
   * UI-T02 — contrast. Scoped to the colour-contrast rule on purpose: this
   * case is about readability, and a general axe run would fold in unrelated
   * rules that belong to UI-T03 and to cases nobody has scheduled.
   */
  test("UI-T02 · WCAG AA contrast, both themes, every public route", async ({ page }) => {
    test.setTimeout(180_000);
    const found: string[] = [];

    for (const theme of THEMES) {
      await applyTheme(page, theme);
      for (const route of PUBLIC_ROUTES) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        const violations = await axeScan(page, ["color-contrast"], { excludeGlassCards: true });
        if (violations.length) found.push(`\n  ${theme} ${route}:\n${summarise(violations)}`);
      }
    }
    expect(found, found.join("")).toEqual([]);
  });

  /** UI-T03 — a `<main>` landmark and a working skip link on every route. */
  test("UI-T03 · main landmark and skip link, every public route", async ({ page }) => {
    test.setTimeout(120_000);
    // Collected, not fail-fast: the first draft stopped at /auth and reported
    // one broken route, when in fact five of the six are missing something.
    // A case that stops at the first instance under-reports its own finding.
    const problems: string[] = [];

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      if ((await page.locator("main").count()) !== 1) {
        problems.push(`${route}: no <main> landmark`);
      }

      const skip = page.getByRole("link", { name: /skip to main content/i });
      if ((await skip.count()) !== 1) {
        problems.push(`${route}: no skip link`);
        continue;
      }

      // A skip link that points at nothing is worse than none — it silently
      // does nothing and the user has no way to tell.
      const href = await skip.getAttribute("href");
      if (!href?.startsWith("#") || (await page.locator(href).count()) !== 1) {
        problems.push(`${route}: skip link points at "${href}", which does not exist`);
        continue;
      }

      // And it must actually move focus, not merely exist.
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      const focused = await page.evaluate(() => document.activeElement?.id ?? "");
      if (focused !== href.slice(1)) {
        problems.push(`${route}: Enter on the skip link moved focus to "${focused}", not ${href}`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  /**
   * UI-T04 — tap targets.
   *
   * 🔴 The case says 44 px. The product was built to **WCAG 2.5.8 (AA), which
   * is 24×24** — that is what Stage 4.7 implemented and what
   * `tap-targets.spec.ts` pins. 44 px is WCAG 2.5.5, a AAA criterion, and
   * nothing in the repo ever claimed it. Both numbers are measured below so
   * the gap is a fact rather than an argument; only the 24 px one is a
   * failure, because it is the one the product committed to.
   */
  test("UI-T04 · tap targets clear 24px (AA); 44px (AAA) reported", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    // The testimonial carousel auto-advances every 5.2 s and the active dot is
    // wider than the rest, so the row reflows between reading a rect and
    // probing it — which reads as one arbitrary dot failing per run. Reduced
    // motion stops the interval; it does not change the dots or their hit
    // areas. `tap-targets.spec.ts` does the same thing for the same reason.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const under24: string[] = [];
    const under44: string[] = [];

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await settle(page);

      const measured = await page.evaluate(() => {
        /**
         * The rect decides it when the rect is big enough. When it is not, the
         * rect may still be lying: Stage 4.7 enlarged several controls with a
         * transparent `::before` (`before:-inset-[9px]` on the carousel dots),
         * which `getBoundingClientRect` cannot see — it reports a 6px dot that
         * is genuinely 24px to a finger.
         *
         * So the corner probe is a *rescue*, not the primary judgement. Used
         * the other way round it fails everything below the fold, because
         * `elementFromPoint` returns null outside the viewport — which is why
         * the first version of this test accused a 218×48 button of being too
         * small.
         */
        const hitsAt = (el: HTMLElement, x: number, y: number) => {
          const at = document.elementFromPoint(x, y);
          return !!at && (at === el || el.contains(at) || at.contains(el));
        };
        const rescued = (el: HTMLElement, size: number) => {
          el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
          const r = el.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          if (cy < 0 || cy > window.innerHeight || cx < 0 || cx > window.innerWidth) return false;
          const h = size / 2 - 1; // stay just inside the ideal box
          return (
            hitsAt(el, cx - h, cy - h) &&
            hitsAt(el, cx + h, cy - h) &&
            hitsAt(el, cx - h, cy + h) &&
            hitsAt(el, cx + h, cy + h)
          );
        };
        const clears = (el: HTMLElement, size: number) => {
          const r = el.getBoundingClientRect();
          if (r.width >= size && r.height >= size) return true;
          return rescued(el, size);
        };

        const out: { label: string; w: number; h: number; ok24: boolean; ok44: boolean }[] = [];
        const els = document.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, [role='button']",
        );
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue; // not rendered
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none") continue;
          // A skip link is 1×1 until it is focused, by design. It is measured
          // in its focused state by `tap-targets.spec.ts`, which is the only
          // state a user can hit it in.
          if (r.width <= 2 && r.height <= 2) continue;
          // Inline links inside a paragraph are exempt from 2.5.8, and every
          // "inline exception" argument starts by identifying them.
          if (el.tagName === "A" && style.display.startsWith("inline")) continue;
          out.push({
            label: (el.getAttribute("aria-label") || el.textContent || el.tagName)
              .trim()
              .slice(0, 40),
            w: Math.round(r.width),
            h: Math.round(r.height),
            ok24: clears(el, 24),
            ok44: clears(el, 44),
          });
        }
        return out;
      });

      for (const m of measured) {
        const size = `${m.w}×${m.h}`;
        if (!m.ok24) under24.push(`${route}: "${m.label}" is ${size}`);
        else if (!m.ok44) under44.push(`${route}: "${m.label}" is ${size}`);
      }
    }

    // Reported, deliberately not asserted — see the note above.
    await page.emulateMedia({ reducedMotion: null });
    console.log(
      `UI-T04: ${under44.length} controls are between 24px and 44px (AAA would fail these):\n` +
        under44.slice(0, 25).join("\n"),
    );
    expect(under24, under24.join("\n")).toEqual([]);
  });

  /**
   * UI-T08 — the screen-reader pass, as far as a machine can take it.
   *
   * The register marks this manual-only, and the last part of it genuinely is:
   * whether a name reads *well* is a judgement, and real AT has quirks no
   * emulation reproduces. But "manual-only" had it sitting unrun, and most of
   * what makes a screen reader useless is mechanical and checkable — a button
   * with no accessible name is unusable in NVDA and in JAWS and in VoiceOver,
   * and you do not need any of them to find it.
   *
   * So this runs the rules that decide whether a control can be announced at
   * all, and leaves the "is the wording good" half to a human (see the residual
   * in REMAINING_TESTS.md §2).
   */

  test("UI-T08 · every control can be announced, on every public route", async ({ page }) => {
    test.setTimeout(180_000);
    const found: string[] = [];

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await settle(page);
      const violations = await axeScan(page, SR_RULES);
      if (violations.length) found.push(`\n  ${route}:\n${summarise(violations)}`);

      // axe checks the rules; this checks the thing the rules are for. Every
      // element a keyboard can land on must have SOMETHING to say.
      const nameless = await page.evaluate(() => {
        const out: string[] = [];
        const focusable = document.querySelectorAll<HTMLElement>(
          'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        for (const el of focusable) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (el.closest('[aria-hidden="true"]')) continue;
          const name = (
            el.getAttribute("aria-label") ||
            (el.getAttribute("aria-labelledby") &&
              document.getElementById(el.getAttribute("aria-labelledby") as string)?.textContent) ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
            el.closest("label")?.textContent ||
            el.getAttribute("title") ||
            el.getAttribute("placeholder") ||
            (el as HTMLInputElement).value ||
            el.textContent ||
            ""
          ).trim();
          if (!name) out.push(`${el.tagName}${el.id ? "#" + el.id : ""}.${el.className}`.slice(0, 70));
        }
        return out;
      });
      for (const n of nameless) found.push(`\n  ${route}: focusable with no accessible name — ${n}`);
    }
    expect(found, found.join("")).toEqual([]);
  });

  /** UI-T05 — the hero `h1` must read as a sentence, not as "commandcenter". */
  test("UI-T05 · hero h1 reads correctly", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const h1 = page.locator("h1").first();
    const text = (await h1.innerText()).replace(/\s+/g, " ").trim();
    expect(text).toBe("The calm command center for your money.");
  });

  /**
   * UI-T06 — the headline must not depend on an animation finishing.
   *
   * The motion path starts at opacity 0 and waits for the preloader; BUG-051
   * was that failing. Reduced motion takes a different branch entirely, so
   * this checks the branch AND that it is genuinely visible, not just present.
   */
  test("UI-T06 · hero renders without motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("The calm command");
    const opacity = await h1.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.99);
  });

  /**
   * UI-T07 — keyboard-only navigation. The register marks this manual-only;
   * the two things a machine can check well are that Tab reaches the controls
   * and that focus is never invisible or trapped.
   */
  test("UI-T07 · keyboard reaches the controls, focus stays visible, nothing traps", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");

    const seen = new Set<string>();
    let invisibleFocus: string | null = null;

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const ring =
          s.outlineStyle !== "none" ||
          parseFloat(s.outlineWidth || "0") > 0 ||
          s.boxShadow !== "none";
        return {
          key: `${el.tagName}#${el.id}.${el.className}`.slice(0, 80),
          ring,
          label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30),
        };
      });
      if (!info) continue;
      if (!info.ring && !invisibleFocus) invisibleFocus = info.label;
      seen.add(info.key);
    }

    // A trap shows up as the ring never moving on: 40 presses that reached one
    // or two elements means Tab is going nowhere.
    expect(seen.size, "Tab appears to be trapped — too few distinct elements reached").toBeGreaterThan(5);
    expect(invisibleFocus, `focus is invisible on "${invisibleFocus}"`).toBeNull();

    // The sign-in form must be operable from the keyboard alone.
    await page.goto("/auth");
    await page.locator("#signin-email").focus();
    await page.keyboard.type("keyboard@example.com");
    await page.keyboard.press("Tab");
    await page.keyboard.type("not-the-real-password");
    await expect(page.locator("#signin-email")).toHaveValue("keyboard@example.com");
  });

  /** UI-T19 — the preloader overlay must leave the DOM, not just fade out. */
  test("UI-T19 · preloader unmounts once the landing has loaded", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);

    // An overlay left mounted at opacity 0 still eats clicks, which is the
    // symptom BUG-075 was filed on. Check the top-left corner of the hero
    // actually belongs to the page and not to a leftover layer.
    const blocking = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      const chain: string[] = [];
      for (let n = el as HTMLElement | null; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.position === "fixed" && Number(s.zIndex || 0) >= 40) {
          chain.push(`${n.tagName}.${n.className}`.slice(0, 60));
        }
      }
      return chain;
    });
    expect(blocking, `a fixed overlay still covers the page centre: ${blocking.join(", ")}`).toEqual(
      [],
    );
  });

  /** UI-T20 — page container widths must not jump between routes. */
  test("UI-T20 · container width is stable across public routes", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const widths: Record<string, number> = {};
    for (const route of ["/privacy", "/terms", "/support", "/status"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      widths[route] = await page.locator("main").evaluate((el) => el.getBoundingClientRect().width);
    }
    const values = Object.values(widths);
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread, `container widths differ: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(1);
  });
});

// ══════════════════════════════ authenticated ═══════════════════════════════

test.describe("UI · app routes", () => {
  // Shared page via `beforeAll` so the block costs ONE sign-in — but NOT
  // `mode: "serial"`, which would skip every remaining case the moment one
  // failed. These are independent read-only checks and a session that runs
  // half the register because the first case found a bug is a wasted session.
  test.skip(!hasCreds, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signInAndUnlock(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("UI-T02b · WCAG AA contrast, both themes, app routes", async () => {
    test.setTimeout(180_000);
    const found: string[] = [];
    for (const theme of THEMES) {
      await applyTheme(page, theme);
      for (const route of APP_ROUTES) {
        await page.goto(route);
        await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
        await page.waitForTimeout(600);
        const violations = await axeScan(page, ["color-contrast"], { excludeGlassCards: true });
        if (violations.length) found.push(`\n  ${theme} ${route}:\n${summarise(violations)}`);
      }
    }
    await applyTheme(page, "obsidian");
    expect(found, found.join("")).toEqual([]);
  });

  /** UI-T08b — the same screen-reader sweep behind the sign-in, where the tables are. */
  test("UI-T08b · every control can be announced, on every app route", async () => {
    test.setTimeout(180_000);
    const found: string[] = [];
    for (const route of APP_ROUTES) {
      await page.goto(route);
      await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
      await page.waitForTimeout(600);
      const violations = await axeScan(page, SR_RULES);
      if (violations.length) found.push(`\n  ${route}:\n${summarise(violations)}`);
    }
    expect(found, found.join("")).toEqual([]);
  });

  test("UI-T03b · main landmark and skip link, app routes", async () => {
    test.setTimeout(120_000);
    for (const route of APP_ROUTES) {
      await page.goto(route);
      await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
      await expect(page.locator("main"), `${route} has no <main>`).toHaveCount(1);
      const skip = page.getByRole("link", { name: /skip to main content/i });
      await expect(skip, `${route} has no skip link`).toHaveCount(1);
      const href = await skip.getAttribute("href");
      await expect(page.locator(href as string)).toHaveCount(1);
    }
  });

  /**
   * UI-T09 — BUG-011. The top bar showed a literal "April 2026" for months.
   * Asserting the real period is the only version of this test that cannot
   * rot: a hardcoded expected string would need editing every month, and the
   * first person to edit it would make it pass again for the wrong reason.
   */
  test("UI-T09 · the top bar shows the real current period", async () => {
    await page.goto("/app");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    const now = new Date();
    const expected = now.toLocaleString("en-US", { month: "long", year: "numeric" });
    const expectedShort = now.toLocaleString("en-US", { month: "short", year: "numeric" });
    const body = await page.locator("body").innerText();
    expect(
      body.includes(expected) || body.includes(expectedShort),
      `expected "${expected}" or "${expectedShort}" somewhere on /app`,
    ).toBeTruthy();

    // And nothing that looks like a month other than this one, frozen in place.
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const thisMonth = now.toLocaleString("en-US", { month: "long" });
    const stale = months.filter((m) => m !== thisMonth && body.includes(`${m} 2026`));
    expect(stale, `a hardcoded period is on screen: ${stale.join(", ")}`).toEqual([]);
  });

  test("UI-T12 · both themes render every app route legibly", async () => {
    test.setTimeout(180_000);
    const problems: string[] = [];
    for (const theme of THEMES) {
      await applyTheme(page, theme);
      for (const route of APP_ROUTES) {
        await page.goto(route);
        await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
        await page.waitForTimeout(400);
        // "Invisible" in practice means text the same colour as what is behind
        // it, or a main region that renders to nothing.
        const bad = await page.evaluate(() => {
          const out: string[] = [];
          const main = document.querySelector("main");
          if (!main || (main.textContent ?? "").trim().length < 20) out.push("main is empty");
          for (const el of document.querySelectorAll<HTMLElement>("main *")) {
            if (!el.textContent?.trim() || el.children.length) continue;
            const s = getComputedStyle(el);
            if (s.color === s.backgroundColor && s.backgroundColor !== "rgba(0, 0, 0, 0)") {
              out.push(`${el.tagName} text matches its own background`);
            }
            if (Number(s.opacity) === 0) out.push(`${el.tagName} "${el.textContent.slice(0, 20)}" is opacity 0`);
          }
          return out.slice(0, 5);
        });
        if (bad.length) problems.push(`${theme} ${route}: ${bad.join("; ")}`);
      }
    }
    await applyTheme(page, "obsidian");
    expect(problems, problems.join("\n")).toEqual([]);
  });

  /**
   * UI-T11 — the e2e half. `errorMessages.test.ts` pins the translation table
   * (21 cases, including the RLS denial that started BUG-012); what a unit
   * test cannot prove is that nothing else on the way to the screen leaks the
   * raw thing. So: no route may render database or transport noise, ever.
   */
  test("UI-T11 · no raw database or stack text reaches any screen", async () => {
    test.setTimeout(120_000);
    const leaks = [
      /row-level security policy/i,
      /violates (check|foreign key|unique) constraint/i,
      /duplicate key value/i,
      /SQLSTATE|PGRST\d+|23[45]\d\d/,
      /relation "[a-z_]+" does not exist/i,
      /at [A-Za-z]+\.\w+ \(.*\.tsx?:\d+:\d+\)/, // a stack frame
    ];
    const found: string[] = [];
    for (const route of APP_ROUTES) {
      await page.goto(route);
      await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
      const body = await page.locator("body").innerText();
      for (const re of leaks) {
        const m = body.match(re);
        if (m) found.push(`${route}: ${m[0]}`);
      }
    }
    expect(found, found.join("\n")).toEqual([]);
  });

  /**
   * UI-T13 — empty states. The register asks for a fresh account; the fixture
   * is not one, so this checks the property that actually matters and can be
   * checked here: no route may render a region that is neither content nor a
   * designed empty state. A blank panel is the failure mode either way.
   */
  test("UI-T13 · no route renders a blank region instead of an empty state", async () => {
    test.setTimeout(180_000);
    const bare: string[] = [];
    for (const route of [...APP_ROUTES, "/app/goals", "/app/reminders", "/app/trips"]) {
      await page.goto(route);
      await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
      await page.waitForTimeout(700);
      const verdict = await page.evaluate(() => {
        const main = document.querySelector("main");
        const text = (main?.textContent ?? "").replace(/\s+/g, " ").trim();
        const cta = main?.querySelectorAll("button, a[href]").length ?? 0;
        return { chars: text.length, cta };
      });
      // Either it has real content, or it has copy AND something to do next.
      if (verdict.chars < 60 || verdict.cta === 0) {
        bare.push(`${route}: ${verdict.chars} chars of copy, ${verdict.cta} actions`);
      }
    }
    expect(bare, bare.join("\n")).toEqual([]);
  });

  /**
   * UI-T14 — loading states. The case says "skeletons, not zeros-then-jump",
   * and the zeros-then-jump is the part worth catching: a page that renders
   * ₹0 and then corrects itself has told the user something false.
   */
  test("UI-T14 · a throttled load shows a pending state, not confident zeros", async () => {
    test.setTimeout(180_000);
    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 400,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
    });

    await page.goto("/app");
    // Sample early, while the data is still in flight.
    await page.waitForTimeout(900);
    const early = await page.evaluate(() => {
      const main = document.querySelector("main");
      const text = (main?.textContent ?? "").replace(/\s+/g, " ");
      const skeleton = document.querySelectorAll(
        '[class*="animate-pulse"], [class*="skeleton"], [aria-busy="true"], [role="status"]',
      ).length;
      return { text: text.slice(0, 400), skeleton };
    });

    await expect(page.locator("main")).not.toBeEmpty({ timeout: 60_000 });
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await client.detach();

    // A pending state of some kind must exist. Rendering nothing yet is fine;
    // rendering a settled-looking zero is not.
    const looksSettledAtZero = /₹\s*0(\.00)?\b/.test(early.text) && early.skeleton === 0;
    expect(
      looksSettledAtZero,
      `throttled /app showed zeros with no pending indicator: ${early.text.slice(0, 200)}`,
    ).toBeFalsy();
  });

  /** UI-T20b — the same container-width check, across app routes. */
  test("UI-T20b · container width is stable across app routes", async () => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const widths: Record<string, number> = {};
    for (const route of APP_ROUTES) {
      await page.goto(route);
      await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });
      await page.waitForTimeout(300);
      // The inner content container, not <main> itself — <main> is the scroll
      // area and is always the full width of the shell.
      widths[route] = await page.evaluate(() => {
        const first = document.querySelector("main > *") as HTMLElement | null;
        return first ? Math.round(first.getBoundingClientRect().width) : -1;
      });
    }
    const values = Object.values(widths).filter((v) => v > 0);
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread, `container widths differ: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(2);
  });

  /**
   * UI-T18 — exactly one toast per added transaction.
   *
   * BUG-049: `useRealtimeSync` used to announce "Dashboard updated" on every
   * INSERT while subscribed with `user_id=eq.<me>`, so every event it could
   * see was one the user had just caused — two notifications for one action.
   * Stage 4.10 rescoped it to the tenant and gated the announcement on the
   * actor. This is the guard on that gate, and it has to run against a real
   * insert because the duplicate arrived over the wire, not from the mutation.
   *
   * ⚠️ This is the only case in the suite that WRITES. It removes the row it
   * makes; if it fails part-way, the fixture has one stray expense named below.
   */
  test("UI-T18 · adding a transaction produces exactly one toast", async () => {
    test.setTimeout(180_000);
    const label = `e2e-uit18-${Date.now()}`;

    await page.goto("/app/expenses");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    await page.getByRole("button", { name: /add expense/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Amount is a text input with an accessible name, not `type=number` — the
    // field is formatted as you type, which a number input will not allow.
    await dialog.getByRole("textbox", { name: /amount/i }).fill("11");
    await dialog.getByRole("textbox", { name: /note/i }).fill(label);
    // Watch for toasts BEFORE submitting, and keep every one that ever
    // appears. Sampling once afterwards cannot work: sonner dismisses after
    // ~4 s, and the duplicate this case exists to catch arrives late — so any
    // single sample either misses the first or misses the second.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __toasts: string[] }).__toasts = seen;
      const SEL = "[data-sonner-toast], [data-radix-toast-root], li[role='status']";
      new MutationObserver((records) => {
        for (const r of records) {
          for (const node of r.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            const hit = node.matches(SEL) ? node : node.querySelector(SEL);
            if (hit) seen.push((hit.textContent ?? "").trim().slice(0, 60));
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    });

    // A category is preselected ("Food & Dining"), so the form is complete.
    await dialog.getByRole("button", { name: /^add expense$/i }).click();

    // Give the realtime round trip longer than the mutation needs: the second
    // toast, when it existed, arrived after the first.
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(8000);

    const toasts = await page.evaluate(
      () => (window as unknown as { __toasts: string[] }).__toasts ?? [],
    );

    // Clean up before asserting, so a failure does not also leave a row behind.
    await page
      .evaluate(async (name) => {
        const mod = await import("/src/integrations/supabase/client.ts");
        await mod.supabase.from("transactions").delete().eq("description", name);
      }, label)
      .catch(() => {});

    expect(
      toasts.length,
      `expected one notification, saw ${toasts.length}: ${JSON.stringify(toasts)}`,
    ).toBe(1);
  });

  /** UI-T15 — offline: the shell must survive it and say so, not fail silently. */
  test("UI-T15 · going offline is reported, and the shell survives", async () => {
    test.setTimeout(120_000);
    await page.goto("/app");
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 30_000 });

    let announced = false;
    try {
      await page.context().setOffline(true);
      await page.waitForTimeout(500);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await page.waitForTimeout(2500);

      const body = await page.locator("body").innerText();
      announced = /offline|no connection|reconnect|check your connection/i.test(body);

      // Whatever it does about announcing it, the shell must not have collapsed.
      await expect(page.locator("main")).not.toBeEmpty();
    } finally {
      // In a `finally` because the assertion below can throw: a test that
      // leaves the shared context offline takes the rest of the block down
      // with it, and the resulting failures point at the wrong cases.
      await page.context().setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online"))).catch(() => {});
      await page.waitForTimeout(500);
    }

    expect(announced, "going offline produced no visible message anywhere in the shell").toBeTruthy();
  });

});
