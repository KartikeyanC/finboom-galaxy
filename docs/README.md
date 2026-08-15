# FinRoot — Phase 1 Audit Documentation

> **Audit completed 2026-08-04.** Full-repository discovery and documentation.
> **No application code, migration, configuration or dependency was modified.**
>
> Verdict: **NOT production-ready — 41/100.** 2 Critical and 30 High findings.
> Start with [Production_Readiness.md](./Production_Readiness.md), then
> [Security_Report.md](./Security_Report.md).

---

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 1 | [Production_Readiness.md](./Production_Readiness.md) | Can we launch? (No — and exactly what's missing) |
| 2 | [Security_Report.md](./Security_Report.md) | What must be fixed first, and how |
| 3 | [Known_Issues.md](./Known_Issues.md) | Every defect found, in one register (56 entries) |
| 4 | [Improvement_Roadmap.md](./Improvement_Roadmap.md) | The sequenced 5–7 week plan |
| 5 | [Risk_Assessment.md](./Risk_Assessment.md) | Scored risks and treatments |

## How to do things, and why they are that way

| Directory | Contents |
|---|---|
| [runbooks/](./runbooks/) | Applying a migration, deploying, deleting/restoring a workspace, account erasure, rotating credentials |
| [adr/](./adr/) | The decisions that shaped the system, with their costs — 8 records |

Both were added in Stage 5.6. Start at the [root README](../README.md) if you are new to the repo.

## Reference

| Document | Contents |
|---|---|
| [Architecture.md](./Architecture.md) | System topology, layers, request lifecycles, build output |
| [Module_Map.md](./Module_Map.md) | Every module: purpose, contracts, failures, M/S/Q scores |
| [Database_Architecture.md](./Database_Architecture.md) | 22 tables, ~40 functions, RLS, migration history |
| [API_Documentation.md](./API_Documentation.md) | PostgREST tables, 30+ RPCs, 5 edge functions |
| [Authentication_Flow.md](./Authentication_Flow.md) | 3 auth paths + the device PIN gate |
| [Authorization_Flow.md](./Authorization_Flow.md) | RLS vs menus vs platform admin; permission matrix |
| [Business_Rules.md](./Business_Rules.md) | 65 rules the code actually implements |
| [Project_Dependencies.md](./Project_Dependencies.md) | 52 runtime deps, 7 third-party services, CVEs |
| [Coding_Standards.md](./Coding_Standards.md) | Conventions to preserve and rules to start enforcing |

## Audit findings

| Document | Contents |
|---|---|
| [Security_Audit.md](./Security_Audit.md) | Full OWASP Top 10 walkthrough + extended checklist |
| [Database_Report.md](./Database_Report.md) | DB-001…012 against the full DB checklist |
| [API_Report.md](./API_Report.md) | AR-001…012, per-endpoint risk table |
| [UI_UX_Report.md](./UI_UX_Report.md) | Interface + accessibility, with **measured** browser data |
| [UX_Report.md](./UX_Report.md) | 49 journey-level findings across 9 user journeys |
| [Performance_Report.md](./Performance_Report.md) | Measured bundle, query patterns, rendering, DB |

## QA artefacts

| Document | Contents |
|---|---|
| [Testing_Master_Plan.md](./Testing_Master_Plan.md) | Strategy across all 75 test types; CI pipeline; the security negative suite |
| [Test_Cases.md](./Test_Cases.md) | 259 specified cases; 48 expected to fail today |
| **[REMAINING_TESTS.md](./REMAINING_TESTS.md)** | **The execution tracker — start here to run tests.** 229 unrun cases as tickable boxes, in the order to run them |
| [QA_PROGRESS.md](./QA_PROGRESS.md) | Narrative log of past QA sessions. Superseded for *status* by REMAINING_TESTS.md |
| [BUG_TRACKER.md](./BUG_TRACKER.md) | 75 open defects with root cause and fix |

## Operations

| Document | Contents |
|---|---|
| [Deployment_Checklist.md](./Deployment_Checklist.md) | Env matrix, gates, DB/function/frontend deploy, rollback |
| [Disaster_Recovery.md](./Disaster_Recovery.md) | **No DR exists today** — what to build, and what to do if it breaks now |

## Pre-existing (not produced by this audit)

| Document | Note |
|---|---|
| [DESIGN.md](./DESIGN.md) | The original multi-tenant design and decision log — still accurate as intent |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | The phased plan; all 7 phases have shipped |
| [PADDLE_SETUP.md](./PADDLE_SETUP.md) | Paddle account setup (not yet done) |
| `../CLAUDE.md` | ⚠️ **stale** — claims the backend is at "Phase 0/1" |

---

## The five things that matter most

1. **Any user can give themselves a paid plan** — one `PATCH` from the browser console.
   *(BUG-001 · [Security_Report.md](./Security_Report.md))*
2. **Multi-workspace users get merged reads and misrouted writes** — no client code ever uses
   `tenant_id`. *(BUG-002 · [Known_Issues.md](./Known_Issues.md) KI-001)*
3. **The net-worth trend chart shows fabricated data.** *(BUG-010 · [UX_Report.md](./UX_Report.md) UX-022)*
4. **There are no backups and no monitoring** — a bad migration is unrecoverable and unnoticed.
   *([Disaster_Recovery.md](./Disaster_Recovery.md))*
5. **`tsc` fails with 10 errors while the build passes**, and nothing gates a change.
   *(BUG-014/031)*

## What is genuinely good

Uniform, correct RLS across all 22 tables · no SQL injection, no IDOR, no path to
platform-admin escalation · audited privileged RPCs · correct money types · a single-source
design system for charts, money inputs and icons · well-structured append-only migrations ·
a strong import experience · well-configured client caching and service worker.

---

## Verified facts (2026-08-04)

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` | ❌ exit 2 — 10 errors |
| `npx eslint .` | ❌ exit 1 — 11 errors, 27 warnings |
| `npx vitest run` | ✅ 30/30 pass, 4 files |
| `vite build` | ✅ pass — main chunk **2 562 kB / 735 kB gz** |
| `npm audit --omit=dev` | ❌ 10 vulns — 9 high, 1 moderate |
| Landing page, live | ✅ loads clean; ❌ 36 px mobile overflow on resize; ❌ 3.42:1 body-text contrast |
| Source files in `src/` | 199 TS/TSX |
| Migrations | 32 (all applied to dev; **live state untracked**) |

---

## Next step

Phase 1 is complete and awaiting approval. Per the working rules, **no test execution and no
code changes will begin until you approve.**

Recommended first move regardless of approval — three things that cost almost nothing and
remove the largest tail risks:

1. `git init` and push to a private remote (the migration source currently exists on one disk,
   with no version control).
2. Take a manual encrypted `pg_dump` of the live database.
3. Remove the live `project_id` from `supabase/config.toml`.
