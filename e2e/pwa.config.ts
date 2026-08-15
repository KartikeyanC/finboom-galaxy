import { defineConfig, devices } from "@playwright/test";

/**
 * UI-T17 needs the PRODUCTION build, not the dev server.
 *
 * `main.tsx` registers the service worker only under `import.meta.env.PROD`, so
 * on `npm run dev` there is no service worker at all — every PWA assertion
 * would either fail for the wrong reason or pass vacuously. This config builds
 * nothing itself (run `npm run build` first) and serves `dist/` with
 * `vite preview`, which is the closest thing to production this repo has.
 *
 *   npm run build
 *   npx playwright test --config e2e/pwa.config.ts
 */
const PORT = 4173;

export default defineConfig({
  testDir: ".",
  testMatch: /pwa\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    screenshot: "only-on-failure",
    // The service worker is the subject here, so it must not be bypassed.
    serviceWorkers: "allow",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    // Playwright resolves `cwd` against the config file, which lives in e2e/ —
    // and `dist` is at the repo root, so without this `vite preview` reports
    // "did you build your project?" against a build that is sitting right there.
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
