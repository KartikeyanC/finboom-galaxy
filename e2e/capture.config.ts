import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Captures the REAL app screens shown on the marketing pages.
 *
 * Not a test suite: it signs in with the account in `.env.e2e`, opens a few
 * screens and saves desktop + mobile images to `public/landing/screens/`
 * (served at `/landing/screens/*`). It has its own config, like `pwa.config.ts`,
 * so `npm run e2e` never runs it by accident.
 *
 *   npm run capture:screens
 *
 * Use an account holding sample data only — the images are public.
 */
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.e2e"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
} catch {
  /* no .env.e2e — the capture skips itself */
}

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5188";

export default defineConfig({
  testDir: ".",
  testMatch: /capture-screens\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
