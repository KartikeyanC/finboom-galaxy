# Project Dependencies

> Audit date 2026-08-04. `npm audit --omit=dev` run against the committed lockfile.

---

## 1. Toolchain

| Item | Version | Note |
|---|---|---|
| Node | v24 (local) | not pinned — no `.nvmrc`, no `engines` field |
| Package manager | **ambiguous** | `package-lock.json`, `bun.lock` **and** `bun.lockb` all committed. `CLAUDE.md` and `.claude/launch.json` say `bun`; the working setup uses `npm`. |
| Bundler | Vite 5.4.19 + `@vitejs/plugin-react-swc` | SWC does **not** type-check — `vite build` passes while `tsc` fails |
| TypeScript | 5.8.3 | `strict: false`, `noImplicitAny: false`, `strictNullChecks: false` |
| Test | Vitest 3.2.4 (jsdom) + Testing Library | 4 test files, 30 tests |
| E2E | Playwright 1.57 | 12 tests, dedicated `e2e/playwright.config.ts` |
| Lint | ESLint 9 + typescript-eslint 8 | `@typescript-eslint/no-unused-vars: off` |
| CSS | Tailwind 3.4.17 + `tailwindcss-animate` + `@tailwindcss/typography` | |

## 2. Runtime dependencies (52)

### Core framework
`react` 18.3.1 · `react-dom` 18.3.1 · `react-router-dom` 6.30.1 · `@tanstack/react-query` 5.83

### Backend client
`@supabase/supabase-js` 2.106.1 — the only backend SDK.
`@lovable.dev/cloud-auth-js` 1.1.2 — **sits in the Google OAuth path**; brokers the token
exchange before `supabase.auth.setSession`. A third-party dependency inside authentication.

### UI (25 Radix packages + shadcn)
`@radix-ui/react-*` ×25 · `class-variance-authority` · `clsx` · `tailwind-merge` ·
`lucide-react` 0.462 · `cmdk` · `vaul` · `sonner` · `next-themes` · `input-otp` ·
`embla-carousel-react` · `react-resizable-panels` · `react-day-picker` 8.10

### Data / visualisation
`recharts` 2.15.4 — every chart; ~400 kB of the main bundle
`framer-motion` 12.38 — landing animations + several app transitions
`date-fns` 3.6

### Forms & validation
`react-hook-form` 7.61 · `@hookform/resolvers` 3.10 · `zod` 3.25
**Note:** zod is used only in `pages/Auth.tsx`. No API response, RPC argument or import row is
zod-validated.

### File handling
`papaparse` 5.5.3 (CSV) · `xlsx` 0.18.5 (SheetJS) · `pdfjs-dist` 5.7.284 (lazy-loaded)

## 3. Vulnerabilities — `npm audit --omit=dev`

**10 vulnerabilities: 9 high, 1 moderate.**

| Package | Sev | Advisory | Reachable? | Fix |
|---|---|---|---|---|
| **`xlsx` 0.18.5** | High | GHSA-4r6h-8v6p-xvw6 prototype pollution · GHSA-5pgg-2g8v-p4x9 ReDoS | **Yes — directly.** `lib/importParsers.ts` parses user-uploaded `.xlsx` on the Import page | **No fix on npm.** SheetJS publishes ≥0.20 only from `cdn.sheetjs.com` |
| `postcss` | High | XSS via unescaped `</style>`; arbitrary file read + path traversal via `sourceMappingURL` (×3) | build-time only | `npm audit fix` |
| `minimatch` 9.0.0–9.0.6 | High | ReDoS ×3 | transitive (`glob`) | `npm audit fix` |
| `lodash` | High | transitive | build/test only | `npm audit fix` |
| `yaml` 2.0.0–2.8.2 | Moderate | stack overflow on deeply nested collections | build-time | `npm audit fix` |

### `xlsx` is the one that matters
It is the only high-severity issue on a **user-input path**. Options, in order of preference:

1. **Drop it.** CSV already covers every documented import template; `papaparse` handles CSV.
   Make `.xlsx` a "convert to CSV first" instruction.
2. **Replace** with `exceljs` (maintained, on npm).
3. **Pin the CDN build** — `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` —
   which fixes the CVEs but adds a non-registry install source.
4. **Sandbox** — parse inside a Web Worker with `Object.freeze(Object.prototype)`.

Also note the bundling defect: `Export.tsx` `import()`s `xlsx` dynamically, but
`importParsers.ts` imports it **statically**, so Rollup keeps it in the main chunk. Fixing the
static import both shrinks the bundle and reduces the attack surface for users who never import.

## 4. Third-party services

| Service | Used for | Failure mode | Secret |
|---|---|---|---|
| **Supabase** | DB, auth, edge, realtime | total outage = total outage | anon key (public), service role (server) |
| **Paddle** | checkout, subscription lifecycle, invoices | webhook down → plan changes silently unapplied; no retry/reconciliation job | `PADDLE_*_API_KEY`, `PAYMENTS_*_WEBHOOK_SECRET`, client token |
| **Resend** | transactional email | no-ops when unconfigured (**current state**) | `RESEND_API_KEY` |
| **Yahoo Finance** | equity/crypto quotes | unofficial, undocumented, may block; returns `{price:null}` | none |
| **mfapi.in** | Indian MF NAV | community API, no SLA | none |
| **Google Fonts** | DM Serif, Fira Sans, IBM Plex Sans | render-blocking `<link>`, no SRI, no self-hosting | none |
| **Lovable Cloud** | Google OAuth broker | auth path dependency | managed by SDK |

**Unofficial-API risk:** two of the seven are community/undocumented endpoints (Yahoo chart API,
mfapi.in) powering a user-visible "live price" feature. Neither offers an SLA. There is no
caching layer, so an outage is immediate and total for the Investments page.

## 5. Dependency health

| Check | Result |
|---|---|
| Lockfile committed | ⚠️ **three** lockfiles — install determinism is ambiguous |
| Node version pinned | ❌ no `.nvmrc`, no `engines` |
| Automated updates | ❌ no Dependabot/Renovate |
| Audit in CI | ❌ no CI at all |
| License compliance | not reviewed — all direct deps are MIT/Apache-2.0 by inspection |
| Unused deps | `next-themes` (a bespoke `ThemeContext` is used instead); `embla-carousel-react`, `react-resizable-panels`, `input-otp`, `@radix-ui/react-menubar`, `-navigation-menu`, `-context-menu`, `-aspect-ratio`, `-hover-card` ship shadcn primitives that no feature imports |
| `caniuse-lite` | 14 months stale — browserslist targets are wrong |
| Bundle cost of top deps | `recharts` ~400 kB · `framer-motion` ~120 kB · `xlsx` ~430 kB · 25 Radix packages ~200 kB — all in the single 2.56 MB main chunk |

## 6. Recommendations

1. **Pick one package manager**, delete the other two lockfiles, add `.nvmrc` + `engines`.
2. **Resolve `xlsx`** (option 1 or 2 above) — highest-value dependency action.
3. Run `npm audit fix` for postcss/minimatch/lodash/yaml.
4. Fix the static `xlsx` import in `importParsers.ts` so the dynamic import in `Export.tsx`
   actually splits.
5. Add Renovate or Dependabot plus `npm audit --audit-level=high` to CI once CI exists.
6. Remove the ~9 unused shadcn primitives and `next-themes`.
7. Self-host the three fonts (removes a render-blocking third-party request and a CSP exception).
8. Decide on `@lovable.dev/cloud-auth-js`: either document it as an accepted auth dependency or
   migrate Google sign-in to `supabase.auth.signInWithOAuth`.
9. `npx update-browserslist-db@latest`.
