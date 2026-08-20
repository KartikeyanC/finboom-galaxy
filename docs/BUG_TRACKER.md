# Bug Tracker

> Defect register. Bugs found during **Phase 1 code audit** are pre-loaded below with
> `Status: OPEN` — they were found by inspection and measurement, not by executing a test case.
> Bugs found during Phase 2 test execution are appended in the same format with their
> originating case id.
>
> Full context for each entry: [Known_Issues.md](./Known_Issues.md).

---

## Reconciliation — 2026-08-12

> **This file is an audit snapshot, not the live tracker.** The register below records what the
> Phase 1 audit found, in the state it found it; [Improvement_Roadmap.md](./Improvement_Roadmap.md)
> is where work is tracked. The register was never updated as stages 1–5 closed things, so its
> `OPEN` markers had drifted badly and its Summary still said "Fixed 0".
>
> Every line in this section was **checked against the repository today**, not recalled. Where a
> claim could not be settled by reading code or migrations it says so rather than guessing.

**Now fixed** — the register's `OPEN` is stale for these:

| Bug | Verified by |
|---|---|
| BUG-003, BUG-004 | `REVOKE EXECUTE` on `log_audit` / `create_notification` in `20260804120000_stage1a_security_hardening.sql` |
| BUG-009 | `trips_kind_check` accepts `'other'` (same migration) |
| BUG-011 | the literal "April 2026" appears nowhere in `src/` |
| BUG-013 | `src/components/ErrorBoundary.tsx` with unit tests |
| BUG-014 | `npm run typecheck` exits 0 |
| BUG-015 | `types.ts` carries `income_streams` and `demat_accounts` |
| BUG-020 | `20260806190000_stage3_invitations.sql` — pending invitations exist |
| BUG-022 | `/app/export` is wrapped in `MenuGuard` (`App.tsx`). ⚠️ It borrows `menuId="import"`; there is still no `export` menu id, so the gate is a proxy rather than its own contract |
| BUG-027 | **fixed 2026-08-12** — `MatrixFilter` opens on `all` when the caller asks; the portfolio does, because its date is `savedAt` |
| BUG-028 | `e2e/finroot.spec.ts` asserts no landing overflow at 375/390 px, after a post-load resize, and across a carousel cycle |
| BUG-029 | `#5f6764` appears nowhere in `src/` |
| BUG-033 | `supabase/config.toml` names `ludbntvhagefadfkhrjj`, which is now the only project that exists |
| BUG-035 | sign-up carries a real "remember me" that saves the profile |
| BUG-086 | **fixed 2026-08-12** — `scripts/storage-purge.mjs` drains the queue via the Storage API; see [the runbook](./runbooks/workspace-deletion-and-restore.md) |
| BUG-087 | **fixed 2026-08-12** — `daysUntil`/`policyUrgency`/`formatDueDate` handle a null date; a policy without one is `unknown`, not overdue and not ok |

🔴 **Still open, and confirmed still open today.** Three of these are security defects in edge
functions that ARE deployed, and they matter more than the register's formatting:

| Bug | Confirmed by |
|---|---|
| BUG-005 | `supabase/functions/send-email/index.ts` is unchanged. It is mitigated **only** by never being deployed — the code is still an authenticated open relay |
| BUG-006 | `po-auth` has no rate limit, no lockout and no attempt counter of any kind. A 16-digit secret is brute-forceable, and it grants platform admin |
| BUG-007 | `po-auth` returns 404 for an unknown identifier and 200 for a Product Owner's, so it still discloses which identifiers are POs |
| BUG-008 | `payments-webhook` never checks the `ts` freshness window, has no `processed_webhooks` table, and compares signatures with `hex === h1` — not constant-time |
| BUG-030 | no PITR and no dumps; needs a paid tier and an approval |
| BUG-031 | `.github/workflows/ci.yml` exists but this directory is **not a git repository**, so nothing runs it |
| BUG-034 | effectively settled — one project, 63 migrations, `scripts/bootstrap-supabase.ps1` — but never formally reconciled against the live schema, so it is left open honestly |

⚠️ **Stage 1 is therefore not complete, contrary to what CLAUDE.md and the README said.** Items
**1.1** (rebuild `send-email`), **1.2** (rate-limit `po-auth`), **1.3** (webhook hardening),
**1.4** (audit PO sign-in attempts) and **1.7** (replace `*` CORS on all five edge functions — every
one of them still sends `Access-Control-Allow-Origin: *`) were never done. 1.5 is partial: `xlsx` is
still a static import in `importParsers.ts` and has no upstream fix. 1.6, 1.8 and 1.9 are done.

**Not re-checked in this pass:** every S2/S3 entry not named above. They were left as the audit
recorded them rather than being marked on recall.

---

## Phase 2 — session 1 (2026-08-04)

Stage 0 (safety net) and part of Stage 1 of the [Improvement Roadmap](./Improvement_Roadmap.md).

**UPDATE 2026-08-05 — everything below is now applied and verified against a real database.**
A fresh project (`ludbntvhagefadfkhrjj`, Seoul, Postgres 17.6) replaced the deleted dev and the
abandoned prototype. All 33 migrations applied cleanly; **25 tables, 42 functions, 79 RLS policies**.
A 14-check end-to-end suite passes, including live exploit attempts — see
[Phase 2 verification](#phase-2--live-verification-2026-08-05).

| Bug | Was | Now | What changed |
|---|---|---|---|
| BUG-001 | OPEN | **FIXED (verified live)** | `20260804120000` drops `sub_update`, revokes write grants. Exploit attempt returns HTTP 401 and the plan stays Free |
| BUG-003 | OPEN | **FIXED (verified live)** | `REVOKE EXECUTE ON log_audit` — forged audit call rejected |
| BUG-004 | OPEN | **FIXED (verified live)** | `REVOKE EXECUTE ON create_notification` (+ the two scheduled fns) — spoof rejected |
| BUG-009 | OPEN | **FIXED (verified live)** | `trips_kind_check` accepts `'other'`; an "other" trip now inserts successfully |
| BUG-041 | OPEN | **FIXED (verified live)** | `tenants_insert` dropped |
| BUG-015 | OPEN | **FIXED** | `types.ts` regenerated from the new project (1049 → 1627 lines). All 4 missing tables and 4 PO RPCs now typed; **all three untyped shims removed** |
| **NEW** SEC-021 | — | **FIXED (verified live)** | `20260805120000_stage1b_grant_hardening.sql`, found while verifying 1a — see below |
| BUG-011 | OPEN | **FIXED** | `DashboardLayout.tsx` derives the period from `new Date()` |
| BUG-013 | OPEN | **FIXED** | `components/ErrorBoundary.tsx` wraps `BrowserRouter`; 4 unit tests. Reporter hook present, Sentry **not** wired (needs approval) |
| BUG-014 | OPEN | **FIXED** | `tsc` exit 0. 4 TS2677 fixed properly; the 6 `PoSecurity` errors are suppressed by a documented shim, **not** a types regen — see BUG-015 |
| BUG-015 | OPEN | **OPEN** | blocked; the stale `types.ts` is the reason BUG-014 needed a shim |
| BUG-022 | OPEN | **PARTIAL** | `/app/billing` now has `MenuGuard`. `/app/export` still ungated — there is no `export` menu id in `ACCESS_MENUS` or `all_feature_menus()`, so guarding it needs a migration that cannot be pushed yet |
| BUG-031 | OPEN | **FIXED (inactive)** | `.github/workflows/ci.yml` added. **The project is not a git repository**, so nothing runs it yet |
| BUG-033 | OPEN | **FIXED** | `config.toml` `project_id` moved off the LIVE ref to the DEV ref |
| BUG-038 | OPEN | **FIXED** | `bumpDate()` rewritten on UTC date parts with clamping; 13 tests incl. the Jan-31 case |
| BUG-042 | OPEN | **FIXED** | `AccessContext` now fails closed on RPC/transport error; provisional access only during first load |
| BUG-054 | OPEN | **FIXED** | ESLint 11 errors → 0 (27 pre-existing warnings remain) |
| BUG-058 | OPEN | **FIXED (unverified)** | `vercel.json` + `public/_headers`. CSP ships **Report-Only** and must be promoted after checking a real deployment |
| BUG-069 | OPEN | **FIXED** | `.gitignore` covers `.env` / `.env.*` with example negations. The `.env.e2e` password still needs rotating |
| BUG-071 | OPEN | **CLOSED (won't do)** | `20260701120000_account_balance_history.sql` **deleted**. It was never applied to any database, nothing read the table, and it was user-scoped rather than tenant-scoped — creating it on the fresh project would only add dead schema. Balance history stays in `localStorage` until the feature is moved server-side properly (roadmap 3.1) |
| BUG-002 | OPEN | **FIXED** | `tenant_id` threaded through 4 hooks + 8 stores: explicit on every insert, `.eq("tenant_id", …)` on every select/update/delete, tenant in every query key. New `WorkspaceSwitcher` gives `setCurrentTenantId` its first caller |

### ⚠️ Correction to the Phase 1 audit — measured 2026-08-04

The audit assumed DEV and LIVE both carried the tenancy schema. Neither does.

| Project | Ref | State |
|---|---|---|
| DEV | `hkfwuxqeexamyphcgkxr` | Was **paused**, not deleted — a paused free project stops serving its API hostname, which is why DNS failed. Since **deleted for real (2026-08-05)** at the owner's request. |
| LIVE | `tsmdnfywxsjsjqjszoek` | **Alive but pre-tenancy.** Auth healthy; only the 5 original tables exist. Confirmed an abandoned Lovable prototype. |
| **NEW** | `ludbntvhagefadfkhrjj` | **Current.** Seoul, Postgres 17.6, full schema — replaced both of the above. |

Probed on LIVE with the anon key:

- **Exists:** `transactions`, `budgets`, `goals`, `recurring_items`, `subscriptions`
- **Missing (404):** `profiles`, `tenants`, `tenant_members`, `platform_admins`, `plans`,
  `audit_log`, `notifications`, `accounts`, `investments`, `trips`, `reminders`, `insurance`,
  `coupons`, `site_settings`, `income_streams`
- `subscriptions` has `user_id` + `plan_name` but **no** `tenant_id` / `plan_id` / `provider`
- RPCs `get_effective_menus`, `is_platform_admin`, `current_tenant_id`, `all_feature_menus` — all missing

**Migrations `20260604120000` onward (Phases 1–7) were never applied to LIVE.**

Three consequences:

1. **BUG-001's Env field is wrong.** The plan self-upgrade cannot exist on LIVE — `plans` and
   `plan_id` are not there. A weaker variant may: LIVE still has the original `sub_update_own`
   policy plus `GRANT UPDATE`, and `plan_name` is a free-text column.
2. **The Stage 1a migration cannot run on LIVE as written.** Its `REVOKE EXECUTE` statements and
   the `trips` / `tenants` statements reference objects that do not exist and will error;
   `IF EXISTS` does not cover those forms.
3. **The deployed LIVE frontend cannot be this codebase** — current code queries `tenant_members`
   and `get_effective_menus`, which would 404 on every page. LIVE is either abandoned or serving
   an older build. **Confirm what LIVE is before applying anything to it.**

Path forward: stand up a fresh Supabase project, apply all 33 migrations in order, regenerate
types, and Stage 1a becomes simply the last link in that chain.

### SEC-021 · Every table granted TRUNCATE (and anon full write) — **NEW, 2026-08-05**

Found while running Stage 1a's own verification queries on the fresh project.

Supabase's bootstrap runs `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO
anon, authenticated, service_role`, so every `CREATE TABLE` inherited the full privilege set. The
per-table `GRANT SELECT, INSERT, UPDATE, DELETE` lines in our migrations were additive and never
removed the surplus. Measured across all 25 tables:

- `authenticated` and `anon` both held **TRUNCATE, TRIGGER, REFERENCES**
- **`anon` held INSERT / UPDATE / DELETE on all 25 tables** — including `platform_admins`,
  `tenant_members` and `audit_log`

**TRUNCATE is not subject to RLS.** It is also not reachable today: `anon` and `authenticated` are
`NOLOGIN` (only `authenticator` connects, then `SET ROLE`) and PostgREST exposes no TRUNCATE verb.
So this was **latent, not live-exploitable** — but it left RLS as the single thing standing between
a signed-out request and every table, which is one missing policy away from data loss.

Fixed by `20260805120000_stage1b_grant_hardening.sql`: revokes TRUNCATE/TRIGGER/REFERENCES from
both roles, makes `anon` read-only, completes Stage 1a's revoke for `anon` on `subscriptions`, and
amends `ALTER DEFAULT PRIVILEGES` so new tables stop inheriting the surplus.

Verified: the three privilege queries return zero rows; anon can still read `plans`,
`site_settings` and `coupons` (HTTP 200); anon `POST /tenants` returns **401**.

### Phase 2 — live verification (2026-08-05)

14 checks against `ludbntvhagefadfkhrjj`, all passing, throwaway user cleaned up (zero residual rows):

| Group | Checks |
|---|---|
| Signup trigger | profile, personal tenant, owner membership and Free subscription all auto-created |
| Session + RLS | password login; `get_effective_menus` returns Free's 8 menus; user sees exactly one tenant |
| **BUG-001 exploit** | `PATCH /subscriptions` → **401**; plan remains Free afterwards |
| Escalation | cannot self-grant `platform_admins`; cannot call `log_audit`; cannot call `create_notification` |
| Normal use | transaction insert with explicit `tenant_id` succeeds; a `kind='other'` trip inserts (BUG-009) |

### Environment now stood up (2026-08-05)

- **Edge functions deployed** — `po-auth`, `payments-webhook`, `live-price` (all `--no-verify-jwt`)
  and `billing-api` (JWT verified). All ACTIVE. Verified: unsigned webhook → 401, anonymous
  `billing-api` → 401, `po-auth mode=resolve` returns the PO email.
  **`send-email` is deliberately NOT deployed** — still an authenticated open mail relay (BUG-005).
  No Paddle/Resend secrets are set, so `billing-api` will fail when it actually calls Paddle; that
  is expected until the Paddle account exists.
- **Demo account seeded** — `demo@finroot.app`, confirmed via admin API without weakening the
  project-wide confirmation setting. Also a platform admin, and upgraded to Pro through the real
  `po_assign_plan` RPC (menus 8 → 14, audit row written). **Privileged — delete before real users.**
- **Playwright 12/12 passing** against the new project, including the PIN gate and all feature pages.

Two findings from that run, both worth keeping:

1. `/app/investments` and `/app/import` **failed while the tenant was on Free** — Free's `menu_set`
   is exactly the 8 basic menus, so `MenuGuard` correctly redirected. That is plan gating working,
   not a defect; the suite assumes a Pro tenant.
2. **BUG-028 remains open despite the mobile-overflow test passing.** The test sets the viewport
   *before* `goto`, so it never reproduces the 36 px overflow that appears on post-load resize.
   A green result here is not evidence.

Still outstanding on the project: `site_url` is `http://localhost:3000` (wrong port — breaks
password-reset links); the `WELCOME20` coupon was never re-seeded; and the Integration/E2E cases in
[Test_Cases.md](./Test_Cases.md) are still largely unexecuted.

## Stage 2 — correctness (2026-08-05)

All of the following are applied to `ludbntvhagefadfkhrjj` and verified against it.

| Bug | Was | Now | What changed |
|---|---|---|---|
| BUG-016 | OPEN | **FIXED (verified live)** | `20260805130000` — `is_tenant_member()` now joins `tenants` and gates on its status. Suspension is read-only, not a blackout, so a suspended customer can still export their data |
| BUG-024 | OPEN | **FIXED** | `20260805140000`-era work: `lib/budgetBuckets.ts` maps categories → buckets; `useBudgetSpend` derives `spent` from transactions. The `budgets.spent` column is no longer read or written by the UI |
| BUG-010 | OPEN | **FIXED (verified live)** | `net_worth_snapshots` + `useNetWorthHistory`; `seedHistory()` (fabricated trend) deleted |
| BUG-017 | OPEN | **FIXED (verified live)** | `20260805160000` + `…170000` — `transactions.import_hash` with a plain `UNIQUE (tenant_id, import_hash)`; re-importing the same file inserts 0 rows |
| BUG-025 | OPEN | **FIXED (verified live)** | Data model in `20260805150000`; **UI completed 2026-08-05** — `TransferDialog` + a Transfer button and transfers list on `/app/accounts`. Verified in the browser: ₹5,000 HDFC → Paytm moved both balances, left total assets, income, spend and savings rate untouched |
| BUG-019 | OPEN | **FIXED (verified live)** | `20260805180000` makes `plans` the source of truth (Roots ₹0 / Canopy ₹299 / Heritage ₹899, INR); each landing card links to a plan by name and derives its price. `po_set_plan_price` (`…190000`) lets the PO price a plan from `/po/plans`; the PO console flags any card that drifts. 23 tests in `src/lib/pricing.test.ts`, including an offline guard that parses the catalogue out of the migrations |
| BUG-023 | OPEN | **FIXED (verified live)** | `billing-api` resolves the workspace from `tenant_id` (body / `x-tenant-id`), verifies active membership, and refuses to guess when a user belongs to more than one. Cancel and resume are owner-only, invoices admin-or-owner. Verified with a real viewer: read 200, cancel 403, invoice 403; foreign workspace 403; ambiguous call 400 |
| BUG-040 | OPEN | **FIXED (verified live)** | `20260805210000` — `goal_contribute()` (row-locked, clamped to [0, target], flips status) and `budget_set_allocation()` (upsert on the workspace-scoped key). **12 simultaneous ₹100 contributions now total exactly ₹1,200**; before, the client's read-modify-write would have lost most of them |

| BUG-012 | OPEN | **FIXED (verified live)** | `src/lib/errorMessages.ts` — `toUserMessage()` maps constraint names, SQLSTATEs, RLS refusals, auth failures and transport errors to copy a person can act on; `notifyError()` replaces `toast.error(e.message)` at **~95 call sites across 30 files** and always `console.error`s the raw error. Messages our own RPCs raise (`P0001`) pass through untouched. Verified in the browser: a duplicate coupon now reads "A coupon with that code already exists." while the PostgrestError still lands in the console. 21 unit tests plus a source guard that fails if any file toasts a raw `.message` again |

### Found by executing the FIN + TEN suites (2026-08-05)

Full run in [QA_PROGRESS.md](./QA_PROGRESS.md#phase-2--session-3-2026-08-05-fin--ten-executed).
31 / 31 cases pass; these four defects were found on the way and fixed, one remains open.

| Bug | Sev | What it was | Status |
|---|:-:|---|---|
| BUG-076 | S2 | `MoneyInput` displayed `12.34` while reporting `12.3456` to the form; `numeric(14,2)` then stored `12.35`. Every amount in the app goes through this field | **FIXED** — emits the number it displays; 8 tests |
| BUG-077 | S3 | `formatMoney` rendered `₹-100` (sign inside the symbol) and `₹NaN` when handed an uncomputable figure | **FIXED** — `-₹100`, and non-finite renders `—`; a wrong number that looks like a number is worse than a blank |
| BUG-078 | S2 | Deleting a workspace erased its own audit trail. `po_delete_tenant` wrote `tenant.delete`, then the `ON DELETE CASCADE` removed it — along with `tenant.create` and every other row for that workspace. The most destructive action in the PO console left no trace | **FIXED** — `20260805220000`: FK is `ON DELETE SET NULL`, the record is written after the delete with the id and name in its metadata. Verified: both rows now survive |
| BUG-079 | S3 | `po_delete_tenant` on an unknown id raised a raw foreign-key error instead of saying the workspace does not exist | **FIXED** — same migration; now "No such workspace" |
| BUG-080 | S4 | Smart Split percent mode round-trips ₹128 to ₹127.99 (2 dp percentages) | **OPEN** — cosmetic |

**Encoding gotcha found here:** `20260805180000` wrote `₹` as literal UTF-8 and the applier script read
the file with PowerShell 5.1's ANSI default, so Postgres stored `â‚¹299`. The landing never showed it
(prices come from `plans`), but the stored fallback was wrong. `20260805200000` repairs it and is pure
ASCII — every non-ASCII character is built with `chr()`. Any tool that writes SQL or source files on
Windows must read/write UTF-8 explicitly.

### Not yet started

`send-email` (BUG-005, Stage 1.1). Remaining Stage 2 items: **2.11** (coupons ↔ Paddle — blocked,
no Paddle account exists) and **2.15** (menu-vs-paywall contract, needs a product decision).
The stage's exit criterion also requires the 21 FIN and 10 TEN cases in
[Test_Cases.md](./Test_Cases.md) to be executed and logged — they have not been.

**Severity** S1 Critical (data loss / revenue loss / security breach) · S2 High (core function
broken or wrong data shown) · S3 Medium (degraded) · S4 Low (cosmetic).
**Priority** P0 fix before release · P1 next sprint · P2 backlog · P3 opportunistic.
**Env** PRIMARY `ludbntvhagefadfkhrjj` (Seoul — the only FinRoot project) · CODE (static).
`hkfwuxqeexamyphcgkxr` (old dev) was **deleted 2026-08-05**; `tsmdnfywxsjsjqjszoek` is an abandoned
Lovable prototype in a different account. Any mention of either elsewhere in `docs/` is historical.

---

## Open — S1 Critical

### BUG-001 · Workspace owner can grant themselves any paid plan
| Field | Value |
|---|---|
| Module | Billing / RLS |
| Sev / Pri | **S1 / P0** |
| Env | CODE, DEV, LIVE |
| Steps | Sign up (Free). In the console: read the Pro plan id from `plans` (world-readable), then `supabase.from('subscriptions').update({plan_id, plan_name:'Pro', status:'active', current_period_end:'2099-01-01'}).eq('tenant_id', myTenant)` |
| Expected | Update rejected |
| Actual | Update succeeds; `get_effective_menus` immediately returns the Pro menu set |
| Screenshot | n/a — reproduce via REST |
| Root cause | `sub_update` policy in `20260604210000_phase4_plans_billing.sql` grants UPDATE to tenant owners, and `GRANT UPDATE ... TO authenticated` from `20260601063818` was never revoked |
| Fix | New migration: `DROP POLICY sub_update ON subscriptions;` + `REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM authenticated;` |
| Regression | BILL-001…006, BILL-008, BILL-018, AUTHZ-020 |
| Test | SEC-T01, SEC-T02, BILL-014 |
| Status | **FIXED-PENDING-APPLY** — migration `20260804120000_stage1a_security_hardening.sql` written 2026-08-04 but **not applied to any database**. Still exploitable in DEV and LIVE until it is pushed. |

### BUG-002 · Multi-workspace writes land in the wrong workspace; reads merge workspaces
| Field | Value |
|---|---|
| Module | Tenancy / all data hooks |
| Sev / Pri | **S1 / P0** |
| Env | CODE, DEV, LIVE |
| Steps | Account `multi` owns workspace B and is a collaborator in A. Sign in, select A, add an expense. Then open the Expenses list. |
| Expected | Row saved to A; the list shows only A |
| Actual | Row saved to **B** (`current_tenant_id()` = first membership); the list shows **A + B merged** |
| Root cause | No client code sets or filters `tenant_id`; inserts rely on the DB default and selects rely on RLS, which returns every membership's rows |
| Fix | Thread `TenantContext.currentTenantId` into every insert and every select; add a `WITH CHECK` on the supplied `tenant_id` |
| Regression | every data module; all dashboards |
| Test | TEN-003…006 |
| Status | **OPEN** |

---

## Open — S2 High

| ID | Title | Module | Steps → Expected / Actual | Root cause | Fix | Test | Status |
|---|---|---|---|---|---|---|---|
| BUG-003 | Any user can forge audit-log entries | Security | Call `rpc/log_audit(...)` → expected denied / actual succeeds | Postgres default `EXECUTE TO PUBLIC` never revoked | `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` | SEC-T03 | OPEN |
| BUG-004 | Any user can send notifications to any user | Security | Call `rpc/create_notification(other_uid, …)` → expected denied / actual succeeds | as BUG-003 | as BUG-003 | SEC-T04, NOTIF-005 | OPEN |
| BUG-005 | `send-email` is an open mail relay | Edge fn | `POST /functions/v1/send-email {to:"victim@x", html:"<phish>"}` with any user JWT → expected rejected / actual sent from your Resend domain | function accepts caller-controlled `to`/`html` with no allow-list | template-id API + server-resolved recipients + per-user rate limit | SEC-T14 | OPEN |
| BUG-006 | PO 16-digit secret is brute-forceable | Auth | 100 rapid `po-auth {mode:"secret"}` attempts → expected throttled / actual unlimited, each running a bcrypt | no rate limiting on a `verify_jwt=false` function | token bucket + lockout + audit-log the failures | PO-004, SEC-T15 | **FIXED (code), NOT DEPLOYED 2026-08-15.** `po-auth/index.ts`'s `secretLockedOut()` counts `po.auth.secret` failure rows in `audit_log` (BUG-109's own logging) for the given identifier over a rolling 15-minute window and returns `429` once 5 are reached — a real lockout, not just a delay, and it costs no new table since it piggybacks on the audit trail. Fails open (no lockout) if the count query itself errors, matching `logAttempt`'s own tradeoff. **Not yet live** — same blocker as BUG-109: no `SUPABASE_ACCESS_TOKEN`/CLI access this session to run `supabase functions deploy po-auth`, and the logic could not be exercised end-to-end without it (`audit_log` INSERT is `service_role`-only by design, so a test row cannot be seeded from an authenticated session either). Reviewed carefully by hand instead: the PostgREST `column->>key` JSON-filter syntax used by `.eq("metadata->>outcome", "failure")` is standard and matches the shape `logAttempt` already writes. **`signInWithPassword` throttling for regular accounts (BUG-101) is still open** — that path goes straight to Supabase Auth's own endpoint, not a function this repo controls, so fixing it needs either the project's Auth rate-limit settings (dashboard/Management API, same class of access this repo has never had) or a bigger architectural change (routing sign-in through a custom function), neither of which is a same-scope fix. **Re-confirmed live 2026-08-15, Stage 0.10 SEC suite (SEC-T15)**: 20 rapid `po-auth` secret attempts against the deployed function, still all `401`, never a `429` — the lockout above is real code but not live yet, exactly as expected |
| BUG-007 | `po-auth` discloses which identifiers are Product Owners | Auth | `{mode:"resolve", identifier}` → 200 + email for a PO, 404 otherwise | differential response | uniform response for both branches | PO-005, SEC-T05 | **FIXED (code), NOT DEPLOYED 2026-08-17.** `po-auth/index.ts`'s `resolve` branch now returns the same `200` status and `{email}` shape whether or not the identifier matches — `email: null` on no-match instead of a `404` with a distinct error body. `PoLogin.tsx` already treated a falsy `email` as failure uniformly, so no client change was needed. Not yet live — same `SUPABASE_ACCESS_TOKEN` blocker as BUG-006/022/109/113. |
| BUG-008 | Paddle webhook accepts replays | Billing | Re-POST a captured valid event → expected rejected / actual re-applied | `ts` never validated; no event de-duplication; `hex === h1` not constant-time | 5-min freshness window + `processed_webhooks(event_id)` + constant-time compare | BILL-010, SEC-T16 | **FIXED (code), NOT DEPLOYED to the hosted project; the fix itself is now confirmed correct by actually running it, not just reading it.** All three gaps closed in `payments-webhook/index.ts`: `verifyPaddleSignature` now rejects any `ts` more than 300s from server time before even computing the HMAC; the byte compare itself is a fixed-time XOR-accumulate (`timingSafeEqualHex`) instead of `hex === h1`; a new `processed_webhooks(event_id)` table (migration `20260815090000_bug008_webhook_hardening.sql`) is checked via `INSERT ... ON CONFLICT` immediately after signature verification and before any subscription write. **Still not live on the hosted project** — same `SUPABASE_ACCESS_TOKEN` blocker as BUG-006/022/109/113. What changed: the earlier "could not be exercised end-to-end" is no longer true. `PAYMENTS_SANDBOX_WEBHOOK_SECRET` turned out to be unnecessary for testing the function's own logic — its signature scheme is self-contained HMAC-SHA256, so any shared secret works for verifying the CODE is correct (a real Paddle secret only matters for verifying Paddle's own authenticity, a separate concern). Ran `supabase functions serve` locally with a self-chosen test secret and drove the actual code with real HTTP requests: a valid webhook is accepted once; the identical replay comes back `{received:true, duplicate:true}` without reprocessing; a tampered body under the original signature gets `401`; a stale `ts` gets `401` with the same generic message (the specific reason stays server-side only, correctly not leaked). All three original gaps confirmed closed by execution, not just code review — see SEC-T16/T17 in REMAINING_TESTS.md §11 |
| BUG-009 | Creating an "Other" trip fails | Trips | Trips → New → kind "Other" → Save → expected created / actual raw `violates check constraint "trips_kind_check"` toast | `TripKind` in `tripsStore.ts:8` includes `other`; the DB CHECK does not | migration to extend the CHECK | TRIP-002 | OPEN |
| BUG-010 | Net-worth trend chart shows fabricated data | Net Worth | Open Net Worth with < 6 months of data → expected real history or an empty state / actual a synthetic 6-month curve | `netWorthStore.seedHistory` generates the series; no `net_worth_snapshots` table exists | add a snapshots table + a daily job, or remove the chart | NW-003, FIN-011 | **FIXED 2026-08-05 — see Stage 2** |
| BUG-011 | Top bar shows a hardcoded "April 2026" | UI | Open any `/app` page → expected the current period / actual the literal string | `DashboardLayout.tsx:135` | compute from `new Date()` | UI-T09 | OPEN |
| BUG-012 | Raw Postgres errors shown to users | UI | Trigger any constraint or RLS violation → expected friendly copy / actual `new row violates row-level security policy for table "transactions"` | every mutation does `toast.error(e.message)` | central `toError()` mapper + log the raw error | UI-T11 | **FIXED 2026-08-05 — see Stage 2** |
| BUG-013 | No error boundary — a render throw blanks the app | UI | Force a throw in any widget → expected fallback UI / actual white screen, no message, no report | no `ErrorBoundary` anywhere in the tree | add one above `<Routes>` + wire to Sentry | UI-T10 | OPEN |
| BUG-014 | `tsc` fails with 10 errors while the build passes | Build | `npx tsc -p tsconfig.app.json --noEmit` → expected exit 0 / actual **exit 2** | 4× TS2677 in `importParsers.ts` (template-literal uuid predicates); 6× stale `types.ts` in `PoSecurity.tsx`. SWC does not type-check | fix the predicates; regenerate `types.ts` | OPS-001, PO-022 | OPEN |
| BUG-015 | Generated types are four migrations stale | Build | Search `types.ts` for `income_streams` → expected present / actual absent (also `demat_accounts`, `demat_ledger`, `account_balance_history`, 4 PO RPCs) | types never regenerated after `20260627120000` and the `20260701*` migrations | `supabase gen types typescript --project-id <ref>`; remove the `as unknown as SupabaseClient` handle in `useIncomeStreams` | OPS-012 | OPEN |
| BUG-016 | Suspending a workspace has no effect | PO | PO suspends a workspace → expected access restricted / actual owner and members continue working normally | no policy or RPC reads `tenants.status` | add `AND tenants.status = 'active'` to `is_tenant_member`, or a dedicated guard | TEN-010, PO-011 | **FIXED 2026-08-05 — see Stage 2** |
| BUG-017 | Re-importing a file silently doubles every row | Import | Import the same CSV twice → expected de-dup or a warning / actual duplicates | import is append-only; the "Write mode" control was removed as non-functional | content hash per row, or an import batch id with an idempotency check | IMP-002 | **FIXED 2026-08-05 — see Stage 2** |
| BUG-018 | Coupons can be created and copied but never apply | Billing | Copy a code, go to checkout → expected a discount field / actual nowhere to use it | no code path passes a discount to Paddle | wire to Paddle discounts, or remove the feature | BILL-015 | **FIXED 2026-08-05 — Stage 2.11, "remove" branch.** `PromoBanner` + `usePromo` deleted (the customer-facing promise is gone); PO editor gated behind `usePaymentsGateway()`. `coupons` table + `po_*_coupon` RPCs deliberately kept. |
| BUG-019 | Landing pricing does not match the billing catalogue | Marketing | Compare the landing cards with `plans` → expected the same plans / actual Roots/Canopy/Heritage ₹0/₹299/₹899 vs Free/Pro $0/$9 | `site_settings.landing_pricing` is unlinked marketing copy | drive the pricing section from `plans`, or reconcile them manually and add a test | BILL-016 | **FIXED 2026-08-05 — see Stage 2** |
| BUG-020 | Cannot invite a user who has not signed up | Workspace | Invite an unregistered email → expected an invite is sent / actual `No account exists for <email>, ask them to sign up first` | `invite_member` requires an existing `auth.users` row | pending invitations table + an invite email with a signup link | WS-002 | OPEN |
| BUG-021 | Restricting a module does not restrict the data | Security | As a member denied `investments`, `GET /rest/v1/investments` → expected 0 rows / actual all rows | menu resolution is client-side only; RLS gates on membership alone | decide the contract (AZ-001); if it is a paywall, enforce it in RLS | AUTHZ-014, SEC-T19 | **FIXED 2026-08-05 — Stage 2.15.** Contract decided: enforced in RLS for the 11 tables that map 1:1 to a menu, navigation-only for the `transactions`-backed menus. See AZ-001. |
| BUG-022 | `viewer` can export the whole workspace | Security | As `viewer-a`, open `/app/export` → expected blocked / actual full export | `/app/export` has no `MenuGuard` | add the guard; consider owner/admin-only | EXP-003, AUTHZ-018 | **PARTIAL 2026-08-15 — code + migration ready, not deployed.** `/app/export` already has `MenuGuard` (borrowing `menuId="import"`, per the earlier finding at line 33/89) — this row's own premise ("no `MenuGuard`") was already stale before today. The real gap was the missing dedicated `export` id: added to `ACCESS_MENUS` (`accessMenus.ts`), `NAVIGATION_ONLY_MENUS` (`menuContract.ts`, matching the same navigation-only treatment as `import`/`dashboard`/`billing` — Export.tsx already narrows by the caller's own per-menu RLS, so this was never a data boundary, only a route-navigation one), `MENU_BLURBS` (`menuUpsell.ts`), and a new migration `20260815070000_bug022_export_menu_id.sql` adding `'export'` to `all_feature_menus()`. **`App.tsx:181`'s `MenuGuard` deliberately still says `menuId="import"`** — flipping it before the migration is live would make `get_effective_menus()` return `'export'` for nobody (not even Heritage/Canopy owners), turning today's over-broad proxy gate into a hard outage. Confirmed live via anon-key REST reads before writing the migration: `all_feature_menus()` has no `'export'` yet, and of the 3 real plans only Heritage/Canopy (`menu_set: ["*"]`) currently reach `/app/export` at all (via the borrowed `import` id) — Roots never had `import` either, so once the migration lands and `App.tsx` is flipped in the same deploy, access is unchanged, not widened. Whoever has `SUPABASE_ACCESS_TOKEN` next: push the migration, then change `App.tsx:181` to `menuId="export"` — both in the same session. **Re-confirmed live three more times 2026-08-15, Stage 0.10 AUTHZ/SEC suites**: AUTHZ-018 (`viewer-a`, a genuine separate account this time rather than a self-demoted owner, reproduced the same unrestricted `/app/export`), AUTHZ-023 (client `ACCESS_MENUS` now has 15 ids incl. `export`; live `all_feature_menus()` still has 14 — the drift this fix is waiting to close), and SEC-T20 (same reproduction as AUTHZ-018, run as the suite's own case) |
| BUG-023 | `billing-api` can act on the wrong workspace | Billing | As a user owning two workspaces, open Billing and cancel → expected the selected workspace / actual whichever subscription was updated most recently | the function queries by `user_id`, not `tenant_id` | accept `tenant_id`, verify membership | BILL-017 | **FIXED 2026-08-05 — see Stage 2** |
| BUG-024 | `budgets.spent` does not follow logged expenses | Budget | Set a 10k budget, log a 3k expense in that bucket → expected 3k spent / actual unchanged unless a code path writes it | `spent` is a stored, client-written column | derive from `transactions` in a view or a trigger | FIN-014 | **FIXED 2026-08-05 — see Stage 2** |
| BUG-025 | No transfer transaction type | Transactions | Move 10k between own accounts → expected neutral to income/spend / actual inflates both by 10k | `transactions.type` allows only income/expense | add a `transfer` type excluded from income/spend aggregates | FIN-019 | **FIXED 2026-08-05 — see Stage 2** |
| BUG-026 | Six features are silently device-local | Data | Set a recurring reminder, then open the app in another browser → expected present / actual gone | recurring reminders, custom categories/subcategories, balance history, budget planner, base currency all live in `localStorage` | migrate to tenant tables; label anything that stays local | REC-007 | **FIXED 2026-08-06 — Stage 3.1/3.2.** Five of the six moved to `tenant_settings` + `recurring_reminders` (migration `20260806120000`); the sixth, balance history, never existed (see BUG-071). Everything still local is registered in `src/lib/deviceLocal.ts` with a reason, guarded by a test. |
| BUG-027 | Portfolio list appears empty for older holdings | Investments | Open Investments with a holding saved last month → expected visible / actual empty list | `MatrixFilter` defaults to the "today" preset filtered by `savedAt` | default to "all" for holdings | INV-006 | OPEN |
| BUG-028 | 36 px horizontal overflow on mobile | UI | Load `/`, resize to 375 or 390 px wide → expected ≤ 2 px / actual `scrollWidth − clientWidth = 36` (measured) | full-bleed fixed layers stretch to the wider document; likely the `w-[48vw]` aurora blob or the ×3 marquee. The e2e test sets the viewport **before** navigation and so passes | bisect; then extend the e2e test to a post-load resize | UI-T01 | OPEN |
| BUG-029 | Body text fails WCAG AA contrast | UI | Measure `#5f6764` at 11 px on `rgb(8,9,13)` → expected ≥ 4.5:1 / actual **3.42:1**, used ~100× | landing palette tertiary text is too dark | lighten to ≈ `#8b9a94` | UI-T02 | OPEN |
| BUG-030 | No backups configured | Ops | Attempt a point-in-time restore → expected possible / actual no PITR, no dumps | Supabase free tier; nothing configured | enable PITR (Pro) + nightly `pg_dump` to object storage; rehearse a restore | OPS-008 | OPEN |
| BUG-031 | No CI — nothing gates a change | Ops | Push a change with type errors and lint errors → expected blocked / actual merges | no `.github/` workflows | add the pipeline in Testing_Master_Plan §8 | OPS-001…005 | OPEN |
| BUG-032 | 9 high-severity dependency vulnerabilities | Ops | `npm audit --omit=dev` → expected clean / actual 9 high + 1 moderate; `xlsx` has no npm fix and parses user uploads | outdated transitive deps + an unfixable `xlsx` | `npm audit fix`; drop, replace or sandbox `xlsx` | OPS-005, IMP-006 | OPEN |
| BUG-033 | `config.toml` targets the live project | Ops | Run `supabase db push` in the repo root → expected dev / actual **live** | `project_id = "tsmdnfywxsjsjqjszoek"` | remove it; require an explicit `--project-ref` | OPS-013 | OPEN |
| BUG-034 | Live migration state is unknown | Ops | Compare live schema with the 32 migrations → expected a match / actual untracked | live is a Lovable-managed project in another account | reconcile and record; adopt a single migration source of truth | OPS-006 | OPEN |
| BUG-035 | "Remember me" does nothing | Auth | Sign up with the box unchecked, close and reopen the browser → expected signed out / actual still signed in | `finroot.session_only` is read but never written | wire the checkbox, or remove it and the dead branch | AUTH-014 | **FIXED 2026-08-17 — removed, not wired.** There was no "remember me" checkbox anywhere in the sign-in form to wire up (only an unrelated "remember this profile" chip feature) — and `Auth.tsx` already had a comment calling the flag "legacy", unconditionally clearing it on every sign-in. Rather than build new UI for a feature a previous author had already started retiring, deleted the dead enforcement branch in `useAuth.tsx`, the `removeItem` call in `Auth.tsx`, and the two now-unused `finroot.session_only`/`finroot.session_active` registrations in `deviceLocal.ts`. |
| BUG-036 | PIN has no recovery path | Auth | Forget the PIN → expected a reset flow / actual must clear site data | nothing calls `clearPin` | "Forgot PIN → re-enter password" flow | LOCK-010 | ✅ FIXED 2026-08-11 (Stage 5.4) — `LockScreen` recover mode |
| BUG-037 | No onboarding after sign-up | UX | Complete sign-up → expected guidance / actual a forced PIN then an empty dashboard | not built | first-run checklist + optional sample data | — | ✅ FIXED 2026-08-11 (Stage 5.3 checklist + sample data; 5.4 made the PIN optional) |

---

## Open — S3 Medium

| ID | Title | Module | Root cause | Test |
|---|---|---|---|---|
| BUG-038 | Monthly recurrence rolls 31 Jan → 3 Mar | Recurring | `bumpDate()` uses JS `setMonth` | REC-005 |
| BUG-039 | Deleting an account orphans its transaction tags | Accounts | account id encoded in `description`, no FK | FIN-013 | **FIXED 2026-08-06 — Stage 3.4.** `transactions.account_id uuid REFERENCES accounts(id) ON DELETE SET NULL` + `payment_mode text`, backfilled from the prefix. Deleting an account now nulls the link instead of leaving a dangling uuid in prose, and balances can be computed by SQL rather than by regexing descriptions in the browser. |
| BUG-040 | Concurrent goal contributions lose updates | Goals | client read-modify-write on `current_amount` | FIN-018 — **FIXED 2026-08-05, see Stage 2** |
| BUG-041 | Any user can create unlimited orphan tenants | Security | `tenants_insert WITH CHECK (created_by = auth.uid())`, no quota | TEN-009 |
| BUG-042 | `AccessContext` fails open on RPC error | Security | `effectiveMenus` stays `null` = full access | AUTHZ-017 |
| BUG-043 | Insurance list downloads every base64 document | Performance | `select("*")` includes `document_data_url` | INS-004 | **FIXED 2026-08-06 — Stage 3.3.** Documents moved to the private `insurance-docs` bucket (10 MB cap + MIME allow-list enforced by the bucket); the list selects explicit columns and a generated `has_legacy_document` flag. Measured 200,588 → **389 bytes** for one policy with a 200 KB scan. Pre-3.3 inline documents are fetched one at a time by `loadLegacyDocument()`. |
| BUG-044 | Live prices: one request per holding per minute | Performance | `livePrices.ts` unbatched, uncached | INV-007 |
| BUG-045 | No pagination — the dashboard fetches all history | Performance | `useTransactions` has no `limit`/`range` | OPS-014 |
| BUG-046 | 2.56 MB single JS chunk | Performance | all 27 pages statically imported in `App.tsx` | OPS-004 |
| BUG-047 | `xlsx` static import defeats the dynamic import | Performance | `importParsers.ts` imports it statically | OPS-004 |
| BUG-048 | Global Cmd/Ctrl+N hijack | UI | `DashboardLayout` `preventDefault`s it | TXN-009 |
| BUG-049 | Duplicate toasts on every insert | UI | `useRealtimeSync` toasts on self-originated events | UI-T18 |
| BUG-050 | Hero `h1` reads "commandcenter" | A11y | split-text spans with no separating whitespace | UI-T05 |
| BUG-051 | Hero `h1` starts at `opacity: 0` | A11y | framer-motion initial state; invisible without JS | UI-T06 |
| BUG-052 | No `<main>` landmark, no skip link | A11y | not implemented | UI-T03 |
| BUG-053 | 21/42 landing tap targets below 44 px; 121 text nodes under 12 px | A11y | design | UI-T04 |
| BUG-054 | ESLint fails (11 errors) | Code health | `no-explicit-any` ×6, `no-unused-expressions`, `no-require-imports` | OPS-002 |
| BUG-055 | `strict`/`strictNullChecks`/`noImplicitAny` all off | Code health | Lovable scaffold defaults | — |
| BUG-056 | PO console has no mobile layout | UI | fixed `w-60` sidebar, no collapse | PO-023 |
| BUG-057 | Scheduled jobs written but never scheduled | Ops | no pg_cron entry for `expire_subscriptions` / `notify_expiring_subscriptions` | BILL-004 |
| BUG-058 | No security headers, no hosting config | Security | no `vercel.json` / `_headers` / CSP | — |
| BUG-059 | `live-price` not deployed to dev → CORS errors on Investments | Ops | never deployed | INV-005 |
| BUG-060 | `budgets` uniqueness is user-scoped, not tenant-scoped | Data | predates tenancy | — |

## Open — S4 Low

| ID | Title | Root cause |
|---|---|---|
| BUG-061 | Three lockfiles (`package-lock.json`, `bun.lock`, `bun.lockb`) | tooling switched from bun to npm without cleanup |
| BUG-062 | `CLAUDE.md` says the backend is at "Phase 0/1" | never updated after phases 1–7 shipped |
| BUG-063 | `README.md` is a two-line placeholder | never written |
| BUG-064 | `PermissionsCenter.tsx` (21 kB) and `FeatureShowcase.tsx` (13 kB) are imported nowhere | superseded, not deleted |
| BUG-065 | `next-themes` + ~9 shadcn primitives installed but unused | scaffold leftovers |
| BUG-066 | DM Serif Display loaded from Google Fonts but never used | font stack changed to IBM Plex |
| BUG-067 | Three of five themes unreachable from the UI | only light ↔ obsidian is exposed |
| BUG-068 | Page container widths inconsistent (1000 / 1200 / 1400) | Trips and Reminders never standardised |
| BUG-069 | `.env*` not covered by `.gitignore` | only `.env.e2e` was added |
| BUG-070 | React Router v7 future-flag warnings on every load | not yet migrated |
| BUG-071 | `account_balance_history` table exists but the hook writes to `localStorage` | migration never wired up |
| BUG-072 | `demat_accounts` has no `user_id` column | inconsistent with every other tenant table |
| BUG-073 | Landing footer contact is the placeholder `hello@finroots.app` | never replaced | ✅ FIXED 2026-08-12 (Stage 5.7) — one address in `src/lib/support.ts`, guarded by a test |
| BUG-074 | `caniuse-lite` 14 months stale | browserslist never updated |
| BUG-075 | Preloader overlay still mounted after load — verify it is inert | measured; needs confirmation |

### Found by the Stage 2.15 verification pass (2026-08-05)

| ID | Title | Sev | Detail | Status |
|---|---|:-:|---|---|
| BUG-088 | **Editing any transaction silently detached it from its account and moved that balance** | S2 | `TransactionDialog`'s init effect recovered `paymentMode` / `linkedAccountId` from the row, then unconditionally ran `setPaymentMode("UPI"); setLinkedAccountId("none")` a few lines below — including on the edit branch. So opening any transaction and saving it rewrote the description prefix as a bare `[UPI]` with no account id, and the transaction dropped out of its account's live balance. Money visibly changed for an edit the user did not make. Found while rewiring for 3.4. **FIXED 2026-08-06:** the reset now runs only on the create branch, and account/mode come from the real columns. | FIXED |
| BUG-089 | Workspace invite copy claimed collaborators must already have an account | S4 | The Team & Permissions blurb said "Collaborators must already have a FinRoot account. Invite by the email they signed up with" — true before 3.8, false after it. Left unchanged it would have talked users out of the feature that now works. **FIXED 2026-08-06** alongside 3.8. | FIXED |
| BUG-086 | Deleting a workspace orphans its uploaded documents | S3 | `storage.objects` has no FK to `tenants`, so `po_delete_tenant` removes the rows and leaves every file in `insurance-docs/<tenant_id>/` behind — paying storage rent with nothing pointing at it, and still holding personal documents after the customer is gone. Verified during the 3.3 test run: objects belonging to deleted throwaway tenants survived and had to be removed by hand. | **PARTIALLY FIXED 2026-08-06 — Stage 3.5.** The purge now enqueues the prefix in `storage_purge_queue` and the workspace is deleted. 🔴 Postgres **cannot** delete storage objects — `storage.protect_delete()` raises 42501 and tells you to use the Storage API — so the files themselves still need a drain step (edge function or operator script) calling `complete_storage_purge(id)`. Until then a purged workspace's documents survive in the bucket. |
| BUG-087 | Insurance card renders "Invalid Date" / "NaN DAYS" when `due_date` is null | S4 | `due_date` is nullable, but the card formats it unconditionally and `daysUntil(null)` yields NaN. Not reachable through the Add Policy form (which requires a date), so it only shows for rows created by import or SQL. Seen while seeding a test policy in 3.3. | OPEN |
| BUG-084 | Custom categories leaked between accounts sharing a browser | S3 | Found while doing 3.1. `custom-categories-v1` and `expense.custom-subcategories.v1` were namespaced by neither tenant nor user, so two accounts signing in on the same browser profile saw and edited each other's category lists — while a genuine collaborator on the same workspace saw none of them. **FIXED 2026-08-06** with the rest of 3.1: both are now per-workspace rows, and the one-time import is flagged per `(setting, tenant)` so it cannot copy one workspace's list into another. | FIXED |
| BUG-085 | Reminder window could fire a day early or late across a DST change | S4 | `isReminderDue` mutated a local `Date` (`setHours(0,0,0,0)` then `setDate(due - n)`), so a window spanning a DST boundary shifted by an hour and could land on the wrong calendar day — the same family as BUG-038's `bumpDate`. **FIXED 2026-08-06:** rewritten on calendar-day arithmetic, 13 tests. | FIXED |
| BUG-081 | A tenant-level module denial does not bind the workspace owner | S3 | `get_effective_menus()` returns `plan_menus()` immediately for `role = 'owner'`, so the tenant deny-list (and the member allow-list) never applies to them. `po_set_tenant_menus(tenant, '{"deny":["investments"]}')` restricts every collaborator but leaves the owner with full menus — and, since 2.15, full data access. Measured on a Canopy workspace: `investments` denied at tenant level, owner still read every row. Pre-existing, but 2.15 raises the stakes, and `PoTenants.tsx` advertises "N / 14 modules enabled" as if it binds the workspace. | OPEN — needs a product call, see AZ-009 |
| BUG-082 | Billing showed a Roots customer no way to upgrade | S2 | `upgradeable_plans()` only returns plans with a `paddle_price_id`, and all three are NULL — so the Plans section rendered `plans.length > 0 === false` and simply did not appear. Harmless while menus were cosmetic; once 2.15 made plan gating real, a Roots customer hit a locked feature with no route forward. **FIXED 2026-08-05 (Stage 2.11):** when no gateway is purchasable, Billing lists the plain `plans` catalogue with a "Contact us" mailto. | FIXED |
| BUG-083 | A leftover sandbox Paddle token makes "is the gateway live?" answer wrong | S3 | `.env.development` carries `VITE_PAYMENTS_CLIENT_TOKEN="test_73c01e…"` from the original prototype while every `paddle_price_id` is NULL. Gating on the token alone reports "gateway live", renders the Paddle branch, finds zero purchasable plans and shows nothing — the exact dead end 2.11 removes. **FIXED 2026-08-05:** `usePaymentsGateway()` requires a token **and** a non-empty `upgradeable_plans()`. | FIXED |

### Found by the LOCK suite run (2026-08-12)

First execution of [REMAINING_TESTS.md](./REMAINING_TESTS.md) §1. Twelve cases run, ten pass;
`e2e/lock-suite.spec.ts` and `src/components/ProtectedRoute.storage.test.tsx` are the executable
record. Four cases contradicted Stage 5.4 and were **rewritten in `Test_Cases.md` rather than
filed** — the design changed on purpose. These three are the real failures.

**All three were addressed the same day.** BUG-090 and BUG-092 are fixed outright — both were the
lock believing something it had not actually checked, and both now have a test that fails if they
come back.

🔴 **BUG-091 is marked MITIGATED, not FIXED, and the distinction is the point.** PBKDF2 raised the
price of a guess by ~2,900× against the attack that found it. It does **not** make a short PIN
strong, and no change to how it is stored can:

| | v1 (unsalted SHA-256) | now (PBKDF2, 310k) |
|---|---|---|
| 10⁶ (6-digit), the Node script that found this | 30 s | **0.9 days** |
| 10⁴ (4-digit), same script | 0.3 s | 13.5 min |
| 10⁶ on one commodity GPU (hashcat, ~30 kH/s) | milliseconds | **~33 s** |
| 10⁴ on one commodity GPU | milliseconds | ~0.3 s |

Four to six digits is 13–20 bits. An attacker who takes a copy of this device's storage gets
through that whatever it is hashed with, so the two things that actually move the needle are the
**length** (hence the 6-digit default) and **not reusing the PIN elsewhere** (hence the new line in
the `PinSetup` copy, which is where a user can still act on it).

Closing it properly means the stored record must stop being verifiable off the device at all —
realistically a non-extractable `CryptoKey` in IndexedDB mixed into the hash, so an exfiltrated
`localStorage` dump is inert. **Not done deliberately:** IndexedDB can be evicted independently of
`localStorage` in some browsers, which would make a correct PIN silently stop working, and a lock
that intermittently rejects the right PIN is worse for users than the residual risk on a feature
that is explicitly not the security boundary. Revisit only if the lock is ever asked to be one.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-090 | **A page reload — or a second tab — unlocks the app without the PIN** | S2 | LOCK-006 | `supabase-js` calls `_notifyAllSubscribers("SIGNED_IN", …)` from `_recoverAndRefresh()` whenever it restores a stored session on load. `useAuth.tsx:31` read any `SIGNED_IN` as a genuine password login and called `markUnlocked()` + `setPasswordAuthNow()`. The comment two lines above it — "a restored session on a new tab fires INITIAL_SESSION instead, so it stays locked" — is simply not what the library does. Three consequences: a second tab rendered the dashboard with no prompt; **F5 on the lock screen opened the app**, so pressing Lock and walking away protected nothing; and the 12-hour anchor was re-stamped on every page load, so the password step in LOCK-008 never fell due in ordinary use. Captured by hooking `Storage.prototype.setItem` in a probe run: `markUnlocked ← useAuth.tsx:43 ← _notifyAllSubscribers ← _recoverAndRefresh ← _initialize`, and `unlocked` going `null → 1` across a reload of a locked tab. | **FIXED 2026-08-12.** The event cannot distinguish the two cases, so the sign-in declares itself: `markSignInIntent()` writes a per-tab marker immediately before any call that asks for a credential (`Auth.tsx` sign-in / sign-up / Google, `PoLogin.tsx` password and secret), and `useAuth` unlocks only when it can `consumeSignInIntent()`. Restoring a session never sets the marker, so it never unlocks. Failed attempts clear it. `ResetPassword.tsx` unlocks directly instead — it arrives as `USER_UPDATED`, and a marker left there would sit unspent until some later restore picked it up. `LockScreen` already unlocked itself and was left alone. Regression: the LOCK-006 e2e (both halves) plus four unit tests on the marker |
| BUG-091 | The stored PIN hash gives up the PIN in about half a minute | S3 → S4 | LOCK-011 | `hashPin()` was a single unsalted `SHA-256("finroot:<uid>:<pin>")`, and the uid is not a secret — it is the second half of the `finroot.pin.<uid>` key the hash is stored under. Measured, not estimated: a plain Node script recovered a 6-digit PIN in **27.8 s**, the full 10⁶ keyspace in ~30 s, and 4-digit PINs in well under a second — on one core, with an `await` per candidate. This discloses nothing the account password does not already protect, and the lock is documented as a curtain rather than a security boundary. It matters because a PIN is the one credential people reliably reuse: recovering it here hands over a phone or card PIN too. | **MITIGATED 2026-08-12, deliberately not closed — read the note below.** PBKDF2-SHA256, 310,000 iterations, 16 random bytes of salt per PIN, stored as a versioned record. The same attack script now needs **0.9 days** instead of 30 s for 10⁶ — a ~2,900× rise — and a real browser pays 151 ms per unlock, which nobody notices. A v1 digest still verifies once and is re-hashed in place, so no existing device is locked out, and `verifyPin` re-hashes anything below the current iteration count, so raising it later is free. The PIN offer now defaults to **6 digits**, not 4 |
| BUG-092 | `isUnlocked()` answers "yes" when it cannot read the answer | S4 | LOCK-012 | `appLock.ts` returned `true` from the catch. LOCK-012 as specified passed — blocking `localStorage` leaves the gate at the PIN offer and never at the app — but the same failure on the other store was fail-open: with the PIN and the choice readable in `localStorage` and `sessionStorage` throwing, `ProtectedRoute` rendered the dashboard with no prompt at all. Found by a component-level probe while running LOCK-012. | **FIXED 2026-08-12.** The catch returns `false`. It locks nobody out: `LockScreen` calls `onUnlocked()` as well as `markUnlocked()`, so the PIN still opens the app for the life of the page and only a reload asks again — which is what a browser with no storage should do. LOCK-012 was rewritten to specify both stores, and the component test now covers the half that was actually open |

### Found by the UI / A11Y / RESP suite run (2026-08-12)

First execution of [REMAINING_TESTS.md](./REMAINING_TESTS.md) §2. Twenty cases run: 14 pass, 4 fail,
2 blocked on equipment this machine does not have. `e2e/ui-a11y.spec.ts` and
`e2e/cross-browser.spec.ts` are the executable record; `axe-core` was added as a devDependency
because UI-T02 specifies an axe scan and a hand-rolled contrast checker would be the less
trustworthy of the two.

🔴 **Three of these four are accessibility defects, and two of them are in the sign-in page** —
the one screen every user meets before they have any stake in the product.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-093 | **`/auth` has no `<main>`, and five of six public routes have no skip link** | S3 | UI-T03 | Stage 4.8 added the landmark and the skip link to `Landing.tsx` and `DashboardLayout.tsx` and stopped there. `Auth.tsx:211` opens on a bare `<div>` — no landmark at all, so "jump to main content" has nothing to jump to and a screen-reader user has no way to skip the header. `PublicLayout.tsx` has the `<main>` but no skip link, which covers `/privacy`, `/terms`, `/support` and `/status`. Confirmed identically in Chromium and WebKit. Only `/` is complete. The fix is the same three lines Landing already carries, in two more files | **FIXED 2026-08-13.** `SkipLink.tsx` extracted (one definition instead of four copy-pasted ones, which is how two routes went missing) and wired into `Auth.tsx`, `PublicLayout.tsx`, `Landing.tsx` and `DashboardLayout.tsx`; `Auth.tsx` now renders its content inside `<main id="auth-main" tabIndex={-1}>`. Side effect worth knowing about: this broke an unrelated test assumption at a distance — see BUG-102 |
| BUG-094 | Text below the AA contrast floor on the sign-in page and every app route | S3 | UI-T02 | axe `color-contrast`, measured in both reachable themes. Two classes. **Broken:** `/auth` `.mb-6` at **1.36:1** (`#1e293b` on `#08090d` — dark slate on near-black, effectively invisible), and `kbd` at **2.24:1** (`#505966` on `#1f2229`) on every app route. **Marginal:** the muted-foreground token at **4.24–4.43:1** against the 4.5 AA needs, which is what the table headers, hints and secondary copy inherit — one token adjustment fixes the whole tail of it. ⚠️ Worth knowing for any re-test: the theme is a `finroot.theme` localStorage value read by `ThemeContext`, **not** `prefers-color-scheme`, so `emulateMedia({colorScheme})` scans the same theme twice and reports it as "both" | **FIXED 2026-08-13,** at the token level rather than per-instance, each computed against the surface that actually binds (not just `--background`, which understates the real floor): obsidian `--muted-foreground` 50%→56% (binding surface is `--muted`, 4.71:1), light `--primary` 34%→26% (binding surface is the active-tab tint, 4.62:1) and light `--success` 36%→28% (4.97:1). The `.mb-6` tagline on `/auth` moved off a hardcoded hex onto `text-muted-foreground`. The shared `TabsTrigger` active state (`ui/tabs.tsx`) was the recurring offender — a translucent `bg-primary/15` tint with matching-hue `text-primary` on top, whose contrast depended on whatever page it sat on and landed anywhere from 4.19 to 4.44 across the app's tab bars, never reliably over 4.5 — replaced with a solid `bg-primary`/`text-primary-foreground` fill, a fixed pair with a verified ratio regardless of context. Two more raw Tailwind literals (`NetWorthTrend`'s "Assets" figure, `PortfolioList`'s "Live" badge) moved to the `--success` token they should have used from the start |
| BUG-095 | The middle carousel dot has a 13px hit area, not the 24px it was built for | S4 | UI-T04 | Stage 4.7 gave the testimonial dots `before:-inset-[9px]`, turning a 6px dot into a 24×24 target — vertically. Horizontally the dots sit 8px apart, so **adjacent enlarged boxes overlap** and the later sibling wins the contested strip. Measured effective hit areas: Voice 1 (active) 39×23, **Voice 2 13×23**, Voice 3 23×23 — the middle dot is squeezed from both sides and the right half of it activates the next slide instead. WCAG 2.5.8 is not met for any dot that has neighbours on both sides, and with more testimonials every interior dot is a 13px target. `tap-targets.spec.ts` did not catch it because it clicks 9px *above* the dot, on the axis that works | **FIXED 2026-08-13.** `gap-2` → `gap-[18px]` in `Voices.tsx`: a 6px dot plus an 18px gap puts centres exactly 24px apart, so the enlarged hit areas tile edge-to-edge with nothing contested. Changing either number without the other reopens this |
| BUG-096 | The app has no offline handling of any kind | S3 | UI-T15 | Going offline produces no message anywhere in the shell. Not a missed edge case — `navigator.onLine` and the `offline`/`online` events appear **nowhere in `src/`**, so there is no code that could report it. The shell itself survives (React Query keeps the last render), which is the dangerous half: the app looks live and current while showing stale figures, and a write attempted in that state fails with a generic toast rather than "you are offline". A personal-finance app that quietly shows yesterday's balances is making a claim it cannot support. 🔴 **UI-T17 made this worse, not better:** the service worker genuinely serves a cached shell offline (verified), so in production the app loads perfectly with no network and still says nothing. The offline shell is only an asset once something tells the user what they are looking at | **FIXED 2026-08-13.** `hooks/useOnline.ts` wraps `navigator.onLine` + the `online`/`offline` events; `DashboardLayout` renders a `role="status" aria-live="polite"` banner ("Figures shown were last loaded while connected and may be out of date…") whenever it reports false. Deliberately **not** wired into anything that gates writes — the write attempt itself is the honest connectivity test, and TanStack Query already retries |

**UI-T08 and UI-T17 were unblocked on a second pass (2026-08-12).** Both had been recorded as
manual-only, and both turned out to be mostly mechanical. A control with no accessible name is
unusable in NVDA, JAWS and VoiceOver alike and you need none of them to find it; installability is
a checklist the browser evaluates without any help from a human. What is genuinely left is
narrow — see the residuals in [REMAINING_TESTS.md](./REMAINING_TESTS.md) §2 — and running the rest
found BUG-097.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-097 | **Controls a screen reader cannot announce, on six of seven routes** | S3 | UI-T08 | axe, restricted to the rules that decide whether something can be announced at all. Two **critical**: `button-name` on `/app/income` and `/app/budget` — Radix select triggers rendering as a bare `button` with no text, no `aria-label` and no labelled-by, which a screen reader reads out as "button" and nothing else; and `aria-valid-attr-value` on `/app/income` (`#radix-:r2m:-trigger-income` points at an id that is not there, so the association is silently dropped). One **serious**: `aria-hidden-focus` on `/` — focusable content inside an `aria-hidden` subtree, so the tab order visits something no screen reader will read. Then `heading-order` on five routes (an `h3` following an `h1` with no `h2`, which breaks heading navigation — the primary way screen-reader users skim a page) and `region` on every app route (the sidebar's labels and nav links sit outside any landmark). The landmark failures on `/auth` are BUG-093 seen from the other side | **FIXED 2026-08-13.** `aria-label` on the Radix select triggers (income-type and category filters) and on every icon-only row action, naming the row too ("Edit `<description>`") so a table doesn't read as twenty identical "Edit, button". `AppSidebar`'s `<Sidebar>` gained `role="navigation" aria-label="Main"`. The `aria-valid-attr-value` case was a Radix `Tabs` with **no `TabsContent` anywhere** — never a real tablist, since there was no panel for `aria-controls` to point at; replaced with a `role="group"`/`aria-pressed` toggle, which is what the income/expense switch actually was. `aria-hidden-focus` was a decorative dashboard-mock button inside an `aria-hidden` subtree; `tabIndex={-1}` takes it out of the tab order without touching its click handler. 16 stray `<h3>` section headings promoted to `<h2>` app-wide (they sit directly under each page's `<h1>`; the one exception, `PortfolioDonuts.tsx`, is correctly nested under a real `<h2>` and was left alone). A full regression run afterward caught one the first pass missed by matching only the section-card class idiom: `ExpenseLedger.tsx`'s per-day group heading was an `<h4>` with nothing in between it and the freshly-promoted `<h2>` — demoted to `<h3>`, the correct level for a genuine sub-heading of that section. Swept the whole tree afterward for any remaining `<h4>`/`<h5>`/`<h6>`; only `ui/alert.tsx`'s `AlertTitle` (`<h5>`) remains, unflagged on every route this suite reaches |

---

### Found during the UI/A11Y bug-remediation session (2026-08-13)

Not from running a numbered case — found while doing the full-regression verification pass that
should follow any fix touching shared markup, and specifically because BUG-093 added a landmark to
a route that had never had one.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-102 | Fixing BUG-093 broke `lock-suite.spec.ts`'s 12-hour-rule test, and the sign-out button had a pre-existing ordering bug that made it worse | S4 | — (found in regression, not a register case) | Several e2e specs use "some `<main>` on the page is non-empty" as their signal that sign-in has finished — which only ever worked because `/auth` was the one route with no `<main>` at all. Once BUG-093 gave it one, that signal could be satisfied while the app was still on `/auth`, before the `SIGNED_IN` handler that resets `finroot.pwdauth.<uid>` had actually run. `lock-suite.spec.ts`'s 12-hour test rewinds that clock manually right after signing in, then asserts the password-reauth screen appears — traced with instrumented `onAuthStateChange` logging: the manual rewind wrote correctly, then ~200–500ms later the real (delayed) `SIGNED_IN` event fired and silently overwrote it back to "now", so the PIN screen showed instead of the password screen. 100% reproducible, not a flake. Separately, and part of why the gap was wide enough to hit: `DashboardLayout.tsx`'s and `LockScreen.tsx`'s "Sign out" handlers both called `navigate("/", { replace: true })` **before** `await signOut()`, leaving a window where a fresh `/auth` load could still find a valid session and bounce straight back to `/app` | **FIXED 2026-08-13.** Sign-out order swapped in both files (`await signOut()` before `navigate`). `lock-suite.spec.ts`'s local `signIn()` now waits for the URL to actually leave `/auth` (`expect(page).not.toHaveURL(/\/auth/)`) before returning — the one signal that only flips once `user` is genuinely set, immune to any route's `<main>`. Re-run clean three times in a row after the fix; the other 6 specs using the `<main>`-not-empty idiom were audited and all call it only after `signInAndUnlock()`, which branches on body text rather than element presence and was never vulnerable to this |

---

### Found by the AUTH suite run (2026-08-13)

First execution of [REMAINING_TESTS.md](./REMAINING_TESTS.md) §3. 23 cases run: 17 pass, 5 fail,
1 blocked (AUTH-015, on Supabase's built-in-mailer rate limit — shared bucket with signup
confirmation mail, exhausted by AUTH-001/005/014 earlier in the same session). AUTH-021 was run
last, per the file's own caution, since a real finding there would have burned the account's
sign-in budget for everything after it — moot this time, see BUG-101.

🔴 **One of these is a security gap in the primary auth path, not the admin one.** CLAUDE.md's
"Current status" already flags `po-auth` as unthrottled (BUG-006/007); BUG-101 is the same defect
on `supabase.auth.signInWithPassword` itself, which every account depends on, not just the sixteen
platform admins.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-098 | Signing up with an already-registered, confirmed email claims success | S3 | AUTH-005 | GoTrue's anti-enumeration behavior for a duplicate **confirmed** email returns `{data:{user:null,session:null}, error:null}` — no error, by design, so an attacker cannot tell the address exists. Confirmed directly: `supabase.auth.signUp({email:"demo@finroot.app", ...})` from the console returned exactly that shape. `Auth.tsx`'s `handleSignUp` only branches on `error`, never on `data.user === null`, so it falls into the success path: toasts "Account created. Check your email to confirm.", calls `recordLegalAcceptance()` for a user that does not exist, and — worse — overwrites the saved-profile chip for that email with whatever name was typed into a form that never created anything. A real user who fat-fingers their way into signing up a second time is told to go check an inbox that will stay empty forever, with no hint that the fix is to sign in instead | **FIXED 2026-08-17.** `Auth.tsx`'s `handleSignUp` now destructures `data` too and checks `data.user.identities?.length === 0` (GoTrue's documented anti-enumeration signal), showing a neutral message that's true either way ("If that's a new email, check your inbox... Already have an account? Sign in instead.") instead of a hardcoded false "Account created." Also clears the sign-in intent marker in that branch since no real auth transition happens. |
| BUG-099 | An expired or already-used password-reset link leaves the page waiting forever, with no error | S4 | AUTH-017 | `/reset-password` shows "Waiting for your secure reset link to be verified…" and a disabled form until `onAuthStateChange` fires `PASSWORD_RECOVERY` or `SIGNED_IN`, or `getSession()` finds a session. Navigated directly with `#error=access_denied&error_code=otp_expired&…` (the hash Supabase attaches to a dead recovery link) and with no hash at all: **identical copy, identical disabled form, forever** — nothing distinguishes "your link already worked once", "your link expired", and "you have no link at all". `errorMessages.ts` exists precisely so the rest of the app does not do this (BUG-012); this page is the one screen that still can | **FIXED 2026-08-17.** `ResetPassword.tsx` now checks the URL for Supabase's `error`/`error_code` params (what an expired/reused link actually redirects back with) on mount and shows a real "This link isn't working" card with a path back to `/auth`, instead of relying on an event that never fires. Also added a 15s timeout fallback for the no-error-param-but-never-ready case (stripped URL, etc.), clearing itself the moment a real `PASSWORD_RECOVERY`/session arrives. |
| BUG-100 | An invalidated session fails silently into misleading empty states instead of redirecting to `/auth` | S2 | AUTH-023 | Signed in, then overwrote the stored `access_token`/`refresh_token` in `localStorage` to simulate a revoked session (matches the precondition: "revoke the session server-side"). Every subsequent data fetch returned **401**, and `get_effective_menus` logged `PGRST301 — JWT cryptographic operation failed` to the console — but the UI showed none of it. `/app/accounts` rendered "0 active accounts", stayed on `/app/accounts` for 3+ seconds with no redirect, and never surfaced a toast. `toUserMessage()` already maps `PGRST301` to "Your session has expired. Please sign in again." (`errorMessages.ts`); nothing on this path calls it. For a finance app, silently rendering "0 accounts" for a user whose session merely expired is worse than an ugly error — it reads as data loss | **FIXED 2026-08-17, globally rather than per-page.** Added `isSessionExpiredError()` to `errorMessages.ts` (PGRST301/401/jwt-expired detection) and wired it into `App.tsx`'s `QueryClient` via `QueryCache`/`MutationCache` `onError` — catches it regardless of which hook made the failing call, calls `notifyError`, signs out, and hard-redirects to `/auth`. Guards against redirect loops (already on `/auth`) and double-firing. |
| BUG-101 | No rate limiting or lockout on `signInWithPassword`, for any account | S2 | AUTH-021 | 20 wrong passwords against `demo@finroot.app`, back to back, no delay: `for (let i=0;i<20;i++) await supabase.auth.signInWithPassword(...)` completed in **5.7 s**, all 20 returning a plain `invalid_credentials` / 400 — no 429, no lockout, no growing delay. Confirmed the account was never actually blocked either: the 21st attempt, with the correct password, signed in normally. This is CLAUDE.md's `po-auth` finding (BUG-006/007 — no rate limit, no lockout, brute-forceable) restated for the sign-in path every account uses, not only the sixteen-digit PO secret. A finance app with unthrottled password guessing on every user account is a materially larger attack surface than the admin console alone | OPEN |

---

### Found by the TXN suite run (2026-08-13)

First execution of [REMAINING_TESTS.md](./REMAINING_TESTS.md) §5. 15 cases run: 14 pass, 1 fail. All
test writes were made against and then deleted from the real `Demo Owner's Workspace` fixture.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-103 | The "Add income" transaction dialog's own submit button says "Add expense" | S4 | TXN-002 | `TransactionDialog.tsx` branches its `DialogTitle` correctly on `activeType` (line 357-358: shows "Add income" for an income-context dialog, confirmed live), but the submit button at line 537 is hardcoded to `"Add expense"` in every branch except `isEdit`/`debtMode`/`splitOn` — there is no `: "Add income"` fallback. Confirmed the data path is unaffected: submitting through this exact dialog with `type="income"` context produced a real `transactions` row with `type: "income"`, correct amount and category — only the button's own label is wrong. The note-field placeholder has the same one-sided miss: `"e.g. October salary"` shows on the expense form too | **FIXED 2026-08-17.** `TransactionDialog.tsx`'s submit button now reads "Add income" when `activeType === "income"`, "Add expense" otherwise (edit/debt/split states unchanged). The note-field placeholder was not touched — separate, smaller finding, not re-verified this pass. |

---

### Found by the REC suite run (2026-08-13)

First execution of [REMAINING_TESTS.md](./REMAINING_TESTS.md) §6. 10 cases run: 9 pass, 1 fail.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-104 | Marking a recurring item paid/received is two independent writes with nothing to stop a retry double-posting | S2 | REC-003 | `useMarkRecurring()` (`useRecurring.ts:142-181`) does an `INSERT` into `transactions` and then, as a **separate** `UPDATE` on `recurring_items`, advances `next_due_date` — no RPC, no DB transaction wrapping the two. `transactions.source_recurring_id` carries only a plain index (`idx_transactions_source_recurring`, migration `20260528093432`), no unique constraint on `(source_recurring_id, occurred_at)` or similar. **Reproduced directly**, not inferred: called the same insert the mutation makes twice in a row for one recurring item, both succeeded with zero error, and `source_recurring_id` came back with 2 rows. In practice: the UI does disable "Mark paid" while its own mutation is in flight (`disabled={mark.isPending}` in `RecurringList.tsx:288`), which blocks a rapid double-click — but if the first statement succeeds and the second one fails or times out (network blip, tab backgrounded), `next_due_date` never advances, the item still shows as due, the button re-enables, and the natural next action — clicking "Mark paid" again — silently posts a second transaction for the same due date. Real money, double-counted, with no error anywhere in the path | **FIXED (code), NOT DEPLOYED 2026-08-17.** New migration `20260817120000_bug104_recurring_mark_atomic.sql`: a partial `UNIQUE` index on `transactions(source_recurring_id, occurred_at)`, and a new `SECURITY DEFINER` `mark_recurring_generated(p_item_id)` RPC that row-locks the item and does both the transaction insert and the `next_due_date` advance in one call, mirroring the client's `bumpDate()` month/year clamp exactly (same Jan-31→Feb-28/29 logic as BUG-038). `useRecurring.ts`'s `useMarkRecurring()` now calls the RPC (via a temporary `rpcUntyped` shim, documented TODO to remove once `types.ts` regenerates) instead of two separate writes. Added a friendly constraint message for the new unique index. Not yet live — same `SUPABASE_ACCESS_TOKEN` blocker as the other undeployed fixes. |
| BUG-105 | Every reminder's default message says "is due tomorrow", regardless of when it's actually due | S4 | REC-008 (found alongside, not the case's own assertion) | `remindersStore.ts:77-88`, `defaultMessage()`, `case "fixed_due"` returns the literal string `` `Reminder: Your ${name} payment is due tomorrow.` `` unconditionally — it never reads the reminder's own `due_date`. Confirmed live: created a `fixed_due` reminder with `due_date` = today, and the Reminders page rendered "your QA Reminder REC008 payment is due tomorrow" under an "ACTION REQUIRED" badge for something due *today*. The severity bucketing itself (`priorityBucket()`, same file) is correctly date-aware — danger/warn/safe escalate properly by days-until-due — so the visual urgency is right and only the sentence is wrong, but it is wrong on every reminder that has no custom note, which is the default case | **FIXED 2026-08-17.** `remindersStore.ts`'s `defaultMessage()` now computes the real day-offset (same date-normalization pattern as `priorityBucket()`) and phrases it correctly — overdue/today/tomorrow/in N days — instead of a hardcoded "is due tomorrow". |

---

### Found by the INV suite run (2026-08-13)

First execution of [REMAINING_TESTS.md](./REMAINING_TESTS.md) §11. 11 cases run: 10 pass, 1 fail.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-106 | A stock left with no ticker still renders a fabricated "live" price badge instead of signalling it isn't tracked | S3 | INV-004 | `pickTicker()` (`livePrices.ts:81-86`) falls back through `f.ticker \|\| f.symbol \|\| f.coin \|\| f.scheme \|\| f.name` — so when the ticker field is left blank, it silently substitutes the investment's free-text **display name** and tries to resolve that as a market symbol instead of reporting "no ticker." Confirmed live: saved a stock named "QA No Ticker INV004" with the ticker field empty; `PortfolioList.tsx`'s `tracked = isLiveAsset(r.asset) && tick !== undefined` came back `true` and the card rendered the green "+0.00% Profit" live badge plus a `CURRENT PRICE` row — the exact treatment INV-004 says a genuinely-live holding should get, on a holding that was never given a ticker at all. The `unresolved` bucket `BatchPlan` documents ("Live-asset records with no resolvable ticker; priced from stored values") never gets a chance to apply, because `pickTicker()` makes almost every stock look resolvable | **FIXED 2026-08-17.** `pickTicker()` (`livePrices.ts`) no longer falls back to `f.name`. A record with no ticker/symbol/coin/scheme now correctly returns empty and `resolveSymbol()` reports it as unresolved instead of trying to price the investment's display name as a market symbol. |

---

### Found by the TRIP/INS/NW suite run (2026-08-13)

First execution of [REMAINING_TESTS.md](./REMAINING_TESTS.md) §12.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-107 | Creating a trip is completely broken — a fabricated success toast hides a real, 100%-reproducible insert failure | S1 | TRIP-001 | Two independent bugs stack into total breakage. (1) `NewTripDialog.tsx:95` mints the new trip's id as `` `trip_${Date.now()}` `` — a plain string, not a UUID — while `trips.id` is a `uuid` column; every insert is rejected with Postgres `22P02` ("invalid input syntax for type uuid"), correctly translated by `notifyError()` to "One of those values is not in the right format." (2) `Trips.tsx:158-162`'s `onCreate` callback calls `upsert(t)` **without awaiting it**, then unconditionally runs `setActiveId(t.id)` and `toast.success('Trip "…" created')` on the next line — so the success toast and the error toast both fire, the dialog never closes, and the app switches its "active trip" to an id that was never written to the database. Reproduced twice in a row, both attempts identical: `trips` had zero rows both times a direct query was run immediately after. **Every kind is affected equally** — this is not specific to "Other" (TRIP-002), which is filed against the same root cause; the `other`-kind CHECK constraint itself was separately confirmed fine via a direct insert with a real UUID. TRIP-003 and TRIP-004 were still tested, against a trip inserted directly to route around this bug, and both passed on their own merits | **FIXED 2026-08-15.** `NewTripDialog.tsx:95` now mints `id: crypto.randomUUID()`. `Trips.tsx`'s `onCreate` is now `async` and `await`s `upsert(t)` before `setActiveId`/the success toast. Verified live against a real Canopy-plan tenant, both as a direct authenticated insert and through the actual "Start Trip" UI button: the trip row was created with a real UUID id, appeared in the list, and was cleaned up afterward. Uncovered and fixed a separate, unrelated live bug in the process — see BUG-112 |

---

### Found by the IMP/EXP suite run (2026-08-13)

First execution of [REMAINING_TESTS.md](./REMAINING_TESTS.md) §9. 13 cases run: 9 pass, 2 fail,
2 blocked (IMP-008 — no real bank statement PDF to hand; EXP-003 — Stage 0.10, no viewer account).

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-108 | A malformed CSV row is dropped with no message — "valid rows still import" is true, "clear per-row error" is not | S4 | IMP-003 | Imported a 3-row expense CSV where row 2 had neither a date nor an amount. `parseExpenses()` (`importParsers.ts:230-244`) correctly filters that row out — `Validation Queue` showed the 2 good rows and nothing else — but nothing in `TransactionImporter.tsx` records or surfaces *why* only 2 of 3 rows appear, or that a row was dropped at all. A user importing a real spreadsheet with one bad line has no way to know a row silently went missing rather than never having existed in the source file | **FIXED 2026-08-17.** `parseExpenses()` now returns `{rows, skipped}` instead of a bare array. `TransactionImporter.tsx`'s `runParse` accepts either shape and toasts a warning when `skipped > 0`. Updated the existing `importParsers.test.ts` cases and added a `skipped`-count assertion. `parseIncomeRows` has the identical silent-drop pattern but wasn't touched — out of scope for this specific bug, worth a follow-up. |
| BUG-032 (retested) | `xlsx@0.18.5` has no sandboxing around it, and no npm-published fix exists | S2 | IMP-006 | Already tracked, not new — see the Reconciliation section and CLAUDE.md. Retested here rather than assumed: a live `__proto__`-keyed header cell through `parseExcel()` did **not** pollute `Object.prototype` (that specific naive vector is closed), but `parseExcel()` (`importParsers.ts:151-157`) still calls `XLSX.read(buf)` directly on unvalidated user-uploaded bytes, on the main thread, with no worker isolation and no pre-parse schema check — so any of the version's actual unpatched CVEs (SheetJS stopped publishing security fixes to npm for this line) remain exactly as reachable as before. "Rejected/sandboxed" is not an accurate description of the current state for either half | OPEN, unchanged |

---

### Found by the AUTH-015 retest and the PO suite run (2026-08-15)

AUTH-015 retested (§3, was `BLOCKED` since 2026-08-13) and [REMAINING_TESTS.md](./REMAINING_TESTS.md)
§11 (PO) run for the first time — 12 of 23 done on the one account reachable without Stage 0.10: 9
pass, 3 fail. PO-007 stays `BLOCKED: Stage 0.10` (needs a second, confirmed non-PO account this repo
does not have); PO-014 (plan menus) was deliberately not touched — it edits the Roots plan's module
set shared by a real-looking tenant (`Kartikeyan's Workspace`) this session does not own; PO-018
(coupons) is `BLOCKED` on the same missing Paddle sandbox as the BILL suite, self-documented on the
page itself ("no payment gateway is configured"). PO-015/016/017 (pricing page, branding, logo size)
were run against the live `site_settings` row this dev server shares with the deployed app —
each verified from a genuinely separate, signed-out browser tab (the first attempt reused "seed"'s
session and proved nothing) and then restored to its exact original value via `po_set_site_setting`,
the same RPC the UI uses; a direct `.update()` on `site_settings` was tried first and silently
matched zero rows under RLS, which is correct — the table has no client-writable path, only the
SECURITY DEFINER RPC does. A throwaway tenant (`PO Suite Check (temp)`, owned by `demo@finroot.app`,
same pattern as `Upsell Check (temp)`/`Onboarding Check (temp)`) was created, suspended, reactivated,
re-planned and deleted+purged for PO-010…013; nothing of it remains. `demo@finroot.app` had no PO
secret code or custom identifiers configured before this session (`/po/security` read "No secret
code set" and both IDs "Not set") — a code, a User ID (`finroot_owner`) and a Number ID (`700105`)
were set to make PO-002/003/004/020/021 runnable at all, then the secret was rotated once more (to
verify PO-020's "old code rejected, new works") and left active with the new value on record here:
`1010669029191078`. Revoke it from `/po/security` if a persistent secret on the demo account is
undesired.

🔴 **AUTH-015 is not the mailer rate limit it was recorded as on 2026-08-13 — it is a different,
newly-reproducible failure specific to one address.** `supabase.auth.resetPasswordForEmail("demo@finroot.app", …)`
returns `400 email_address_invalid` ("Email address \"demo@finroot.app\" is invalid") on two clean
attempts made over an hour apart in this session (a burst of adjacent probing in between briefly hit
the real `429 over_email_send_rate_limit` too, from testing volume, not from this bug — that one
cleared on its own). In the same session, `resetPasswordForEmail` on a nonexistent address, a Gmail
address, another `@finroot.app` address and another `.app`-TLD address all returned GoTrue's normal
anti-enumeration "success" response — only the one real, confirmed, currently-signed-in-with
`demo@finroot.app` (confirmed healthy: `signInWithPassword` on it succeeds normally,
`email_confirmed_at` is set, the address is a clean 16 characters with no whitespace) trips this. Not
verified against Supabase Auth's dashboard/logs (no access from here), but the shape of the failure —
GoTrue accepting the address for every other purpose while refusing to *send mail to* it specifically
— matches a bounce-suppression flag more than a validation bug: this address has received dozens of
confirmation/reset emails across every session since 2026-08-05 with no real mailbox behind
`finroot.app` to receive them, which is exactly what trips a sender's bounce-suppression list.
Whatever the mechanism, the practical effect is the same either way: **the one seeded account this
whole test suite runs against cannot complete its own password-reset flow**, reproducibly, not just
under a temporary rate limit | AUTH-015 | OPEN — see BUG-111 below |

| ID | Title | Sev | Case | Detail | Status |
|---|---|---|:-:|---|---|
| BUG-109 | No PO sign-in — success or failure — writes to `audit_log`, contrary to the "PO logins are audited" requirement | S2 | PO-006 | Signed in to `/po/login` three times this session (password once, secret twice) as the only platform admin in the project; `/po/audit` and the `/po` overview's own "Recent Activity" feed never gained a new row for any of them — the newest entries stayed pinned to the `tenant.*`/`site.setting.*` actions from testing PO-009 through PO-021, which *are* logged, because those go through RPCs. Traced why: `po-auth/index.ts` (the edge function backing both password-resolve and secret-verify) never calls `log_audit` or writes to `audit_log` anywhere, and `PoLogin.tsx`'s `finish()` — the only client code that runs after a successful sign-in — calls `is_platform_admin()` and navigates, nothing else. Every other write path in the PO console goes through a SECURITY DEFINER RPC that logs itself; sign-in is the one path that goes straight to `supabase.auth.signInWithPassword`/`verifyOtp`, which has no hook into that pattern. This is CLAUDE.md's Stage 1.4 gap ("no PO sign-in is audited") — flagged there narratively since 2026-08-12 but never given its own bug id or executed against a live account until now | **FIXED (code), NOT DEPLOYED 2026-08-15.** `po-auth/index.ts` now writes directly to `audit_log` (service_role has `ALL` on the table; `log_audit()`'s RPC was deliberately not used because it stamps `actor_user_id` from `auth.uid()`, which is empty in a service-role context — the resolved `user_id` from `po_resolve_identifier`/`po_verify_secret` is used instead) on both success and failure of the resolve and secret steps, per PO-006's own wording that "audited" means both. `tenant_id` is always `NULL` (po-auth is platform-level), so `audit_select`'s RLS restricts these rows to platform admins. **Not yet live** — this repo has no `SUPABASE_ACCESS_TOKEN`/CLI access to run `supabase functions deploy po-auth` this session; someone with deploy access needs to ship it before `/po/audit` will actually show PO sign-in rows |
| BUG-110 | A tenant with no `menu_overrides` shows "14/14 modules" and silently offers to *grant* every module — including ones its plan does not include — the moment its module panel is saved | S3 | found alongside PO-009/PO-010, not either case's own assertion | `PoTenants.tsx:78`: `map[row.id] = overrides?.allow ?? [...ALL_MENU_IDS]` — when `tenants.menu_overrides` is `null` (true for every tenant that has never had its modules hand-edited, including a brand-new one the instant after creation before this bug's own fix would apply), the row's `currentModules` is assumed to be *all fourteen* modules, not the plan's actual `menu_set`. Confirmed live against two real, unmodified tenants: `QA Auth001's Workspace` and `Kartikeyan's Workspace`, both on the `Roots` plan whose `plans.menu_set` is 8 items (`dashboard, income, expenses, budget, goals, calculator, reminders, accounts`), both display "14/14 modules" in the Tenants list and both have `menu_overrides: null` confirmed via a direct table read — the true effective set for a Roots tenant is 8, not 14. The consequence is worse than the display: `TenantModulesPanel.tsx` seeds its toggle grid from that same wrong `currentModules`, so a PO opening "Customize modules" for either of these tenants sees all 14 modules already checked, and toggling even one *unrelated* module off and clicking Save calls `po_set_tenant_menus` with the other 13 as `allow` — permanently granting a free-tier tenant paid-tier module access via override, silently, as a side effect of what looks like a narrower change. Reproduced the read half live; the write half is derived from a direct code read of `TenantModulesPanel.tsx:28-38` rather than executed against either real tenant, to avoid actually granting `Kartikeyan's Workspace` extra access as a side effect of testing it. The fix has to happen at the source of the fallback (`PoTenants.tsx:78`, and its second occurrence at `PoTenants.tsx:202`): compute the plan's own `menu_set` as the fallback instead of `ALL_MENU_IDS` | **FIXED 2026-08-15.** `PoTenants.tsx` now fetches `plans.menu_set` alongside `id, name` and resolves each tenant's fallback (both the `78` and `202` occurrences — the latter refactored into a shared `planMenus(planName)` helper) to its own plan's menu set, falling back to the plan flagged `is_default` (not a hardcoded `'Free'` — that name was already retired to `'Roots'` by `20260805180000_stage2_pricing_catalogue.sql`, which is itself worth noting: the original fallback-by-name bug pattern had already bitten this exact function once before). Verified live: `QA Auth001's Workspace` and `Kartikeyan's Workspace` (both `Roots`, real `menu_set` 8 items) now show "8/15 modules" instead of "14/14"; `Demo Owner's Workspace` (`Canopy`, `menu_set: ["*"]`) correctly shows "15/15" |
| BUG-111 | `demo@finroot.app` — the one seeded account every test suite in this repo signs in as — cannot complete its own password-reset request | S2 | AUTH-015 | See the narrative note above this table for the full trace. `resetPasswordForEmail("demo@finroot.app", …)` returns `400 email_address_invalid`, reproducibly, on an account that is otherwise completely healthy (`signInWithPassword` succeeds, email is confirmed, no formatting issue), while every other address tried in the same session — including three that were never seen before this session — gets the ordinary success response. Leading hypothesis, not confirmed: a mail-provider bounce-suppression flag on an address that has received dozens of confirmation/reset emails with no real inbox behind `finroot.app` since 2026-08-05, but this was not checked against Supabase's own Auth logs/dashboard, which this environment has no access to. Whoever does have dashboard access should check the project's Auth → Logs for `demo@finroot.app` and, if it is a suppression flag, either use a real, receivable domain for the seed account going forward or clear the suppression. Until then, AUTH-015 cannot pass as specified — every retry will hit the same wall, not a clearing rate limit, so a future session should not re-burn time re-attempting this expecting a different result | OPEN |
| BUG-112 | `finroot.tenant.current` can point at a soft-deleted workspace forever, silently breaking every write with a raw Postgres error | S1 | found while verifying BUG-107 | `TenantContext.tsx`'s "keep `currentTenantId` valid" effect only checked `memberships.some(m => m.tenantId === currentTenantId)` — membership rows for a *soft-deleted* tenant stay `status: 'active'` (only `tenants.status` itself becomes `'deleted'`; nothing prunes `tenant_members`), so a stored id pointing at a deleted workspace read as "still valid" forever. Found by accident testing BUG-107's trip-creation fix on `demo@finroot.app`: its `localStorage` held the id of `Onboarding Check (temp)`, a QA throwaway tenant soft-deleted the same session it was created (2026-08-15, this repo's own PO-010…013 run) — the account is *owner* of 3 tenants (2 deleted QA leftovers + 1 real), and whichever loaded first became "current" with no re-check. Every RLS-gated insert/update/delete on that account failed with a bare `{code: 42501, message: "new row violates row-level security policy…"}` and no indication why — reproduced directly via `supabase.from('trips').insert(...)`, and via the real "Start Trip" button, both against the wrong tenant. `WorkspaceSwitcher.tsx` compounded it: it lists every membership with no deleted-state filter or label, so a user could switch *into* a deleted workspace as easily as switch away from one. This is the same family of QA-account cross-contamination the DONE block above already flagged once this session ("the user was briefly on the wrong Supabase project… caught by hitting the real project's REST API directly") — a second instance of test debris silently steering a live session | **FIXED 2026-08-15.** `TenantContext.tsx`'s validity check and fallback now both require `m.status !== "deleted"`; `WorkspaceSwitcher.tsx` filters its list the same way (and — sensibly, since `Demo Owner's Workspace` is the only non-deleted membership left — now renders nothing, matching its own documented single-workspace behavior). Verified live: forced `localStorage` back to the deleted tenant's id, reloaded, and the app self-corrected to the real workspace without user action; confirmed the switcher no longer offers either deleted tenant. The two stale `tenant_members` rows for the deleted QA tenants were left as-is — cosmetic once the app stops trusting them as "current", and `demo@finroot.app`'s ownership of both is itself a byproduct of QA account reuse worth a look next time someone is doing QA-tenant cleanup, not this fix's job |
| BUG-113 | Inviting an existing user to a workspace creates no notification for them | P1 | NOTIF-001 | Ran a real `create_invitation()` → `accept_invitation()` round-trip as part of the Stage 0.10 NOTIF/WS suite (2026-08-15, accounts provisioned same session) — the invitee, a real second harness account, gained zero rows in `notifications`. Root cause: `create_invitation()` (`supabase/migrations/20260806190000_stage3_invitations.sql`), the function `WorkspaceManage.tsx` actually calls, never calls `create_notification()`. It's a regression, not an original gap — `20260604230000_phase6_notifications_audit.sql` had added exactly that call to the OLD `invite_member()`, and Stage 3.8 replaced `invite_member` with the token-based `create_invitation`/`accept_invitation` flow without carrying it over. Confirmed by direct contrast in the same session: calling the legacy (still-present, app-unused) `invite_member` on the same invitee DID produce a notification; calling the real `create_invitation` path, for an identical invite, did not. `accept_invitation()` and `claim_invitations_for_user()` (the sign-up-time claim path) also have no notification call, so an invitee is never told at any point in the flow, not just at invite time | **FIXED (code), NOT PUSHED 2026-08-15.** `supabase/migrations/20260815080000_notif001_invite_notification.sql` adds a `create_notification` call to `create_invitation()`, fired at invite time (not accept time) so it needs no extra lookup of whether the invitee already exists beyond checking `auth.users` for the address — if they don't have an account yet, the notification simply has no reader until they sign up and claim it, same as an email would. Blocked on `SUPABASE_ACCESS_TOKEN` for `supabase db push`, same as BUG-006/BUG-022/BUG-109 |

**Same-day follow-up: PO-007/014/018, at the user's explicit request to unblock each.** The three
turned out to be three different kinds of blocker, so each got asked about individually before
anything happened:

- **PO-007 — now `PASS`, resolved without Stage 0.10 in the end.** The user offered to toggle
  `mailer_autoconfirm` off via the Supabase dashboard (a path this session's `SUPABASE_ACCESS_TOKEN`
  could technically also drive through the Management API — checked, and declined to use it that way:
  changing a project's auth security config isn't something to do unilaterally, authorized or not).
  Two near-misses caught along the way, both worth remembering for next time: the user was briefly on
  a *different, empty Supabase project* in the same org ("KartikeyanC's Project") rather than Finroot
  — caught by hitting the real project's REST API directly with the anon key (`plans` returned
  Heritage/Roots/Canopy as expected) instead of trusting a dashboard screenshot that read "No users in
  your project" — and briefly on the email *template* editor (`Emails → Confirm sign up`) rather than
  the actual auth-provider toggle, two different sections of the same dashboard. In the end the
  cleanest path needed neither the toggle nor the service-role key: the dashboard's own **"Add user"**
  action creates an account that's auto-confirmed immediately, since it's an admin action rather than
  the public signup flow the confirmation requirement gates. One throwaway account
  (`po007-qa@example.com`) was created this way, used to run both realistic non-PO-access paths, then
  deleted by the user afterward. See §11's own PO-007 line for the full trace and the caveat about
  `finish()`'s dead-code toast text.
- **PO-014 — now `PASS`.** The user explicitly authorized editing the live `Roots` plan directly this
  time (they had declined it earlier in the same day). `goals` was removed from Roots's `menu_set`
  via `po_set_plan_menus`, confirmed via a direct `plans` query, confirmed **both** the edit and the
  restore each wrote a `plan.menus` audit_log row (with actor and before/after metadata), then the
  original 8-item set was restored and re-confirmed byte-for-byte. `Kartikeyan's Workspace` and `QA
  Auth001's Workspace` were briefly on 7 modules instead of 8 for the duration of the test.
- **PO-018 — still `BLOCKED`, but the reason changed.** The user asked for the missing plumbing to be
  built rather than left as a gap. Added: `supabase/migrations/20260815060000_po_set_plan_paddle_price_id.sql`
  (a `po_set_plan_paddle_price_id(p_plan_id, p_paddle_price_id)` RPC, same
  guard/audit shape as `po_set_plan_price`/`po_set_plan_menus` — `is_platform_admin()` check,
  `log_audit('plan.paddle_price_id', …)`), and a "Paddle price id" field + Update button on each plan
  card in `PoPlans.tsx`, wired through the same temporary widened-`rpc` cast pattern
  `legalAcceptance.ts` already uses for an unapplied migration (`supabase.rpc.bind(supabase) as
  unknown as …` — delete it once types are regenerated). `npm run typecheck` is clean. **Discovered
  only by trying to apply it:** this repo has no `SUPABASE_ACCESS_TOKEN` either (`npx supabase
  projects list` → `LegacyPlatformAuthRequiredError`), so the migration cannot be pushed from here —
  the same missing-credential shape as PO-007, on a different credential. Confirmed live that calling
  the un-applied RPC fails cleanly (`PGRST202`, "function ... not found in schema cache", no crash),
  which is the correct, safe state to leave it in. Once someone with `SUPABASE_ACCESS_TOKEN` runs
  `supabase db push`, setting a placeholder `paddle_price_id` on Canopy or Heritage (Roots must stay
  blank — `upgradeable_plans()` filters `price_cents > 0`) is enough to unblock PO-018 for real
  testing; coupon CRUD itself needs `usePaymentsGateway().ready`, not a working Paddle checkout.

**Update, same day: the user provided `SUPABASE_ACCESS_TOKEN` directly, and PO-018 is now `PASS`.**
`supabase link --project-ref ludbntvhagefadfkhrjj` then `supabase db push` applied all four pending
migrations in one pass — the PO-018 RPC above, plus the three CLAUDE.md had listed as pending since
2026-08-11/12 (legal acceptance, account deletion, analytics). Types were regenerated via Bash
redirection (`> src/integrations/supabase/types.ts`, not PowerShell's `Out-File`, which would add a
BOM and CRLFs) and the temporary widened-`rpc` casts in `legalAcceptance.ts`, `usePoAnalytics.ts`
and `PoPlans.tsx` were all deleted in favor of direct, typed `supabase.rpc(...)` calls — `npm run
typecheck` stayed clean throughout. Set a placeholder `paddle_price_id` on Canopy, confirmed
`/po/coupons`'s editor unlocked, ran the full CRUD case (create → confirmed via `po_list_coupons`,
deactivate → confirmed `active: false`, delete → confirmed the list came back empty — the delete
button's own `confirm()` dialog auto-dismissed under this browser automation, same as PO-012's
tenant-delete earlier, so the RPC was called directly instead), then restored Canopy's
`paddle_price_id` to `null` — a fake value left live would break a real checkout attempt for any
actual visitor. **One thing PO-018 could not confirm**: its expected result includes "banner
reflects it," and no coupon banner exists anywhere in `src/` — landing page or otherwise — only the
`/po/coupons` sidebar link matches a search for "coupon". That half of the case has no feature to
verify against, not a bug, just an unbuilt assertion. **Also noted, deliberately not acted on:** the
account-deletion migration means `request_account_deletion()` now exists, but `DeleteAccountCard.tsx`
still routes deletion by email on purpose — a working self-service button needs a `service_role`
edge function this migration doesn't provide, which is separate, larger, not-yet-started work.

---

### Found by the OPS suite run (2026-08-15)

First execution of [REMAINING_TESTS.md](./REMAINING_TESTS.md) §14. 15 of 18 cases run this session
across two passes: an initial local-checkout-only pass (7 run: 6 pass, 1 fail — OPS-001/002/003/004/013
pass, OPS-005 fails against pre-existing BUG-032), then a same-day follow-up once the user answered
four blocking questions (Docker — yes; `git init` — yes; test sign-ins — yes; backups — user's own
check). That follow-up closed OPS-009/010/011 (two via new test coverage rather than a live deploy
or sign-in — `send-email/index.test.ts`, `Billing.test.tsx`; one via a real fresh clone once `git
init` made that possible), then a genuine local Docker-based Supabase stack (`supabase start`, all 67
migrations applied clean) unlocked OPS-006/007/014/015/016/017 for real — never against the live
project. **Two new, real findings came out of running these for real rather than reading code**:
BUG-114 (OPS-014) and BUG-115 (OPS-017). OPS-008 and OPS-012 stay `BLOCKED` — hosted backup/dashboard
access (the user's own check, in progress) and `SUPABASE_ACCESS_TOKEN` respectively — neither fixable
from this checkout.

| ID | Title | Sev | Case | Detail | Status |
|---|---|:-:|:-:|---|---|
| BUG-032 (retested) | Dependency vulnerability count has grown since the last count (BUG-032 stands, not new) | S2 | OPS-005 | Already tracked, not new. `npm audit --omit=dev` now reports **11 high + 1 moderate** (was 9 high + 1 moderate at the last count in the Reconciliation section) — the extra highs are `react-router`/`@remix-run/router` (open-redirect XSS, GHSA-2w69-qvjg-hvjx / GHSA-2j2x-hqr9-3h42) and a `glob`/`minimatch`/`brace-expansion` chain (ReDoS + a `glob` CLI command-injection advisory, GHSA-5j98-mcp5-4vw2) that weren't in the earlier count — all with a non-breaking fix available via plain `npm audit fix`, unlike `xlsx` (still no fix at all) and `pdfjs-dist` (fix is a breaking `--force` bump to 6.2.108). `npm audit fix` (no `--force`) would clear everything except `xlsx` and `pdfjs-dist` without touching either's breaking-change risk — worth doing on its own even though it doesn't close BUG-032 | OPEN, unchanged |
| BUG-032 (retested) | The non-breaking half is taken; the breaking half is now three items, not two | S2 | user asked to "fix all the bugs" | Ran `npm audit fix` (no `--force`), the free win the previous retest flagged but hadn't taken yet. **12 → 6 vulnerabilities**: postcss (3 advisories) and yaml cleared. `package-lock.json` updated; `package.json` untouched (only transitive bumps within existing semver ranges). Remaining 6 are all genuinely breaking-only: `xlsx` (still no fix at all — unchanged), `pdfjs-dist` (needs 6.2.108, a major bump — unchanged), and now also `esbuild`/`vite` (needs `vite@8`) and `react-router` (npm labels a fix "available via `npm audit fix`" with no `--force` noted, but running it does nothing — the installed `6.30.4` is already the newest `6.x`, and the real fix needs a major-version bump npm's own advisory text doesn't flag as breaking here). `tsc`/`vitest`(620/620)/`vite build` all clean after the bump | OPEN, narrowed |
| BUG-114 | Dashboard takes 8–11 s to show real numbers at 50 000-transaction scale, ~10× the 3 s target, though every network call finishes in under 1.3 s | S3 | OPS-014 | Seeded a tenant with 50 000 real transaction rows on a local Supabase stack (never the live project) and timed `/app` from navigation start to the "TOTAL FOR MONTH" figure actually rendering, using the page's own `performance.now()` (not tool-round-trip time): **10 951 ms**, then **8 694 ms** on a repeat — reproducible, not a one-off. Checked where the time goes: `performance.getEntriesByType('resource')` shows every REST/RPC call — including `dashboard_summary`, the Stage 4.2 server-side aggregate RPC that exists specifically to avoid client-side reduction over the full transaction table — completing by **~1.25 s** (`dashboard_summary` itself: 68 ms). The remaining **7–9.7 s is unaccounted for between "all data has arrived" and "the number is on screen"** — client-side, not a query problem. Read `useDashboardSummary.ts` (`deriveSummary`) and `SpendingCategories.tsx` looking for an obvious O(n) loop over the raw 50k rows; neither one touches more than the RPC's own already-aggregated "few dozen rows" — so the two most likely suspects are clean, and the actual cause is still open. `performance.getEntriesByType('longtask')` returned empty, but that's expected without a `PerformanceObserver` registered before the work started, not evidence nothing blocked the main thread. Worth a session with React DevTools' own Profiler rather than more guessing from outside | **FIXED 2026-08-17, root cause found via React's `Profiler` API** (no DevTools extension available in this environment, so wrapped the dashboard tree in `<Profiler onRender>` temporarily instead — same official API, no browser extension needed). Every individual render was fast (single digits to ~30ms), but there were multi-second **gaps between commits** — 16.7s, 7.5s, 6s, 4.6s — each ending exactly when one more widget's data finally arrived, in top-to-bottom order. Traced to `useOnboarding.ts`'s `countReal()`: the Stage 5.3 checklist runs `count: "exact", head: true` against `transactions`/`budgets`/`goals` on every dashboard load while onboarding is still active, and Postgres has to evaluate the per-row RLS check (`is_tenant_member()`) for every one of the 50,001 matching rows before it can report an exact number — measured live via the browser's own `fetch()` (not `curl`, which turned out to hang identically on HEAD requests to both this project and the live one for minutes, a `curl`/Windows-networking artifact unrelated to the product, caught by cross-checking against a real browser request before trusting it): **~1.2 s**, repeatable, vs. `dashboard_summary()`'s 68 ms for a full aggregate. The checklist only ever asks `(counts[s.id] ?? 0) > 0` (`onboarding.ts`'s `deriveSteps`) — it never shows the actual number — so an exact count was always more than the feature needed. Rewrote `countReal()` to check existence via `.select("id").limit(1)` instead (an index-only lookup that stops at the first match, ~80 ms measured, independent of table size) and confirmed end-to-end via the same `Profiler` instrumentation: the whole dashboard now mounts and settles in **~636 ms**, no gap over 30ms anywhere. Verified `tsc` 0, `vitest` 620/620, `vite build` clean; temporary `Profiler` wrappers removed before finishing | FIXED |
| BUG-115 | A database outage renders as "you have no data yet," not an error — indistinguishable from data loss to the person looking at it | S3 | OPS-017 | Stopped the local stack's Postgres container mid-session (`docker stop`) and loaded `/app` against a tenant that genuinely has 50 000+ real transactions. No crash, no white screen — but also no error message: the dashboard rendered the exact same "Welcome to FinRoot. Add your income and expenses to see your money come to life" / ₹0-everywhere state a **brand-new, empty account** gets, over an account whose real data was simply unreachable. Console confirmed the real cause (`503`, `PGRST002 "Could not query the database for the schema cache. Retrying."`) but nothing in `src/pages/Index.tsx` branches on `isError` for the summary/menu queries — `deriveSummary(undefined)` (`useDashboardSummary.ts`) returns its all-zero `EMPTY` object on any failure, and the empty-state copy in `Index.tsx` cannot tell "zero because new" from "zero because unreachable." Restarted the container: PostgREST recovered on its own within ~15 s of the DB coming back, and every seeded row (2002 tenants, 50 001 transactions) was confirmed intact afterward — no partial writes, no corruption, the one write attempted while the DB was down correctly got a clean `400` and nothing landed. So OPS-017's "no partial state" and "no crash" both hold; "clear error" does not — a real user mid-outage has no way to tell this apart from having lost every transaction they ever entered | **FIXED 2026-08-17.** Fixed in `DashboardClassic.tsx`, not `Index.tsx` as originally filed — the dashboard rendering moved there since this bug was found. Destructured `isError` from `useDashboardSummary()` and branched the hero sentence to show `DEFAULT_ERROR` distinctly from both the real-savings and welcome-new-account messages. Scoped to `DashboardClassic` only — `DashboardWealth`'s hero has no equivalent income-derived narrative text to begin with, so the exact symptom doesn't reproduce there; extending `isError` to every widget in that layout would be a separate, larger refactor. |
| BUG-015 (retested) | `types.ts` is stale again — one table behind this time, not four | S4 | OPS-012 | Already tracked, not new — same recurring pattern the original finding named: a migration gets written, `types.ts` isn't regenerated after it, and nobody notices until something actually diffs the two. Still no `SUPABASE_ACCESS_TOKEN` to regenerate against the live project, so generated types from the local Docker stack instead (`supabase gen types typescript --local`) — schema-equivalent, since the local stack was built by replaying every migration in `supabase/migrations/` from empty (see OPS-006). Diffed against the checked-in `src/integrations/supabase/types.ts`: exactly one real gap, `processed_webhooks` (BUG-008's table, migration `20260815090000`, written after the last regen that same day), plus one cosmetic CLI-version marker that isn't a real drift. Confirms the NOW block's own claim precisely — nothing unexpected is missing, just the one already-known table | OPEN, unchanged |
| BUG-015 (retested 2026-08-18) | `types.ts` no longer stale — the 2026-08-17 live regen held | S4 | OPS-012 | Re-ran the same local-stack workaround (still no `SUPABASE_ACCESS_TOKEN` in this shell) — `supabase db reset --local` replayed all 69 migrations from empty (`supabase start`'s own first boot had restored from a stale cached snapshot missing the last two files, which briefly looked like drift before the reset), then diffed a fresh `gen types typescript --local` against the checked-in `types.ts`. Zero real drift — only the same cosmetic `__InternalSupabase.PostgrestVersion` CLI-version marker the last two retests also correctly ignored. `types.ts` was regenerated against the live project during the 2026-08-17 deploy (see CLAUDE.md's "Pending migrations" note) and has tracked the schema since | **RESOLVED — OPS-012 PASS** |
| BUG-032 (retested 2026-08-18) | Dependency vulnerability count narrower after the 2026-08-17 fix; nothing new since | S2 | OPS-005, IMP-006 | `npm audit --omit=dev`: **2 high + 2 moderate** (was 11 high + 1 moderate before the 2026-08-17 `npm audit fix`, which is what narrowed it — this is just the first `--omit=dev`-scoped retest since). Remaining: `xlsx` (high, still no fix at all), `pdfjs-dist` (high, fix is a breaking bump to 6.2.108), `react-router` (moderate, npm's audit text says a fix is available via plain `npm audit fix` with no `--force` noted, but a dry run confirms that's misleading — installed `6.30.4` is already the newest `6.x` and `package.json` pins `^6.30.1`; the real fix needs a major bump to 7.x). `esbuild`/`vite` no longer show under `--omit=dev` because they're devDependencies, correctly excluded by that flag — not fixed, just outside this case's scope; they still show under a full `npm audit`. IMP-006: re-read `src/lib/importParsers.ts` rather than re-running the live payload — `parseExcel()` is byte-for-byte unchanged, still `XLSX.read(buf)` directly on unvalidated upload bytes on the main thread, no `Worker` anywhere in `src/`'s import path, no pre-parse schema check; `xlsx@0.18.5` confirmed unchanged via `npm ls xlsx`. Neither dependency of BUG-032 changed in substance today, only the count | OPEN, narrowed further |
| BUG-116 | A Paddle webhook missing `user_id` in `custom_data` silently fails the subscription upgrade — but still tells Paddle `{"received":true}`, so nothing ever retries it | S2 | BILL-008/BILL-010 | Running BILL-008/009/010 for real against a local Supabase stack (never the live project — `payments-webhook` served locally via `supabase functions serve` with a self-chosen `PAYMENTS_SANDBOX_WEBHOOK_SECRET`, exactly the method already proven for SEC-T16/T17). A synthetic-but-validly-signed `subscription.activated` event with `custom_data: {tenant_id}` only (no `user_id`) verified its signature correctly, passed dedup, then hit `null value in column "user_id" of relation "subscriptions" violates not-null constraint" (23502)` on the upsert — logged via `console.error("upsert subscription error", ...)` in `payments-webhook/index.ts:230`, whose surrounding code has no `if (error) return …`, so the handler falls through to its normal `200 {"received":true}` regardless. Confirmed the fix path first: the exact same event replayed with `custom_data: {user_id, tenant_id}` — the shape `Billing.tsx:176`'s real checkout call always sends — upserts cleanly (`plan_name: "Canopy", status: "active", provider: "paddle"`, `current_period_end` set correctly). So today's outbound checkout call is never missing `user_id`, which is why this hasn't been seen live — but Paddle's own webhook contract does not guarantee every event on a subscription carries the checkout's original `custom_data` (renewal/update events in particular are documented by Paddle as sometimes carrying only a subset), and the moment one arrives without it, the upgrade is silently dropped with a `200` response, so Paddle's own retry-on-failure logic never fires and nothing anywhere flags the miss. The existing tenant-resolution fallback two lines up (`if (!tenantId && userId) { … lookup via tenant_members … }`) already establishes the pattern this needs: resolve `user_id` from the tenant's own owner membership (`tenant_members` where `tenant_id` + `role='owner'`) when `custom_data.user_id` is absent, the same way `tenantId` is resolved from `userId` when `tenant_id` is absent — the two lookups are mirror images of each other, and only one of them exists today | **FIXED (code), NOT DEPLOYED 2026-08-17.** `payments-webhook/index.ts` now mirrors the existing `tenantId`-from-`userId` lookup in the other direction: resolves `user_id` from `tenant_members` (tenant's owner row) when `custom_data.user_id` is absent. If still unresolvable, now returns `500` instead of silently `200`'ing, so Paddle retries rather than the upgrade being dropped forever. Not deployed — same `SUPABASE_ACCESS_TOKEN` blocker as the other undeployed function fixes. |
| BUG-114 (retested 2026-08-18) | Fix confirmed live | S3 | OPS-014 | Seeded a fresh local-stack tenant with 50 000 real transaction rows (never the live project), pointed `.env.development` at the local stack, and timed `/app`'s "TOTAL FOR MONTH" render via an in-page `<iframe>` harness (`performance.now()` from `iframe.src` assignment to the figure landing in the iframe's DOM — avoids losing timing context across a full top-level reload, unlike the original run's method). **1322 ms**, then **1075 ms** on a repeat — both real figures matching the seeded data (₹6,42,33,296), both comfortably under the 3 s target and ~8–10× faster than the pre-fix 8.7–11.0 s. `useOnboarding.ts`'s `.limit(1)` fix is what's live in this checkout and what this run exercised | **CONFIRMED FIXED, verified live 2026-08-18** |
| BUG-115 (reopened 2026-08-18) | The dashboard's own fix is correct, but a real outage never reaches it — `MenuGuard` redirects away from Dashboard first | S3 | OPS-017 | Retesting the deployed 2026-08-17 fix (`DashboardClassic.tsx` branching on `isError` to show `DEFAULT_ERROR`) found it never fires under the same test that originally found BUG-115: `docker stop`'d the local Postgres container against a tenant with 50 000 real seeded rows and loaded `/app`. `get_effective_menus()` fails alongside every other query; `AccessContext.tsx` deliberately sets `effectiveMenus = []` on that failure (`// fail closed` — a correct, pre-existing security choice, not a bug in itself: the comment right above it explains a stale `null` used to read as full access, which was worse). `MenuGuard.tsx`'s `canAccess('dashboard')` then returns `false` — structurally identical to "this plan doesn't include Dashboard" — and `<Navigate to={fallbackPath(allowedMenus)} replace />` fires before `DashboardClassic` ever mounts, landing on `/app/accounts`. Accounts then renders its own genuine "0 active accounts — No accounts yet" empty state: the exact original BUG-115 symptom, reproduced one page over, structurally immune to the fix that was supposed to prevent it. Confirmed via `read_console_messages` (`get_effective_menus failed`, several `503`s) and reading `MenuGuard.tsx`/`AccessContext.tsx` directly, not inferred from the screen alone. "No crash" and "no partial state" still hold — full recovery and all 50 000 rows confirmed intact within ~1 s of restarting the container | **FIXED 2026-08-18, at the layer the reopened finding pointed to.** `TenantContext.tsx` now tracks its own resolution failure separately from "checked and found zero memberships" — a new `error: boolean` in its context value, `true` only when the `tenant_members` fetch itself throws or errors, reset on every successful load. `AccessContext.tsx` mirrors this with a new `menusErrored: boolean` (backed by an `rpcErrored` state var), `true` when `get_effective_menus`/the RPC call itself failed, OR when there was no tenant to check *because* `TenantContext`'s own fetch failed — both were previously folded into the same `menusStatus === "error"` used for "legitimately excludes this menu." `MenuGuard.tsx` now checks `menusErrored \|\| tenant.error` before computing a redirect target, and when true renders a new shared `MenuResolutionError` component in place — "Can't reach the server right now," with a "Try again" button wired to both contexts' `refresh()` — instead of silently navigating away. `allowedMenus` itself is untouched and still fails closed to `[]` on any failure (BUG-090's lesson stands: an unresolved check must never grant access) — this only changes what the UI *does* with that closed state, not whether access is granted. Verified live against the local stack: stopped Postgres mid-session on the same 50 000-row tenant OPS-017 used, `/app` now stays on `/app` and shows the new error card instead of bouncing to Accounts; "Try again" after restarting the container recovers to the normal dashboard with no stale state. `tsc` 0, `eslint` 0 errors/27 warnings (unchanged baseline), `vitest` 620/620, all re-run after the change. Not yet deployed — same `SUPABASE_ACCESS_TOKEN`-shaped gap as every other undeployed fix in this file, except this one needs no migration, just a frontend deploy. |
| BUG-117 | Every real production build has been silently targeting a dead, abandoned Supabase project, not the live one | S1 | user asked to prepare a deploy | Preparing a `dist/` build to hand off for the user's own VPS deploy, verified what actually got embedded rather than trusting `npm run build`'s clean exit: `grep`ing the built JS for a `*.supabase.co` URL found `tsmdnfywxsjsjqjszoek` — the project `.env.development`'s own comment already names as "PAUSED/INACTIVE ... an abandoned Lovable prototype that never received the Phase 1-7 tenancy migrations" — not `ludbntvhagefadfkhrjj`, the real live project every other part of this file, `CLAUDE.md`, and every prior session's live-verification work has been targeting. Root cause: Vite's env precedence for a production build is `.env` → `.env.production` → `.env.production.local`; `.env.production` only ever carried `VITE_PAYMENTS_CLIENT_TOKEN`, so `VITE_SUPABASE_URL`/`_PUBLISHABLE_KEY`/`_PROJECT_ID` fell all the way through to the base `.env`, which still had the pre-2026-08-05-rebuild values (see `CLAUDE.md`'s "What this is" section on the rebuild) — nobody had corrected it because dev work has only ever used `.env.development` (correct), and per `docs/runbooks/deploy.md` ("There is no pipeline... every gate is run by hand"), no session's history shows an actual production build ever being produced and shipped before now. Every real deploy attempt using this checkout's defaults would have shipped an app that authenticates and queries against a project with none of the real schema, RLS policies, or data — total, silent breakage, not a partial regression | **FIXED 2026-08-18.** Corrected `.env` to the real live project's values (matching `.env.development`, which was always right), with a comment explaining why so it doesn't drift back. Rebuilt and re-verified by grepping the new `dist/assets/*.js` for the embedded URL: `ludbntvhagefadfkhrjj.supabase.co`, confirmed in all three chunks that reference it. Also checked the entry chunk against OPS-004's 250 kB gzip budget (97.80 kB, comfortably inside it) and served the real `dist/` via `vite preview` to confirm the landing page renders with zero requests to `googleapis`/`gstatic` (the CSP would block them anyway, but the deploy runbook's own post-deploy checklist asks for this specifically). `.env`/`.env.production`/`.env.development` are all gitignored, so this fix lives only in this checkout — worth checking again on any fresh clone or new machine. |

### "Fix all BUGs" pass — 2026-08-18

User asked to fix everything still open. Given how much of the frozen S1–S4 table below turned out to
already be fixed without ever being marked so (see the closures at the end of this section), the real
work here was first separating "genuinely still open" from "stale documentation" — a full read of both
this file and REMAINING_TESTS.md, cross-referencing every bug ID against its *latest* mention rather
than its first, then independently spot-checking a sample against the actual source tree before
anything was touched.

**Fixed, verified live where "live" is meaningful in a checkout with no deployed host:**

| Bug | Fix |
|---|---|
| BUG-070 | React Router v7 console warnings on every load — `BrowserRouter` now sets `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` in `src/App.tsx`. Trivial, no behavior change for a router with no loaders/actions. |
| BUG-074 | `caniuse-lite` was 14 months stale — `npx update-browserslist-db@latest`. |
| BUG-080 | Smart Split's percent-mode round-trip lost money to rounding (₹128 → ₹127.99 across five uneven buckets, reproduced first with a 200 000-trial random scan before touching any code, confirmed zero drift after). `convertAllocations()` in `src/components/expenses/smartSplitMath.ts` now reconciles each conversion's rounding error onto the largest bucket — same "give the remainder to one bucket" principle `evenSplit`/`balanceLast` already used elsewhere in the file, just not applied here before. Two new regression tests, one reproducing the exact original scenario. Deliberately targets what the *source* actually summed to, not the bill total — an incomplete split (90% allocated) must stay incomplete after a mode switch, not get silently topped up to look finished. |
| BUG-065 | `next-themes` turned out to be a false alarm (used by `sonner.tsx`) but 18 shadcn wrapper files really were dead — zero importers each, confirmed by grep before touching anything, not assumed from the bug's own age. Deleted `accordion/alert/aspect-ratio/avatar/breadcrumb/carousel/chart/context-menu/drawer/form/hover-card/input-otp/menubar/navigation-menu/pagination/resizable/scroll-area/toggle-group.tsx` and the 15 npm packages that backed only them (`react-hook-form`/`@hookform/resolvers` included — genuinely zero real usage anywhere, despite `CLAUDE.md`'s stack line still naming react-hook-form; that line is now stale too). `recharts`/`@radix-ui/react-slot`/`@radix-ui/react-label` kept — real usage elsewhere, confirmed the same way. |
| BUG-032 (xlsx third) | No npm fix exists for `xlsx@0.18.5` and none will — SheetJS stopped publishing to npm for this line. "Sandbox it" is the bug's own prescribed mitigation: `src/lib/xlsxWorker.ts` now does the actual `XLSX.read()`/`sheet_to_json()` inside a Web Worker (a separate JS realm — a prototype-pollution primitive inside it cannot reach the main thread's `Object.prototype`, and the worker has no DOM, no `localStorage`, no Supabase session to steal), re-serialized through `JSON.parse(JSON.stringify())` before crossing back so nothing carrying xlsx's internal cell-object shape leaves the worker. `src/lib/xlsxSandbox.ts` is the main-thread wrapper (one worker per file, a 25 MB pre-parse size cap) that `parseExcel()`/`parseToObjects()` in `importParsers.ts` now both go through instead of calling `XLSX.read()` directly. Verified live in a real browser, not just typed: a real generated .xlsx round-tripped through the worker correctly (~115 ms), a malformed/garbage buffer resolved instead of hanging the tab, and the `__proto__`-header vector IMP-006 already found closed remains closed (now doubly so — structurally, via the worker boundary, not just because SheetJS happens to escape that one string today). |
| BUG-032 (pdfjs-dist half) | `pdfjs-dist@5.7.284` carries GHSA-hq66-cqwq-w95j — arbitrary JS execution on a malicious PDF, the highest-severity item in BUG-032 and the most user-facing (Bill Scan/PDF import accepts untrusted uploads). Bumped to `6.2.108`, the first version with a fix. `tsc`/`eslint` clean — the app's actual usage (`getDocument`/`getPage`/`getTextContent`, `GlobalWorkerOptions.workerSrc`) is a narrow, stable surface untouched by the v6 breaking changes. Verified live: a hand-built minimal PDF parsed correctly through the app's real worker-based pdfjs setup in a real browser, extracting the expected transaction rows. |
| BUG-032 (react-router half) | **Assessed, not upgraded — the exploit path doesn't reach this app.** Two advisories remain on `react-router@6.30.4`: an SSR-hydration `deserializeErrors()` constructor-injection bug (this app has no SSR/data-router mode at all — plain `<BrowserRouter>` — so the vulnerable code path is never executed, regardless of version) and an open-redirect via backslash in `Link`/`useNavigate`. Grepped every non-literal `navigate()` call site in the app: `Auth.tsx`'s post-sign-in `redirectTo` comes from `location.state.from.pathname`, which only `ProtectedRoute.tsx`'s own `<Navigate state={{from: location}}>` can ever set — not attacker-reachable via a URL, since `location.state` isn't settable through query parameters, only through same-origin JS already running on the page (which would mean XSS already, a different problem). `GlobalSearch.tsx`'s `go(path)` calls are all either hardcoded internal routes or ids from a curated menu list, never free-text search input. A full v6→v7 migration is a large, real-risk undertaking for a router touching every route in the app; forcing it for two advisories whose actual exploit surface is verified-absent here would trade a real regression risk for no real security gain. Left open in `npm audit`'s eyes, closed in every way that matters to this app — documented here rather than silently ignored. |
| BUG-005 | Full rebuild, not a patch — see its own dated entry below; the short version is `send-email` went from an authenticated open mail relay to a closed template API. |
| BUG-058 (new sub-finding, **BUG-118**) | Reviewing whether the CSP was safe to promote from Report-Only to enforcing found a real gap first: `frame-src https://*.paddle.com` was the only allowed frame source, but Insurance's one `<iframe>` (the PDF document preview) loads a Supabase Storage **signed URL** — `https://*.supabase.co` was never in `frame-src`, only in `connect-src`/`img-src`. Promoting the policy as it stood would have silently broken that feature. Found by enumerating every external host and the app's one `<iframe>` from source (no deployed host exists to read live Report-Only violation reports from) and checking each against the policy by hand. Fixed in both `public/_headers` and `vercel.json` (kept in sync, per that file's own comment). **Still Report-Only, not promoted** — verified the fix live against a real build with the exact header applied (landing, support, auth pages, zero violations, real network 200s throughout), but the highest-risk surface, Paddle checkout, needs a real signed-in session this checkout has no credentials for; promoting blind on a revenue-critical flow isn't a call to make without that check. Whoever deploys next: watch the console on a real checkout attempt, then drop the `-Report-Only` suffix. |

**Closed as stale documentation, not fixed today** — each confirmed independently against the current
source (not assumed from the bug's age) before being marked. All are entries in the frozen S1–S4 table
below, which the file's own note at the end of this section already says not to trust — these are
just the specific ones this pass happened to touch, not an exhaustive re-audit of the whole table:

BUG-034 (migration/schema parity — OPS-006/007/012 already established this, never formally closed),
BUG-046 (single 2.56 MB chunk — `App.tsx`'s own comment confirms route-level `lazy()` fixed it, Stage
4.1), BUG-047 (xlsx defeating code-splitting — already excluded from the entry bundle via
`ImportPage`'s route-level `lazy()`; the xlsx *security* half is BUG-032, separately fixed above),
BUG-048 (Cmd/Ctrl+N hijack — `DashboardLayout.tsx`'s own comment confirms fixed), BUG-049 (duplicate
toasts on self-originated realtime events — `useRealtimeSync.tsx` now skips `actor === user.id`),
BUG-057 (subscription cron jobs never scheduled — `20260806160000_stage3_pg_cron.sql` schedules both),
BUG-059 (`live-price` never deployed — INV-002 already passed against it live), BUG-060 (`budgets`
uniqueness user- not tenant-scoped — `20260805210000`'s own comment confirms fixed), BUG-061 (three
lockfiles — only `package-lock.json` exists now), BUG-062 (`CLAUDE.md` claims "Phase 0/1" — it hasn't
said that in a long time), BUG-063 (`README.md` a two-line placeholder — it's 143 lines), BUG-064
(`PermissionsCenter.tsx`/`FeatureShowcase.tsx` unused — both deleted), BUG-066 (DM Serif Display still
loaded — `Voices.tsx`'s own comment confirms it was the only use and is gone), BUG-067 (3 of 5 themes
unreachable — `Settings.tsx` renders all 5 as clickable presets), BUG-087 (Insurance "Invalid
Date"/"NaN DAYS" on a null due date — `daysUntil()` returns `null` and both callers already branch on
it explicitly).

`tsc` 0 · `eslint` 0 errors/25 warnings (2 fewer than the 27-warning baseline — some belonged to files
deleted with BUG-065) · `vitest` 631/631 (was 620, +9 net from BUG-080's two new tests and BUG-005's
rebuilt suite) · `vite build` clean throughout, checked after every change that touched a dependency or
a bundled file, not just once at the end.



⚠️ **These are the Phase 1 audit's counts, frozen at 2026-08-04.** They were never updated and
"Fixed 0" has been false since Stage 0. See [Reconciliation — 2026-08-12](#reconciliation--2026-08-12)
for what has actually been verified fixed and what is confirmed still open, and
[Improvement_Roadmap.md](./Improvement_Roadmap.md) for live status.

| Severity | Count as found, 2026-08-04 |
|---|---|
| S1 Critical | 2 |
| S2 High | 35 |
| S3 Medium | 23 |
| S4 Low | 15 |
| **Total found** | **75** |

**Fix order:** BUG-001 → 003 → 004 → 005 → 006 → 007 → 008 → 030 → 031 → 014 → 015 → 009 →
011 → 013 → 012 → 002 → the rest by severity.
