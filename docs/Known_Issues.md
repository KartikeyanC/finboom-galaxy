# Known Issues

> Consolidated defect register from the Phase 1 audit (2026-08-04). Every entry was verified
> against source or measured on a running build. Cross-references point to the detailed report.
> Live triage happens in [BUG_TRACKER.md](./BUG_TRACKER.md).

**Legend** — Sev: **C**ritical · **H**igh · **M**edium · **L**ow.
Status: `OPEN` (all entries — no fixes have been applied in Phase 1).

---

## Blockers — must be closed before paying subscribers

### KI-001 · Multi-tenancy is not enforced end-to-end — **C**
*Refs: DB-001, AZ-006, UX-030*

`tenant_id` is set by the DB default `current_tenant_id()` (the user's **first** membership by
`created_at`) and **no client code ever reads, writes or filters it**. Verified: a repo-wide
grep for `tenant_id` in `src/` returns only `TenantContext`, RPC parameters and the generated
types file — zero occurrences in any data hook or store.

Consequences for any user in more than one workspace:
- every write lands in their *own first* workspace regardless of the UI context;
- every read (`SELECT *` with no `tenant_id` filter) returns rows from **all** their workspaces
  merged together;
- every dashboard total, budget figure and net-worth number is computed across the union.

This is a correctness failure, not a cross-account leak — RLS still prevents reading a workspace
you are not a member of.

**Fix:** thread `currentTenantId` from `TenantContext` into every insert and every select; add
`WITH CHECK` that the supplied `tenant_id` is one the caller may write. Keep the default as a
backstop only. Then add the workspace switcher.

### KI-002 · Any workspace owner can grant themselves a paid plan — **C**
*Refs: SEC-001, DB-002, AR-001*

The `sub_update` RLS policy plus the never-revoked `GRANT UPDATE ... TO authenticated` lets an
owner `PATCH` their own `subscriptions` row to any `plan_id` (`plans` is world-readable).
Complete revenue bypass, exploitable from the browser console, leaving no audit trace.

**Fix:** `DROP POLICY sub_update` + `REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM authenticated`.

### KI-003 · Privileged functions executable by every user — **H**
*Refs: SEC-014, DB-003*

Postgres' default `EXECUTE TO PUBLIC` was never revoked on `log_audit()`,
`create_notification()`, `expire_subscriptions()` and `notify_expiring_subscriptions()`.
Any signed-up user can **forge audit-log entries** and **push arbitrary in-app notifications to
any user**. The audit trail is therefore not evidence.

### KI-004 · `send-email` is an authenticated open mail relay — **H**
*Ref: SEC-009*

Arbitrary `to` / `subject` / `html` from any signed-in caller, delivered from your Resend
domain with your SPF/DKIM alignment.

### KI-005 · No rate limiting anywhere — **H**
*Refs: SEC-011, AR-004, AR-008*

Unlimited PO 16-digit-secret guesses (each running a bcrypt), unlimited
`resetPasswordForEmail` triggers via the public `po-auth` function, unlimited unauthenticated
`live-price` proxying.

### KI-006 · Paddle webhook is replayable — **H**
*Refs: SEC-012, AR-005*

The signature's `ts` is parsed but never checked for freshness, there is no event-id
de-duplication, and the HMAC comparison (`hex === h1`) is not constant-time.

### KI-007 · No backups — **H**
*Ref: [Disaster_Recovery.md](./Disaster_Recovery.md)*

Supabase free tier has no PITR and none is configured. A bad migration, an accidental
`po_delete_tenant`, or a `DROP` loses all customer financial data permanently.

### KI-008 · No error monitoring and no error boundary — **H**
*Refs: A09, UI-011, PERF-012*

No Sentry/APM, no uptime check, no auth-event logging, and no React error boundary — a render
throw blanks the app silently and nobody is notified.

### KI-009 · `xlsx@0.18.5` prototype pollution on a user-upload path — **H**
*Ref: [Project_Dependencies.md](./Project_Dependencies.md) §3*

`npm audit --omit=dev` reports 9 high / 1 moderate. `xlsx` is the only one on an untrusted-input
path (`importParsers.ts` parses user spreadsheets) and **has no fix available on npm**.

---

## Functional defects

### KI-010 · "Other" trip type violates a DB constraint — **H**
*Ref: DB-004*
`TripKind` in `src/lib/tripsStore.ts:8` includes `"other"`; `trips.kind` CHECK allows only
`solo|friends|family`. Creating an "Other" trip fails with a raw constraint error.

### KI-011 · Net-worth history is fabricated — **H**
*Ref: UX-022*
`netWorthStore.seedHistory` generates six months of synthetic history; the 3M/6M/All filter runs
on it. There is no `net_worth_snapshots` table. Users are shown an invented wealth trajectory.

### KI-012 · Hardcoded "April 2026" in the app top bar — **H**
`src/components/DashboardLayout.tsx:135`. A static string presented as the current period.

### KI-013 · Landing pricing does not match the billing catalogue — **H**
*Ref: UX-001*
Landing sells Roots/Canopy/Heritage at ₹0/₹299/₹899; `plans` contains Free/Pro at $0/$9.

### KI-014 · Coupons are never applied — **H**
*Ref: BR-020*
The PO can create codes and they render in the banner, but no code path passes a discount to
Paddle checkout.

### KI-015 · Workspace suspension has no effect — **H**
*Ref: BR-058*
`po_set_tenant_status` sets `tenants.status='suspended'` and notifies members, but **no RLS
policy or RPC checks `tenants.status`**. A suspended workspace continues to work normally.

### KI-016 · Import is append-only with no de-duplication — **H**
*Ref: UX-039*
Re-running the same CSV silently doubles every row. The non-functional "Write mode" control was
removed and nothing replaced it.

### KI-017 · "Remember me" is dead code — **M**
*Ref: UX-007*
`useAuth` gates on `localStorage["finroot.session_only"]`, which nothing ever writes. The
sign-up checkbox only saves the email.

### KI-018 · `billing-api` resolves by `user_id`, not `tenant_id` — **H**
*Ref: AR-010*
A user owning two workspaces can view and cancel the wrong subscription.

### KI-019 · `budgets.spent` is client-authored, not derived — **H**
*Ref: UX-018*
Budget utilisation does not follow logged expenses unless a code path happens to write it.

### KI-020 · No transfer transaction type — **H**
*Ref: UX-014*
Account-to-account movement must be entered as expense + income, distorting income totals,
spending charts, savings rate and budgets.

### KI-021 · Portfolio list defaults to a "today" filter — **M**
*Ref: UX-025*
`MatrixFilter` filters by `savedAt`, so users with older holdings see an empty portfolio.

### KI-022 · `live-price` is not deployed to the dev project — **M**
Investments logs CORS errors and silently falls back to stored values with no user-visible
explanation.

### KI-023 · Monthly date bumping rolls over — **M**
*Ref: BR-035*
`bumpDate()` uses JS `setMonth`, so a recurring item due on the 31st advances 31 Jan → 3 Mar.

### KI-024 · Deleting an account orphans its transaction tags — **M**
*Ref: UX-016*
The account id lives in the description text with no FK; the live balance simply stops
computing, with no warning at delete time.

### KI-025 · Concurrent goal contributions lose updates — **M**
*Ref: UX-020*
`current_amount` is read-modify-write from the client with no optimistic-concurrency guard.

---

## Data durability — features that are silently device-local

### KI-026 · Six user-visible features live only in `localStorage` — **H**
*Ref: UX-043*

| Feature | Key |
|---|---|
| Recurring reminder settings (enabled, days-before, note) | `finroot.recurring.reminders.v1` |
| Custom expense categories | `expense.custom-categories` |
| Custom subcategories | `expense.custom-subcategories.v1` |
| Account balance history | `finroot.balance_history.<userId>` |
| Budget Planner inputs | `BudgetPlanner` STORE_KEY |
| Base currency, dashboard layout, balance-hidden toggle | various `finroot.*` |

Nothing in the UI distinguishes these from synced data. They are lost on browser change and
invisible to collaborators.

### KI-027 · `account_balance_history` table exists but is unused — **L**
*Ref: DB-010*
Migration `20260701120000` creates a correct, RLS-protected table; the hook writes to
`localStorage` instead.

---

## Code health

### KI-028 · `tsc` fails with 10 errors while `vite build` passes — **H**
Verified 2026-08-04: `npx tsc -p tsconfig.app.json --noEmit` → **exit 2**.

| File | Errors | Cause |
|---|---|---|
| `src/lib/importParsers.ts` (244, 273, 294, 313) | 4 | TS2677 — type predicates on `crypto.randomUUID()` template-literal ids |
| `src/pages/po/PoSecurity.tsx` (194, 215, 559, 562 ×2, 569) | 6 | 4 RPCs + 2 columns missing from `types.ts` |

`@vitejs/plugin-react-swc` does not type-check, so the build is green regardless. Type errors
can and do reach production.

### KI-029 · Generated types are four migrations stale — **H**
*Ref: DB-012*
`types.ts` lacks `income_streams`, `demat_accounts`, `demat_ledger`,
`account_balance_history` and the `po_has_secret`/`po_revoke_secret`/`po_get_identifiers`/
`po_set_identifiers` signatures. `useIncomeStreams` works around this with
`supabase as unknown as SupabaseClient`, disabling type safety on that table entirely.

### KI-030 · TypeScript strictness is off — **H**
`tsconfig.app.json`: `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`.
For a financial application this removes the compiler's ability to catch the null/undefined
arithmetic that produces wrong money figures.

### KI-031 · ESLint fails — **M**
Verified: `npx eslint .` → **exit 1**, 38 problems (11 errors, 27 warnings). Errors are
`no-explicit-any` in `Export.tsx` ×3 and the edge functions ×3, `no-unused-expressions` in
`Export.tsx:172`, and `no-require-imports` in `tailwind.config.ts:138`. Warnings are
`react-hooks/exhaustive-deps` across the `lib/*Store.ts` files.
Lint is not part of the build and there is no CI, so this never blocks anything.

### KI-032 · Test coverage is ~2 % — **H**
4 test files / 30 tests, all passing, covering `lib/finance.ts`, `lib/importParsers.ts` and
`lib/remindersStore.ts` only. Zero component tests, zero hook tests, zero RLS/authorization
tests, zero edge-function tests. 12 Playwright e2e tests cover 5 public + 7 authenticated smoke
paths.

### KI-033 · No CI/CD — **H**
No `.github/`, no pipeline, no Dockerfile. Type-check, lint, tests, audit and deploy are all
manual and therefore skippable.

### KI-034 · Three lockfiles — **M**
`package-lock.json`, `bun.lock`, `bun.lockb`. `CLAUDE.md` and `.claude/launch.json` say `bun`;
actual use is `npm`. Install determinism is ambiguous.

### KI-035 · `CLAUDE.md` is materially out of date — **M**
It states *"Backend is at Phase 0/1 … Everything else is still localStorage and pending
migration."* All seven phases are complete and 32 migrations exist. It also documents `bun`
commands that are not what the project uses, and `supabase gen types --local` which requires
Docker that is not available here.

### KI-036 · `README.md` is a placeholder — **L**
Two lines: *"Welcome to your Lovable project / TODO: Document your project here."*

### KI-037 · Nine source files exceed 30 kB — **M**
*Ref: UI-016*

### KI-038 · Dead code and unused dependencies — **L**
`PermissionsCenter.tsx` (21 kB) is imported nowhere since Settings was consolidated;
`FeatureShowcase.tsx` (13 kB) is unused since the COSMOQ landing rewrite;
`next-themes` and ~9 shadcn primitives are installed but never imported.

---

## Configuration & operations

### KI-039 · `supabase/config.toml` points at the live project — **M**
*Ref: SEC-018*
`project_id = "tsmdnfywxsjsjqjszoek"`. Any `supabase db push` or `functions deploy` without an
explicit `--project-ref` targets **production**.

### KI-040 · `.env*` files are not gitignored — **L**
*Ref: SEC-017*
`.gitignore` covers `.env.e2e` and `*.local` only. Current contents are public-by-design values,
but the pattern will leak the first real secret added. `.env.e2e` holds live test credentials
on disk.

### KI-041 · No security headers and no hosting config — **M**
*Ref: SEC-016*
No CSP, HSTS, `frame-ancestors`, `nosniff` or `Referrer-Policy`; no `vercel.json`,
`netlify.toml` or `_headers` file exists in the repo.

### KI-042 · Scheduled jobs were written but never scheduled — **M**
`expire_subscriptions()` and `notify_expiring_subscriptions()` exist with no pg_cron entry.
Expiry is evaluated lazily, so stored status drifts from effective status.

### KI-043 · Live project migration state is untracked — **H (operational)**
All 32 migrations are confirmed applied to **dev** (`hkfwuxqeexamyphcgkxr`). Nothing in this
repo records what has been applied to **live** (`tsmdnfywxsjsjqjszoek`, a Lovable-managed
project in a different account). The two schemas may have diverged arbitrarily.

---

## Frontend defects (measured)

| ID | Issue | Sev | Ref |
|---|---|---|---|
| KI-044 | 36 px horizontal overflow when the landing page is resized to mobile (375 and 390 px); the e2e test sets the viewport before navigation and so misses it | H | UI-001 |
| KI-045 | `#5f6764` body text at 11 px = **3.42:1** contrast, used ~100× — fails WCAG AA | H | UI-002 |
| KI-046 | Hero `h1` reads "The calm **commandcenter** for your money" to screen readers and to copy/paste | M | UI-005 |
| KI-047 | Hero `h1` computed `opacity: 0` until framer-motion runs — invisible without JS | M | UI-006 |
| KI-048 | No `<main>` landmark, no skip link | M | UI-008 |
| KI-049 | 21 of 42 landing interactive elements below the 44 px tap target | M | UI-004 |
| KI-050 | 121 text nodes below 12 px on the landing page | M | UI-003 |
| KI-051 | Preloader overlay still mounted after load — verify it is inert | L | UI-007 |
| KI-052 | Global Cmd/Ctrl+N hijack | M | UI-013 |
| KI-053 | Realtime toasts fire on the user's own inserts — duplicate toasts, 200 on a 200-row import | L | PERF-008 |
| KI-054 | Raw Postgres errors shown to users | H | UI-012 |
| KI-055 | Three of five themes unreachable from the UI | L | UI-014 |
| KI-056 | React Router v7 future-flag warnings | L | UI-009 |

---

## Summary

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 30 |
| Medium | 19 |
| Low | 9 |
| **Total** | **56** |
