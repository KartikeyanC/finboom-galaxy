import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * The main suite, run against the production build (`vite preview`) instead of
 * the dev server: `npm run build && npm run e2e:preview`.
 *
 * Why it exists (2026-11-06): on this machine the dev server compiles each
 * page's modules on first request, and under the suite's load whole pages —
 * even /privacy — sat on "Loading" past the 30 s test timeout. Two full runs
 * failed 15 and 19 tests that way, most of them for nothing the app did. The
 * built bundle has nothing to compile, so a failure here is about the app.
 *
 * Same tests, same .env.e2e account (loaded by the base config on import).
 * The service worker is blocked so a cached shell can never answer for the
 * build under test; pwa.config.ts is the suite that exercises it.
 */
const PORT = Number(process.env.E2E_PREVIEW_PORT) || 4174;
const BASE = `http://localhost:${PORT}`;
// cross-browser.spec.ts launches its own browsers and reads this directly.
process.env.E2E_BASE_URL = BASE;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: BASE, serviceWorkers: "block" },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    // `dist` is at the repo root; Playwright resolves cwd against this file.
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: BASE,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
