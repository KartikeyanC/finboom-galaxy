# Testing Master Plan

> Audit date 2026-08-04. Companion artefacts: [Test_Cases.md](./Test_Cases.md) (the case
> register), [QA_PROGRESS.md](./QA_PROGRESS.md) (execution tracker),
> [BUG_TRACKER.md](./BUG_TRACKER.md) (defects found during execution).

---

## 1. Current state — measured

| Suite | Command | Result 2026-08-04 |
|---|---|---|
| Unit | `npx vitest run` | ✅ **30/30 pass** in 4 files |
| Type check | `npx tsc -p tsconfig.app.json --noEmit` | ❌ **exit 2 — 10 errors** |
| Lint | `npx eslint .` | ❌ **exit 1 — 11 errors, 27 warnings** |
| Build | `node_modules/.bin/vite build` | ✅ pass (28.96 s) |
| E2E | `npm run e2e` | 12 tests (5 public + 7 authenticated); requires `.env.e2e` |
| Dependency audit | `npm audit --omit=dev` | ❌ 9 high, 1 moderate |

**Covered by unit tests:** `lib/finance.ts` (11), `lib/importParsers.ts` (11),
`lib/remindersStore.ts` (7), plus one placeholder.
**Not covered at all:** every component, every hook, every context, every RLS policy, every
RPC, every edge function, all billing logic, all tenancy logic.

Estimated statement coverage: **≈2 %** of `src/`.

## 2. Objectives and exit criteria

| Objective | Exit criterion |
|---|---|
| No release blocker ships | every `Sev: C/H` case in [Test_Cases.md](./Test_Cases.md) passes |
| Security is verified, not assumed | every `SEC-*` negative case passes (the exploit is attempted and **fails**) |
| Money is correct | every `FIN-*` calculation case passes with exact expected values |
| Tenancy is airtight | every `TEN-*` isolation case passes with two real accounts |
| Regressions are caught | CI runs typecheck + lint + unit + e2e on every change |
| Coverage floor | ≥ 70 % statements in `src/lib` and `src/hooks`; ≥ 50 % overall |

## 3. Test pyramid — target

```
        ╱ Exploratory + manual (charter-based)      ~ 5 %
       ╱  E2E (Playwright)                 40 cases  ~10 %
      ╱   Integration (RLS, RPC, edge fn)  90 cases  ~25 %
     ╱    Unit (lib, hooks, components)   250 cases  ~60 %
```

## 4. Environments

| Env | Purpose | Data |
|---|---|---|
| Local (`npm run dev`, :8080) | unit + component | Supabase dev project |
| Dev (`hkfwuxqeexamyphcgkxr`) | integration, RLS, e2e | throwaway accounts created via the admin API |
| Staging | **does not exist — create one** | seeded, restorable |
| Live (`tsmdnfywxsjsjqjszoek`) | production | never a test target |

**Required test accounts** (create in dev, document in `.env.e2e.example`):
`owner-a`, `admin-a`, `viewer-a` in workspace A; `owner-b` in workspace B;
`multi` (owner of B **and** collaborator in A — the KI-001 probe); `po` (platform admin).

## 5. Coverage by test type

| # | Test type | Approach | Tooling | Priority |
|---|---|---|---|---|
| 1 | **Unit** | pure functions in `lib/`, then hooks with a mocked Supabase client | Vitest + Testing Library | P0 |
| 2 | **Integration** | real dev Postgres: RLS matrices, RPC guards, trigger behaviour | Vitest + `supabase-js` with 3 role JWTs | **P0** |
| 3 | **End-to-end** | the 9 core journeys | Playwright | P0 |
| 4 | **Regression** | the full P0+P1 set re-run before every release | CI | P0 |
| 5 | **Smoke** | app boots, `/`, `/auth`, `/app` redirect, `/po/login` | Playwright, on every deploy | P0 |
| 6 | **Sanity** | after each hotfix, the touched module's cases only | manual/CI | P1 |
| 7 | **System** | end-to-end incl. Paddle sandbox + Resend sandbox | manual | P1 |
| 8 | **Acceptance (UAT)** | the 9 journeys walked by a non-engineer against acceptance criteria | manual | P1 |
| 9 | **UI** | component snapshot + visual diff on the 20 highest-traffic screens | Playwright screenshots | P2 |
| 10 | **UX** | moderated usability sessions, 5 users, sign-up → first transaction | manual | P1 |
| 11 | **Accessibility** | automated axe scan on every route + manual screen-reader pass | `@axe-core/playwright`, NVDA/VoiceOver | **P1** — known AA failures (KI-045) |
| 12 | **Responsive** | 320 / 375 / 390 / 414 / 768 / 1024 / 1440 / 1920, portrait + landscape, **and post-load resize** | Playwright | **P0** — KI-044 lives here |
| 13 | **Cross-browser** | Chromium, Firefox, WebKit | Playwright projects | P1 |
| 14 | **Cross-platform** | iOS Safari, Android Chrome, Windows, macOS; PWA installed mode | BrowserStack / real devices | P1 |
| 15 | **Security** | the negative suite in §6 | Vitest integration + manual | **P0** |
| 16 | **Performance** | Lighthouse CI, bundle-size budget, query timing | Lighthouse CI, `vite-bundle-visualizer` | P1 |
| 17 | **Stress** | 50 concurrent writers on one workspace | k6 | P2 |
| 18 | **Load** | 100 concurrent users, realistic mix | k6 | P2 |
| 19 | **Spike** | 0→200 users in 30 s (marketing launch) | k6 | P2 |
| 20 | **Volume** | one workspace with 50 000 transactions, 200 holdings, 100 accounts | seed script | **P1** — PERF-004 |
| 21 | **Scalability** | 1 000 tenants; measure `po_list_tenants`, `po_dashboard_stats` | seed script | P2 |
| 22 | **Reliability** | 24 h soak with the app open; watch memory and edge-invocation count | manual | P2 |
| 23 | **Recovery** | restore from PITR into a scratch project; verify row counts | manual | **P0** once backups exist |
| 24 | **Chaos** | kill Supabase mid-mutation; expire the JWT mid-session; block `live-price` | manual + devtools | P2 |
| 25 | **Failover** | none available (single region) — document as accepted | — | P3 |
| 26 | **Backup** | verify a nightly dump exists, is non-empty, and restores | cron + manual | P0 |
| 27 | **Migration** | apply all 32 migrations to an empty DB; then to a DB with data; check idempotency | CI job | **P0** |
| 28 | **Installation** | clean clone → install → build → run, on Windows and Linux | CI matrix | P1 |
| 29 | **Configuration** | missing `RESEND_API_KEY`, missing Paddle token, wrong Supabase URL — app must degrade, not crash | manual | P1 |
| 30 | **API** | every table endpoint × every role; every RPC × authorised/unauthorised | Vitest integration | **P0** |
| 31 | **Database** | constraints, cascades, defaults, triggers | pgTAP or Vitest SQL | P1 |
| 32 | **Session** | multi-tab, expiry, refresh, sign-out, PIN gate | Playwright | P1 |
| 33 | **Authentication** | §6 AUTH cases | Playwright + integration | P0 |
| 34 | **Authorization** | §6 AUTHZ cases | integration | P0 |
| 35 | **Input validation** | every form: empty, max length, unicode, emoji, negative, zero, huge, script tags, SQL fragments | Playwright | P1 |
| 36 | **Boundary** | amount 0 / 0.01 / 14-digit max / negative; dates 1900 & 2100; 31st-of-month recurrence | unit + e2e | **P1** — KI-023 |
| 37 | **Positive** | every happy path | all layers | P0 |
| 38 | **Negative** | every guard, every constraint | all layers | P0 |
| 39 | **Exploratory** | timeboxed charters per module | manual | P1 |
| 40 | **Mutation** | Stryker on `src/lib` to validate assertion quality | Stryker | P3 |
| 41 | **Monkey / adhoc** | random clicking + fuzzed CSV/XLSX uploads | manual + script | P2 |
| 42 | **Usability** | see 10 | | |
| 43 | **Localization** | none implemented — verify ₹/`en-IN` formatting is at least consistent | manual | P3 |
| 44 | **Internationalization** | unicode names, RTL text in notes, non-INR currency handling | manual | P2 |
| 45 | **Memory leak** | 30 min navigating with live prices running; heap snapshots | devtools | P2 |
| 46 | **Concurrency** | two members editing the same goal/budget simultaneously | manual 2-browser | **P1** — KI-025 |
| 47 | **Network failure** | offline mid-mutation; 500 from PostgREST; DNS failure | devtools throttling | P1 |
| 48 | **Offline** | SW shell loads; app degrades with a clear message | Playwright offline | P1 |
| 49 | **Slow internet** | Slow 3G on dashboard with 5 000 transactions | devtools | P1 |
| 50 | **Cache** | React Query staleness; SW update after deploy; stale asset recovery | manual | P1 |
| 51 | **Background sync** | not implemented — confirm no silent data loss when offline writes fail | manual | P1 |
| 52 | **Logging** | verify audit rows are written for every privileged action, and **cannot be forged** | integration | **P0** |
| 53 | **Monitoring** | once Sentry exists: force an error, confirm it arrives with context | manual | P1 |
| 54 | **Notification** | invite → notification; suspend → notification; bell badge; mark-all-read | e2e | P1 |
| 55 | **Billing** | Paddle sandbox: checkout, webhook, upgrade in place, cancel, resume, invoice | manual + sandbox | **P0** |
| 56 | **Subscription** | expiry → Free fallback; menu ceiling; expired banner; lazy-expiry drift | integration | P0 |
| 57 | **License** | = subscription bypass; see SEC cases | integration | P0 |
| 58 | **Cron** | none scheduled — verify lazy expiry is correct, or schedule and test the jobs | integration | P1 |
| 59 | **Worker** | pdf.js worker loads and parses a real bank PDF | e2e | P2 |
| 60 | **Scheduler** | see 58 | | |
| 61 | **Search** | Ctrl+K across transactions, accounts, goals; empty and no-match states | e2e | P2 |
| 62 | **Export** | CSV and XLSX for all datasets; large export; **viewer must not be able to export** | e2e | P1 |
| 63 | **Import** | all 5 templates; malformed rows; duplicate run; 10 000-row file; wrong encoding | e2e | **P0** — KI-016 |
| 64 | **CSV** | quoting, embedded commas, BOM, CRLF, missing columns, extra columns | unit | P1 |
| 65 | **PDF** | bank-statement parsing; corrupt PDF; encrypted PDF | manual | P2 |
| 66 | **Chart** | correct values, empty state, single slice, negative values, 20+ categories, both themes | component | P1 |
| 67 | **Analytics** | none implemented | — | P3 |
| 68 | **Audit log** | see 52 | | |
| 69 | **Admin (PO)** | every PO page and RPC, as PO and as non-PO | e2e + integration | P0 |
| 70 | **Role** | owner / admin / viewer capability matrix | integration | P0 |
| 71 | **Permission** | menu overrides at plan, tenant and member level | integration | P0 |
| 72 | **Multi-user** | two members in one workspace acting simultaneously | manual 2-browser | P1 |
| 73 | **Tenant isolation** | §6 TEN cases | integration | **P0** |
| 74 | **Disaster recovery** | see 23/26 | | P0 |
| 75 | **Production readiness** | the checklist in [Production_Readiness.md](./Production_Readiness.md) | manual | P0 |

## 6. The security negative suite (highest priority)

These must be written as **automated tests that attempt the exploit and assert failure**.
They are the regression guard for the audit's Critical findings.

| ID | Attempt | Expected after fix |
|---|---|---|
| SEC-T01 | Owner `PATCH`es `subscriptions` to the Pro `plan_id` | `403` / 0 rows updated |
| SEC-T02 | Any user `PATCH`es `subscriptions.status = 'active'`, `current_period_end` far future | rejected |
| SEC-T03 | Any user calls `rpc/log_audit` | permission denied |
| SEC-T04 | Any user calls `rpc/create_notification` targeting another user | permission denied |
| SEC-T05 | Any user calls `rpc/expire_subscriptions` | permission denied |
| SEC-T06 | Viewer inserts into `transactions` | RLS denies |
| SEC-T07 | User A selects workspace B's rows (all 15 tenant tables) | 0 rows |
| SEC-T08 | User A calls `get_effective_menus(B)` | `[]` |
| SEC-T09 | Non-PO calls each of the 20 `po_*` RPCs | `Not authorized` |
| SEC-T10 | Non-PO inserts into `platform_admins` | denied |
| SEC-T11 | Viewer calls `set_member_menus` to grant themselves menus | `Not authorized` |
| SEC-T12 | Member calls `update_member_role` on the owner | no rows affected |
| SEC-T13 | `invite_member` with `p_role = 'owner'` | `Role must be admin or viewer` |
| SEC-T14 | `POST /functions/v1/send-email` with an arbitrary `to` | rejected / template-only |
| SEC-T15 | 100 rapid `po-auth` secret attempts | throttled after N; identical response for valid vs invalid identifier |
| SEC-T16 | Replay a captured Paddle webhook | rejected (stale `ts` / duplicate `event_id`) |
| SEC-T17 | Paddle webhook with a tampered body and the original signature | `401` |
| SEC-T18 | Insert a `tenants` row directly | denied |
| SEC-T19 | Free-plan tenant reads `investments` / `insurance` over REST | **0 rows, and inserts refused** — decided 2026-08-05 (AZ-001, Stage 2.15). Seed a row as `service_role` first, or the check passes vacuously. |
| SEC-T20 | Viewer navigates to `/app/export` and exports | blocked |

## 7. Tooling to add

```jsonc
// devDependencies to add
"@axe-core/playwright"   // accessibility
"@vitest/coverage-v8"    // coverage thresholds
"msw"                    // hook tests without hitting the network
"k6"                     // load/stress (standalone binary)
```

## 8. CI pipeline (does not exist — proposed)

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  verify:
    steps:
      - npm ci
      - npx tsc -p tsconfig.app.json --noEmit      # MUST gate — currently failing
      - npx eslint .                                # MUST gate — currently failing
      - npx vitest run --coverage                   # thresholds: lib/hooks ≥70 %
      - npm audit --omit=dev --audit-level=high
      - node_modules/.bin/vite build
      - node scripts/check-bundle-size.mjs          # budget: 250 kB gzip main chunk
      - npx playwright test --config e2e/playwright.config.ts
  migrations:
    steps:
      - supabase db reset --db-url $EPHEMERAL_DB    # all 32 migrations from scratch
      - npm run test:rls                            # the §6 suite
```

**Sequencing note:** the type-check and lint gates cannot be turned on until KI-028 and KI-031
are fixed. Fix those first, then enable the gates, then start the Sprint-0 security fixes — so
that the fixes land into a codebase with a working safety net.

## 9. Execution protocol (Phase 2)

Per the brief, once documentation is approved:

1. Pick one case from [Test_Cases.md](./Test_Cases.md), in priority order (P0 → P3).
2. Execute it and record the actual result in [QA_PROGRESS.md](./QA_PROGRESS.md).
3. On failure: open a row in [BUG_TRACKER.md](./BUG_TRACKER.md), find the root cause, fix it,
   retest, then re-run the regression set for every module the fix touches.
4. Update the status; never skip a failing case.
5. After each milestone, update [Production_Readiness.md](./Production_Readiness.md).

## 10. Entry / exit gates

**Entry to Phase 2:** documentation approved; dev test accounts created; `.env.e2e` populated;
a staging environment exists.
**Exit from Phase 2:** all P0 and P1 cases pass or are formally accepted with a documented
rationale; zero open Critical or High bugs; the [Production_Readiness.md](./Production_Readiness.md)
sign-off table is fully green.
