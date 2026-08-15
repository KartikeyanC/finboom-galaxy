import { test, expect } from "@playwright/test";
import { hasCreds, signInAndUnlock } from "./auth";

/**
 * Stage 5.8 — the analytics console.
 *
 * Two things are worth a browser rather than a unit test. The first is that the
 * page opens at all when `po_tenant_engagement()` does not exist yet: the whole
 * point of the missing-function handling is that a pending migration degrades
 * the page instead of breaking it, and only a real PostgREST round trip proves
 * that. The second is the promise the page makes about itself — that nothing on
 * it was tracked — which is checked here as an absence of network traffic to
 * anywhere but our own backend.
 */

test.describe("PO analytics", () => {
  test.skip(!hasCreds, "needs E2E_EMAIL / E2E_PASSWORD (the demo account is a platform admin)");

  test("opens and reports its own state, whether or not the migration is applied", async ({
    page,
  }) => {
    const thirdParty: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;
      if (url.hostname.endsWith(".supabase.co")) return;
      thirdParty.push(url.hostname);
    });

    await signInAndUnlock(page);
    await page.goto("/po/analytics");

    // Web-first: the route is a lazy chunk, so the assertion has to do the
    // waiting. Never assert after a fixed timeout in this repo.
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
    await expect(page.getByText(/Loading analytics/)).toHaveCount(0, { timeout: 20_000 });

    const body = await page.locator("main").innerText();

    // The page must say what it cannot see. A dashboard trusted for questions
    // it cannot answer is worse than no dashboard.
    expect(body).toMatch(/What this cannot see/i);
    expect(body).toMatch(/no analytics script and no events table/i);

    // Growth and conversion come from po_list_tenants(), which exists today —
    // so these sections render either way.
    expect(body).toMatch(/Signups by month/i);
    expect(body).toMatch(/Plans in force/i);

    // Activation and retention need the 5.8 migration. Whichever state the
    // database is in, the page has to be explicit about it rather than showing
    // a silent zero.
    const pending = /Activation and retention are unavailable/i.test(body);
    if (pending) {
      expect(body).toContain("20260812120000_stage5_analytics.sql");
    } else {
      expect(body).toMatch(/Retention by signup cohort/i);
      expect(body).toMatch(/Recorded a transaction/i);
    }

    // Nothing on this page phoned anywhere but our own backend.
    expect([...new Set(thirdParty)]).toEqual([]);
  });
});
