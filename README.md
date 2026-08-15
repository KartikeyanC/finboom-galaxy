# FinRoot

A personal-finance workspace for a household, grown into a small multi-tenant SaaS: transactions,
budgets, goals, investments, insurance, trips and net worth, with invited collaborators, plan-based
feature gating and a Product Owner console on top.

Built cost-first — Supabase free tier, a static frontend, no paid services without a decision.

| | |
|---|---|
| **Stack** | Vite · React 18 · TypeScript · Tailwind + shadcn/ui · TanStack Query · React Router |
| **Backend** | Supabase — Postgres (RLS), Auth, Edge Functions (Deno), Storage |
| **Scale** | 32 tables · 63 migrations · 5 edge functions · ~200 source files |
| **Status** | Stages 0, 2, 3 and 4 of the [roadmap](docs/Improvement_Roadmap.md) complete; **Stage 1 has open security items** (see below); Stage 5 (commercial) in progress |
| **Tests** | 582 unit (vitest) · 35 end-to-end (Playwright) |

---

## Quick start

```bash
npm install
npm run dev
```

That is the whole setup. `.env.development` already points at the shared Supabase project, and
there is **no local database to run** — see [ADR-0004](docs/adr/0004-cloud-only-supabase-dev.md) for
why Docker is not part of this project.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (port 8080, or `PORT` if set) |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` — **the build does not typecheck** (SWC strips types) |
| `npm run lint` | ESLint. 0 errors is the bar; 27 known warnings are pre-existing |
| `npm test` | Vitest, single run |
| `npm run e2e` | Playwright against a running dev server (needs `.env.e2e`) |

Before you push anything: `npm run typecheck && npm test && npm run build`. The first one matters —
`vite build` uses SWC, which strips types without checking them, so a type error can build cleanly
and fail at runtime. That is not hypothetical; it hid 17 real errors once.

---

## How it fits together

```
Browser ─┬─ React app (Vite)                    static hosting (Vercel/Netlify)
         │
         ├─ PostgREST  ── Postgres + RLS         every finance table is tenant-scoped
         ├─ GoTrue      ── email/password auth   + a 16-digit code path for the Product Owner
         ├─ Edge Fns    ── live-price · billing-api · payments-webhook · po-auth
         └─ Storage     ── insurance documents
```

**Access is decided in three layers, and only the last one counts.**

1. `plan_menus(tenant)` — what the workspace's plan includes.
2. Tenant and member overrides — what the owner has switched off.
3. `get_effective_menus(tenant)` = the result, which the UI reads *and* `has_menu()` enforces
   inside RLS for every feature that owns its own tables.

The UI hiding a link is a convenience. The row-level policy is the security boundary. See
[ADR-0002](docs/adr/0002-menus-are-a-real-paywall.md) and
[docs/Authorization_Flow.md](docs/Authorization_Flow.md).

```
src/pages/            route pages (+ per-area folders: landing/ legal/ po/ trips/ export/ workspace/)
src/components/       feature components by area, ui/ = shadcn primitives
src/hooks/            data hooks (Supabase + TanStack Query)
src/contexts/         Tenant, Access, Theme
src/lib/              pure helpers — the arithmetic lives here, and so do the tests
src/integrations/     GENERATED Supabase client + types — never hand-edit
supabase/migrations/  append-only
supabase/functions/   edge functions
docs/                 reference, runbooks/ and adr/
e2e/                  Playwright specs + the shared sign-in helper
```

---

## The rules that matter

- **Never edit an applied migration.** Add a new timestamped one. There are no down scripts.
- **Never hand-edit `src/integrations/supabase/*`.** Regenerate — see
  [the migration runbook](docs/runbooks/apply-a-migration.md).
- **Security is server-side.** RLS is the gate; a client check is a nicety.
- **The Product Owner sees aggregates only**, via `SECURITY DEFINER` RPCs. Never raw finance rows.
- **No new paid services** without asking. No SMS.
- **A new `localStorage` key must be registered** in `src/lib/deviceLocal.ts`, with a reason, or its
  guard test fails. That test exists because five features became device-local by accident
  ([ADR-0003](docs/adr/0003-postgres-for-shared-state.md)).
- **No hand-written source file over 30 kB.** Split it, and prefer extracting the pure part — that
  is usually where the tests you cannot currently write are hiding.
- **Money numbers are derived, not stored** ([ADR-0006](docs/adr/0006-derive-money-never-store-it.md)).

Conventions in [CLAUDE.md](CLAUDE.md) and [docs/Coding_Standards.md](docs/Coding_Standards.md).

---

## Where to look

| I want to… | Read |
|---|---|
| reach a human, or check whether it is us | [/support](src/pages/public/Support.tsx) · [/status](src/pages/public/Status.tsx) — both public routes |
| understand a decision and why it went that way | [docs/adr/](docs/adr/) |
| do something operational (migrate, deploy, delete an account) | [docs/runbooks/](docs/runbooks/) |
| know what is done and what is next | [docs/Improvement_Roadmap.md](docs/Improvement_Roadmap.md) — the live tracker |
| run the test suite, or see what is left to run | [docs/REMAINING_TESTS.md](docs/REMAINING_TESTS.md) — 229 of 260 cases have never been executed |
| understand the data model | [docs/Database_Architecture.md](docs/Database_Architecture.md) |
| understand auth and the PIN gate | [docs/Authentication_Flow.md](docs/Authentication_Flow.md) |
| see the rules the code actually implements | [docs/Business_Rules.md](docs/Business_Rules.md) |

⚠️ The reports in `docs/` dated **2026-08-04** are an audit snapshot, not live state — much of what
they flag has since been fixed. The roadmap is the tracker; where a document has been superseded it
says so at the top.

---

## Known state, stated plainly

- **Three migrations are written but not applied** (legal acceptance, account-deletion queue,
  analytics functions). All three are listed in [CLAUDE.md](CLAUDE.md) and applying them needs a
  Supabase access token.
- **There is no payment gateway.** Upgrades are arranged by hand — the PO assigns a plan and the UI
  says "contact us" rather than rendering a checkout that cannot complete
  ([ADR-0005](docs/adr/0005-defer-the-payment-gateway.md)).
- **There are no database backups yet.** Supabase PITR is a paid tier and has not been approved.
  Until it is, [docs/Disaster_Recovery.md](docs/Disaster_Recovery.md) is honest about what that means.
- **`send-email` is deliberately not deployed** — it was an authenticated open mail relay (BUG-005).
- 🔴 **Five Stage 1 hardening items were never done**, found on 2026-08-12 by reading the code
  rather than the tracker: `po-auth` has no rate limit or lockout and still reveals which
  identifiers are Product Owners (BUG-006/007); `payments-webhook` accepts replays and compares
  signatures with `===` (BUG-008); no PO sign-in is audited; all five edge functions still send
  `Access-Control-Allow-Origin: *`; `send-email` is unrebuilt and safe only because it is not
  deployed — and the SEC-T negative suite that would have caught these was never written. Evidence in
  [docs/BUG_TRACKER.md](docs/BUG_TRACKER.md#reconciliation--2026-08-12).
- **There is no analytics script, events table or tracking cookie.** The product-analytics console
  at `/po/analytics` derives everything from records already stored, which is why it can see nothing
  an anonymous visitor does ([ADR-0009](docs/adr/0009-analytics-without-tracking.md)). A test fails
  if a vendor snippet appears anywhere.
- **This directory is not a git repository**, so `.github/workflows/ci.yml` is inert. The gates
  above are run by hand.
