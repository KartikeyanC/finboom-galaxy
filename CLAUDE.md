# CLAUDE.md — FinRoot (Finboom Galaxy)

Guidance for working in this repository. Read [docs/DESIGN.md](./docs/DESIGN.md) and [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) before backend work.

For humans, and for orientation generally, start at the [README](./README.md). Decisions and their
costs are in [docs/adr/](./docs/adr/); operational procedures are in [docs/runbooks/](./docs/runbooks/).

## What this is

A personal finance tracker evolved into a small **multi-tenant SaaS** with a Product Owner admin layer. Low traffic, few users, **cost-first** (free tiers). The backend build-out (Stages 0–4 of [docs/Improvement_Roadmap.md](./docs/Improvement_Roadmap.md)) is complete **except for five Stage 1 hardening items** — see "Current status" below; Stage 5 (commercial & compliance) is in progress.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + shadcn/ui + Tailwind, React Router, TanStack Query, react-hook-form + zod. **npm** for installs (`package-lock.json`); Node 20 (`.nvmrc`).
- **Backend:** Supabase (Postgres + Auth + Edge Functions + Storage). RLS-enforced.
- **Hosting:** Supabase (free→Pro), frontend on Vercel/Netlify (free), email via Resend (free), billing via Paddle.

## Commands

```bash
npm install            # deps
npm run dev            # vite dev server
npm run build          # production build
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run test           # vitest
npm run e2e            # playwright

# Stage 0.10 test-account harness. Run `doctor` FIRST — it answers in four
# lines whether the multi-role suites (AUTHZ/SEC/NOTIF/PO) are reachable at
# all. They are not, today: the project has autoconfirm off and this repo
# carries no service-role key, so `provision` refuses rather than creating six
# accounts that could neither sign in nor be deleted.
node scripts/test-harness.mjs doctor
SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/test-harness.mjs provision
node scripts/test-harness.mjs tokens

# Types come from the REMOTE project. Requires SUPABASE_ACCESS_TOKEN.
# `--local` needs Docker's engine running, not just the CLI — as of
# 2026-08-15 the Docker CLI (29.7.2) is present but `docker info` hangs,
# meaning Docker Desktop's engine isn't started. Confirm with the user
# before starting it (image pulls + local resource use); see
# docs/REMAINING_TESTS.md §14 OPS-006/007/014-017 for what a local stack
# would unblock, all safely, without touching the one live project.
supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
```

> The generated `types.ts` must be normalised after that command on Windows:
> PowerShell's `Out-File -Encoding utf8` writes a BOM and CRLFs. Strip both.

## Hard rules

- **Never edit existing migrations.** Add a new timestamped migration in `supabase/migrations/`.
- **Never hand-edit generated files:** `src/integrations/supabase/client.ts` and `src/integrations/supabase/types.ts` (regenerate with `supabase gen types`).
- **Security is server-side.** RLS is the real gate; UI checks are convenience only. Never trust the client for access control.
- **Product Owner reads aggregates only** — via SECURITY DEFINER RPCs. PO must never query raw finance rows.
- **No SMS. No new paid services** without explicit approval. Stay on free tiers.
- **YAGNI.** Build only what the current phase needs.

## Architecture conventions

- **Tenancy:** every finance table is tenant-scoped (`tenant_id`). Access via `is_tenant_member(tenant_id, min_role)`. Roles: owner > admin > viewer.
- **Permissions:** server-resolved via `get_effective_menus(tenant_id)` = `plan.menu_set ⊕ tenant.menu_overrides ⊕ member.menu_overrides`. Do **not** reintroduce localStorage permissions (the old `AccessContext`/`finroots.access.*` pattern is being removed).
- **Data layer:** new modules use a React Query hook hitting Supabase (model on `src/hooks/useTransactions.ts`, `useBudgets.ts`). The legacy `lib/*Store.ts` localStorage stores are being replaced — do not add new ones.
- **Mutations that matter** (PO actions, member changes, plan changes) go through RPCs that also write `audit_log`.
- **Menu IDs** are canonical in `src/lib/accessMenus.ts` — reuse them, don't invent new strings.

## Naming note (verified 2026-06-04)

Two different "subscriptions" concepts — do not conflate:
- **SaaS billing** = the existing DB `subscriptions` table (Paddle: `paddle_subscription_id`, `plan_name`, `current_period_end`, …), wired to `Billing.tsx` → `billing-api` + `payments-webhook`. Multi-tenancy **evolves this table** (add `tenant_id`, `plan_id`); do NOT create a parallel `tenant_subscriptions`.
- **Finance feature** = user-tracked subs (Netflix/Spotify) in `lib/subscriptionsStore.ts` (localStorage key `subscriptions.records.v1`, page `Subscriptions.tsx`). Migrates to a new tenant-scoped table named **`tracked_subscriptions`**.

## Layout

```
src/pages/            # route pages (+ per-page folders: landing/, legal/, po/, trips/, export/, workspace/)
src/components/<area>/ # feature components (accounts, budgets, goals, ...)
src/components/ui/     # shadcn primitives
src/hooks/            # data hooks (Supabase-backed)
src/contexts/         # AccessContext (being server-backed), ThemeContext
src/lib/              # helpers; legacy *Store.ts (localStorage) being migrated out
src/integrations/supabase/  # GENERATED — do not edit
supabase/migrations/  # append-only
supabase/functions/   # edge functions (billing-api, live-price, payments-webhook, + po-auth)
docs/                 # DESIGN.md, IMPLEMENTATION_PLAN.md, Improvement_Roadmap.md (the live tracker)
docs/REMAINING_TESTS.md  # the test-execution tracker — tickable, one line per case
docs/adr/             # architecture decision records — why, and what it cost
docs/runbooks/        # migrate, deploy, delete/restore a workspace, erase an account, rotate keys
e2e/                  # Playwright: finroot, tap-targets, legal, data-export, onboarding,
                      #            app-lock, lock-suite, ui-a11y, cross-browser, plan-locks,
                      #            support-status, po-analytics, harness-smoke
                      #            (+ auth.ts and rest.ts helpers)
                      # pwa.spec.ts runs under its OWN config (pwa.config.ts) against
                      #            `dist/` via vite preview — see Commands above
                      # rest.ts is the raw PostgREST client the SEC suite needs: it
                      #            carries a role JWT and returns refusals as STATUS
                      #            CODES, never exceptions — a throwing client would
                      #            make every negative security test pass by accident
```

**File size:** no hand-written source file exceeds 30 kB (Stage 4.13). If one is heading that way,
split it — and prefer extracting the *pure* part (mappers, arithmetic, parsing), which is usually
where the tests you cannot currently write are hiding.

## Current status (2026-08-12)

🔴 **"Stages 0–4 are complete" was wrong, and this file said it — corrected 2026-08-12.** Stage 1
has real gaps, found by reading the code rather than the tracker: **1.2** `po-auth` has no rate
limit, no lockout and non-uniform responses (BUG-006/007 — a 16-digit secret that grants platform
admin is brute-forceable); **1.3** `payments-webhook` has no `ts` freshness window, no
`processed_webhooks` table and compares signatures with `===` (BUG-008); **1.4** no PO sign-in is
audited; **1.7** all five edge functions still send `Access-Control-Allow-Origin: *`; **1.1**
`send-email` is unrebuilt and safe only because it is not deployed; **1.10**, the SEC-T negative suite
that would have caught all of this, was never written. Stages 2–4 were spot-checked and hold up. Full evidence in [docs/BUG_TRACKER.md](./docs/BUG_TRACKER.md#reconciliation--2026-08-12).

**Stages 0, 2, 3 and 4 are complete.** 64 migrations written for Supabase project `ludbntvhagefadfkhrjj`,
all applied as of 2026-08-15 — see "Pending migrations" below for the four that landed that day;
32 tables, all finance tables tenant-scoped with RLS; 5 edge functions (`send-email` is deliberately
NOT deployed — it was an authenticated open relay, BUG-005). Gates: `tsc` 0 · eslint 0 errors /
27 known warnings · vitest **597 passing** · Playwright **`--workers=1`, with 7 known failures**.
Those 7 are the open UI/A11Y findings (BUG-093 … 097), not flakes — see
[docs/REMAINING_TESTS.md](./docs/REMAINING_TESTS.md) §2.

**The PWA suite is separate and needs the production build**, because the service worker registers
only under `import.meta.env.PROD`:

```bash
npm run build && npx playwright test --config e2e/pwa.config.ts   # UI-T17, 5 passing
```

🔴 **Run Playwright serially.** `fullyParallel: false` is set but no worker count is, so separate
spec *files* still run at once — and they all sign in as the same demo account. A parallel run
fails on contention, which reads as a product bug and is not one.

🔴 **The theme is `finroot.theme` in localStorage** (five presets, default `obsidian`), read by
`ThemeContext` — **not** `prefers-color-scheme`. `emulateMedia({colorScheme})` changes nothing, so
any "check both themes" that uses it silently checks one theme twice. `applyTheme()` in
`e2e/ui-a11y.spec.ts` does it correctly. The landing preloader is also worth knowing about: it
covers the viewport, hit-testable, for ~2.8 s, so anything that measures or clicks on `/` must wait
it out (`settle()`, same file).

A few `lib/*Store.ts` localStorage stores remain (accounts, trips, debts, reminders, net worth,
investments) and are still pending migration to tenant-scoped tables. Genuinely device-local keys
are registered in `src/lib/deviceLocal.ts` — **a new localStorage key must be registered there or
its guard test fails**, which is the point.

**Stage 5 (commercial) is where new work goes.** Open at the time of writing: account deletion
(the request queue migration is pending) and cost alerting (5.9). Data export (5.2), first-run
onboarding (5.3), the app-lock rework (5.4), the plan-lock upsell (5.5), the documentation set
(5.6), the support channel + status page (5.7) and product analytics (5.8) have shipped.

Analytics (5.8) is **derived, never tracked** — there is no analytics script, no events table and
no tracking cookie, and the privacy policy says so where a customer reads it first. Every figure on
`/po/analytics` comes from `created_at` on records already stored. `analytics.test.ts` fails if a
vendor snippet appears in `src/`, `index.html` or `package.json`; see
[ADR-0009](./docs/adr/0009-analytics-without-tracking.md) before adding one. The PO functions
return **counts and timestamps only** — never an amount, description or category.

🔴 **Never write `const rpc = supabase.rpc`.** That detaches the method from its client and every
call dies with *"Cannot read properties of undefined (reading 'rest')"* — in 5.2 it produced a
well-formed, completely empty data export, and in 5.1 it killed sign-up after the account was
created. Use `supabase.rpc.bind(supabase)` when a call has to be widened past the generated types.

Contact details live in **one** place, `src/lib/support.ts` — a test fails when a second address
appears in `src/`. The public `/support` and `/status` routes are sessionless on purpose: the person
who cannot sign in is the one who needs them.

Plan locks (5.5): `lib/menuUpsell.ts` decides *why* a menu is unavailable by comparing
`get_effective_menus()` with the plan's `menu_set`. Only a **plan** lock may show an upgrade; a
menu the owner switched off must never advertise one. Anything uncertain resolves to `unknown` and
renders nothing — never a paywall aimed at someone who has already paid.

The app lock is **optional** since 5.4: `lockChoice()` decides the gate, hiding the tab starts a
grace clock (`shouldLockOnReturn()`), and a forgotten PIN is reset with the account password. It is
a curtain over the screen, not access control — RLS is. Say so in any UI that mentions it.

🔴 **`SIGNED_IN` does not mean somebody signed in.** `supabase-js` fires it from
`_recoverAndRefresh()` on every page load that restores a stored session, so for months the lock
screen fell to F5 and a second tab never asked (BUG-090, found by the LOCK suite 2026-08-12). The
event carries nothing that separates the two cases, so the sign-in declares itself:
`markSignInIntent()` writes a per-tab marker immediately before **any** call that asks for a
credential, and `useAuth` unlocks only when `consumeSignInIntent()` returns true. **Add that call
to any new sign-in path you write** — `Auth.tsx` (sign-in, sign-up, Google), `PoLogin.tsx`
(password, secret) — and clear it on failure. `ResetPassword.tsx` is the exception: it arrives as
`USER_UPDATED`, so it unlocks directly rather than leaving a marker to be spent by a later restore.

Related, same family: every read in `appLock.ts` catches and returns the harmless answer, but for
`isUnlocked()` the harmless-looking answer is `true`, which turned a blocked store into an open
door (BUG-092). It returns `false` now. Keep it that way.

The PIN is stored as a **versioned record** — `{v:2, salt, iter, hash}`, PBKDF2-SHA256 — never a
bare digest (BUG-091). `verifyPin()` still accepts the old unsalted v1 hex once and re-hashes it in
place, so nobody with a PIN already on their device is locked out; it also re-hashes anything below
the current `PIN_ITERATIONS`, so raising that number later needs no migration. ⚠️ **Do not describe
the PIN as secure.** 4–6 digits is 13–20 bits: the KDF made each guess cost 151 ms instead of
nothing, but a commodity GPU still walks the 6-digit space in ~33 seconds. The mitigations that
matter are the 6-digit default and the "don't reuse these digits" line in `PinSetup` — keep both.

Onboarding state is an `onboarding` key in `tenant_settings` — no migration. Its rule is worth
keeping: the checklist counts real rows rather than storing "the user did X", and sample rows are
excluded from those counts by recorded id. If you add to the sample workspace, keep it anchored to
the calendar month (`src/lib/onboarding.ts`) — "days ago" put the salary in the wrong month.

### Pending migrations — none, as of 2026-08-15

All four were applied in one `supabase db push` on 2026-08-15, once a `SUPABASE_ACCESS_TOKEN` was
available for the first time. Types were regenerated the same session (`supabase gen types` via
Bash, not PowerShell's `Out-File`, to avoid the BOM/CRLF problem below) and every temporary `rpc`
cast that existed only because a function wasn't in the generated types yet
(`legalAcceptance.ts`, `usePoAnalytics.ts`) was deleted and replaced with a direct, typed
`supabase.rpc(...)` call.

- `20260811120000_stage5_legal_acceptance.sql` — `profiles.legal_version` / `legal_accepted_at` and
  `record_legal_acceptance()`. Sign-up now records acceptance instead of logging a console warning.
- `20260811130000_stage5_account_deletion.sql` — the account-deletion request queue and
  `request_account_deletion()` (Stage 5.2). **The schema exists now, but `DeleteAccountCard.tsx`
  still hasn't been rewired to call it** — it deliberately still routes deletion by email, because
  wiring a real self-service button also needs a `service_role` edge-function step (deleting the
  auth user, draining uploaded files) that applying this migration alone does not provide. See
  [docs/runbooks/account-deletion.md](./docs/runbooks/account-deletion.md). That rewiring is
  separate, not-yet-started work.
- `20260812120000_stage5_analytics.sql` — `po_tenant_engagement()` and `po_tenant_activity_months()`
  (Stage 5.8). `/po/analytics` now shows real activation/retention figures instead of the
  migration-missing message; `usePoAnalytics.ts` keeps its `isMissingFunction()` fallback as a
  defensive check (a restored/older database shouldn't crash the page), not because it's needed
  today.
- `20260815060000_po_set_plan_paddle_price_id.sql` — `po_set_plan_paddle_price_id()`, added the same
  day to unblock PO-018 (coupons). `/po/plans` now has a "Paddle price id" field per plan; setting
  one on a paid plan (`price_cents > 0`) is what `usePaymentsGateway()`/`upgradeable_plans()` needs
  to consider that plan purchasable. Leave Roots's blank.

> Regenerating `types.ts` on Windows: PowerShell's `Out-File -Encoding utf8` writes a BOM and CRLFs.
> Redirect with Bash (`> src/integrations/supabase/types.ts`) instead, or strip both afterward.
