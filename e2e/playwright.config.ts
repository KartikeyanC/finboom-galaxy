import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Minimal .env.e2e loader (avoids adding a dotenv dependency). Lines are
// KEY=VALUE; values may be wrapped in quotes. Missing file is fine.
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.e2e"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  /* no .env.e2e — public-only tests will still run */
}

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8080";

export default defineConfig({
  testDir: ".",
  // `pwa.spec.ts` needs the production build (the service worker registers only
  // under `import.meta.env.PROD`), so it runs under `pwa.config.ts` against
  // `vite preview`. Left in here it would be picked up by the default
  // testMatch and fail against the dev server for a reason that is not a bug.
  // `capture-screens.spec.ts` is not a test: it saves marketing images and runs
  // only under its own `capture.config.ts` (`npm run capture:screens`).
  testIgnore: /(pwa|capture-screens)\.spec\.ts/,
  fullyParallel: false,
  // One worker, always. Every spec signs in as the SAME demo account, and
  // fullyParallel:false only keeps tests within a file in order — separate
  // files still ran at once, collided on that account (PIN, lock state,
  // trackers), and read as product bugs. CLAUDE.md said "--workers=1"; the
  // config now says it, so `npm run e2e` cannot forget (2026-11-06).
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuse a dev server if one is already up; otherwise start one.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
