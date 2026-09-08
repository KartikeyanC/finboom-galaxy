# FinRoot — QA Stage 1 · Phase 1: Project Understanding

> Audit only. No application code, schema, or config was modified during Stage 1 — only `qa/` was added.
> Date: 2026-09-07 · Commit: `2a4b0d3` (master, "Merge pull request #5 from KartikeyanC/docs/gate-counts")
> Repo: `KartikeyanC/finboom-galaxy` · working copy `F:\Movie\AK\FinRoot\_extracted`
> ⚠ The working tree had ~25 pre-existing uncommitted files (in-progress branding/logo rework) at
> audit time — the running app = `2a4b0d3` + that WIP. QA did not touch those files.

## 1. Architecture

| Layer | Technology |
|---|---|
| Build tool | Vite 5.4.21 |
| Frontend | React 18 + TypeScript, React Router v6 (`BrowserRouter`, `future` v7 flags) |
| UI | shadcn/ui (38 primitives in `src/components/ui`), Tailwind CSS, lucide-react icons, framer-motion |
| Data/state | TanStack Query v5 (`staleTime` 60s, `retry` 1, no refetch-on-focus) |
| Forms | Plain controlled components + `zod` (react-hook-form was removed 2026-08-18, BUG-065) |
| Backend | Supabase — Postgres + Auth + Edge Functions + Storage, RLS-enforced |
| Live project | `ludbntvhagefadfkhrjj` (`.supabase.co`), region Seoul. Anon key in `.env` / `.env.development` |
| Edge functions | `billing-api`, `live-price`, `payments-webhook`, `po-auth`, `scan-receipt`, `send-email` (last **not deployed** — was an open relay, BUG-005) |
| Payments | Paddle (sandbox token in `.env.development`) |
| Email | Resend (planned; `send-email` undeployed) |
| Hosting | Vercel/Netlify (frontend), Supabase (backend) |
| PWA | Service worker registers only under `import.meta.env.PROD` (vite-plugin-pwa) |
| Node | 20 (`.nvmrc`), npm (`package-lock.json`) |

### Multi-tenancy model
- Every finance table is tenant-scoped (`tenant_id`); access via `is_tenant_member(tenant_id, min_role)`.
- Roles: **owner > admin > viewer**.
- Permissions server-resolved: `get_effective_menus(tenant_id)` = `plan.menu_set ⊕ tenant.menu_overrides ⊕ member.menu_overrides`.
- Product Owner (PO) admin layer reads **aggregates only** via `SECURITY DEFINER` RPCs; never raw finance rows.
- Menu IDs canonical in `src/lib/accessMenus.ts` (17 ids).

## 2. Authentication / Authorization

- **User auth:** Supabase email+password and Google OAuth (`src/pages/Auth.tsx`), context `src/hooks/useAuth.tsx`.
- **Route guard:** `ProtectedRoute` wraps `/app/*`. Gate order: `loading` → onboarding wizard (`!onboarding.completed`) → `PinSetup` (choice unset / reset) → `LockScreen` (lock active & not unlocked) → children.
- **App Lock (Stage 5.4):** optional, device-local PIN (PBKDF2-SHA256, `finroot.*` localStorage keys). Curtain over the screen, **not** access control — RLS is. Password fallback after 12h / forgotten PIN.
- **Menu guard:** `<MenuGuard menuId>` per route; `transactions` is never menu-gated; `calendar` + `accounts` are always-allowed (navigation-only).
- **PO auth:** separate — `/po/login` → `po-auth` edge function (password + 16-digit platform secret). `PoShell` guards `/po/*`.
- **Known Stage-1 security gaps (from CLAUDE.md / BUG_TRACKER, pre-existing, not introduced here):** `po-auth` no rate limit/lockout (BUG-006/007); `payments-webhook` no ts window, `===` sig compare (BUG-008); PO sign-in unaudited (1.4); edge functions send `Access-Control-Allow-Origin: *` (1.7).

## 3. Main modules (routes)

Public: Landing `/`, Auth `/auth`, Privacy `/privacy`, Terms `/terms`, Support `/support`, Status `/status`, Accept-Invite `/invite/:token`, Reset-Password `/reset-password`, 404 `*`.

App (`/app/*`, protected): Dashboard, Income, Expenses, Investments, Budget, Goals, Calendar, Trackers, Accounts, Net Worth, Insurance, Trips, Workspace, Calculator, Import, Export, Bill Scan, Reminders, Billing, Settings, Profile, Notifications. Redirects: `/app/calculators`→calculator, `/app/budget-allocator`→budget, `/app/subscriptions`→expenses.

PO (`/po/*`): Dashboard, Tenants, Analytics, Plans, Pricing, Branding, Coupons, Status, Audit, Security, Login.

## 4. Data layer surface

- **Tables referenced by client** (`.from()`): accounts, budgets, debts, demat_accounts, demat_ledger, goals, insurance, investments, net_worth_entries, net_worth_snapshots, notifications, plans, profiles, recurring_items, recurring_reminders, reminders, site_settings, subscriptions, tenant_members, tenant_settings, tenants, tracked_subscriptions, trackers, transactions, trips.
- **RPCs referenced by client** (43): see `qa/API-INVENTORY.md`.
- **Legacy localStorage stores** still present (pending migration): accounts, trips, debts, reminders, net worth, investments (`src/lib/*Store.ts`). Device-local keys registered in `src/lib/deviceLocal.ts`.

## 5. Existing tests / tooling

| Kind | Location | Status (per CLAUDE.md, re-measured 2026-09-07) |
|---|---|---|
| Unit | Vitest, 57 files, `*.test.ts(x)` | 813 passing |
| Types | `tsc -p tsconfig.app.json --noEmit` | 0 errors |
| Lint | `eslint .` | 0 errors / 24 known warnings |
| E2E | Playwright, `e2e/*.spec.ts` (21 spec files) | run **serially** (`--workers=1`); baseline needs a fresh full run; standing failures = open UI/A11Y (BUG-093..097), `data-export`, `onboarding-wizard` (needs service key), `support-status` (fails while live status degraded) |
| PWA E2E | `e2e/pwa.config.ts` against `dist/` via `vite preview` | 5 passing, needs `npm run build` first |
| Test-account harness | `scripts/test-harness.mjs` | **multi-role suites unreachable** — autoconfirm off, no service-role key in repo; `provision` refuses |

Browser automation tool available for this audit: in-app Chromium (Claude Browser pane) driving the Vite dev server.

## 6. How it runs

| Concern | Value |
|---|---|
| Dev command | `npm run dev` (`vite`) |
| Build | `npm run build` (`vite build`) |
| Test | `npm run test` (`vitest run`) |
| E2E | `npm run e2e` |
| Dev URL (config) | `http://localhost:8080` (`.claude/launch.json`, `autoPort`) |
| **Actual dev URL this run** | `http://localhost:5188` (8080 busy, auto-picked) |
| Required env | `.env.development` present & valid (live project `ludbntvhagefadfkhrjj`, anon key, Paddle sandbox token) |
| DB requirement | Remote Supabase project reachable over the network |
| Auth requirement | A Supabase user. Seed demo user in `.env.e2e`: `demo@finroot.app` / `FinrootDemo!2026` / PIN `3210` (also a platform admin) |

## 7. What cannot be tested in Stage 1 (and why)

| Area | Reason |
|---|---|
| Multi-role authorization (owner/admin/viewer boundary, AUTHZ/SEC suites) | Harness accounts never provisioned (autoconfirm off, no service-role key). Only the single demo account is usable. |
| PO destructive actions (delete/purge/restore tenant, assign plan, set secret, create/delete coupon) | Demo account is a platform admin, but these mutate **shared live** platform data. Out of scope for a non-destructive audit. |
| Real Paddle checkout / webhook | Sandbox only; completing a purchase is an external side-effect. |
| `send-email` flows | Function deliberately not deployed. |
| Real inbound email / invite email delivery | Resend not wired; free-tier auth mailer rate-limited. |
| Google OAuth sign-in | Requires interactive Google account + consent; not a FinRoot-owned surface. |
| Account deletion end-to-end | `DeleteAccountCard` still routes by email; service-role edge step not built (documented). |
| PWA install / offline / service worker | Requires production build (`import.meta.env.PROD`); dev server does not register the SW. |
| Session expiration | Would require waiting out / tampering a JWT against the live project. |
