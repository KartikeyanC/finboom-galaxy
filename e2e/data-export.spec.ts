import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { EMAIL, PASSWORD, signInAndUnlock } from "./auth";

/**
 * Stage 5.2 — the export is a legal promise, so it is checked against the real
 * database: sign in, click the button, open the file the browser downloaded,
 * and read the manifest.
 */

test("downloads a complete, honest data bundle", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");
  test.setTimeout(180_000);
  await signInAndUnlock(page);
  await page.goto("/app/export");
  await expect(page.getByRole("button", { name: /download all my data/i })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    page.getByRole("button", { name: /download all my data/i }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^[a-z0-9-]+-data-export-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const bundle = JSON.parse(readFileSync(path!, "utf8"));

  // Manifest identifies the subject, the workspace and the moment.
  expect(bundle.manifest.user.email).toBe(EMAIL);
  expect(bundle.manifest.workspace.id).toBeTruthy();
  expect(new Date(bundle.manifest.generated_at).getTime()).toBeGreaterThan(Date.now() - 300_000);

  // Every table it claims to include is actually present in `data`.
  for (const table of Object.keys(bundle.manifest.included)) {
    expect(bundle.data, table).toHaveProperty(table);
    expect(Array.isArray(bundle.data[table]), table).toBe(true);
    expect(bundle.data[table].length, table).toBe(bundle.manifest.included[table]);
  }

  // The demo workspace has real transactions — an export that returns nothing
  // would satisfy every structural check above and still be worthless.
  expect(Object.keys(bundle.manifest.included).length).toBeGreaterThan(15);
  expect(bundle.data.transactions.length).toBeGreaterThan(0);
  expect(bundle.data.profiles.length).toBe(1);

  // Nothing was silently dropped.
  expect(bundle.manifest.unavailable, JSON.stringify(bundle.manifest.unavailable)).toEqual([]);

  // Rows carry their real columns, not a trimmed report shape.
  const txn = bundle.data.transactions[0];
  for (const col of ["id", "tenant_id", "amount", "currency", "occurred_at", "type"]) {
    expect(txn, col).toHaveProperty(col);
  }

  // It must not contain anything belonging to another workspace.
  const tenantId = bundle.manifest.workspace.id;
  for (const [table, rows] of Object.entries<Record<string, unknown>[]>(bundle.data)) {
    for (const row of rows) {
      if (row && typeof row === "object" && "tenant_id" in row && row.tenant_id) {
        expect(row.tenant_id, `${table} row leaked from another workspace`).toBe(tenantId);
      }
    }
  }

  console.log(
    "EXPORT:", Object.keys(bundle.manifest.included).length, "tables,",
    Object.values<number>(bundle.manifest.included).reduce((a, b) => a + b, 0), "rows,",
    bundle.documents.length, "documents",
  );
});

test("settings explains what deletion does before offering the route", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL / E2E_PASSWORD in .env.e2e to run");
  test.setTimeout(120_000);
  await signInAndUnlock(page);
  await page.goto("/app/settings");
  const start = page.getByRole("button", { name: /i want to delete my account/i });
  await expect(start).toBeVisible();

  // The consequences must appear BEFORE any route to requesting it — a user
  // must not be able to ask for erasure without being told what it takes.
  await expect(page.getByRole("link", { name: /compose the request/i })).toHaveCount(0);
  await start.click();

  const text = await page.locator("body").innerText();
  expect(text).toMatch(/30-day recovery window/i);
  expect(text).toMatch(/uploaded documents/i);
  expect(text).toMatch(/workspace/i);

  const compose = page.getByRole("link", { name: /compose the request/i });
  await expect(compose).toBeVisible();
  const href = await compose.getAttribute("href");
  expect(href).toContain("mailto:");
  expect(decodeURIComponent(href!)).toContain(EMAIL);      // identifies the account
  expect(decodeURIComponent(href!)).toContain("Account id:");
});
