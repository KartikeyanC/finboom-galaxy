# Architecture

> **Audit date:** 2026-08-04 · **Scope:** entire repository at `F:\Movie\AK\FinRoot\_extracted`
> **Status:** Phase 1 discovery — descriptive, not prescriptive. Findings and fixes live in
> [Known_Issues.md](./Known_Issues.md), [Security_Audit.md](./Security_Audit.md) and
> [Improvement_Roadmap.md](./Improvement_Roadmap.md).

---

## 1. What this system is

FinRoot (originally "Finboom Galaxy", scaffolded by Lovable) is a **personal-finance workspace**
that has been evolved into a **small multi-tenant SaaS**. It has three distinct user surfaces:

| Surface | Route prefix | Audience | Auth |
|---|---|---|---|
| Marketing site | `/` | anonymous visitors | none |
| Tenant app | `/app/*` | workspace owners + invited collaborators | Supabase email/password (+ Google via Lovable Cloud), then an optional device PIN gate (Stage 5.4) |
| Product Owner console | `/po/*` | platform operator(s) | Supabase password **or** 16-digit secret code → magic-link session |

There is no separate backend service. **Supabase is the backend**: Postgres (with RLS as the
authorization engine), GoTrue auth, Deno edge functions, and Realtime.

## 2. Runtime topology

```
┌──────────────────────────────────────────────────────────┐
│ Browser (SPA, Vite/React 18)                             │
│                                                          │
│  React Router ─ 3 route trees: /, /app/*, /po/*          │
│  TanStack Query ─ all server state                       │
│  Providers: Theme → Tooltip → Router → Auth → Tenant     │
│             → Access                                     │
│  Service worker (prod only): app-shell cache             │
└───────┬──────────────────────────────┬───────────────────┘
        │ supabase-js (anon key + user JWT)                │ fetch
        │                                                  │
┌───────▼──────────────────────────┐   ┌──────────────────▼──────────┐
│ Supabase Postgres                │   │ Supabase Edge Functions      │
│  · 22 public tables              │   │  po-auth        (public)     │
│  · RLS on every table            │   │  live-price     (public)     │
│  · ~40 SECURITY DEFINER fns/RPCs │◄──┤  payments-webhook (public)   │
│  · audit_log                     │   │  billing-api    (JWT)        │
│  · Realtime publication (3 tbls) │   │  send-email     (JWT)        │
└──────────────────────────────────┘   └──────┬───────────────────────┘
                                              │ service_role
                              ┌───────────────┴──────────────┐
                              │ Paddle · Resend · Yahoo · mfapi│
                              └───────────────────────────────┘
```

## 3. Layers

### 3.1 Presentation
- `src/pages/` — 27 route components (24 app/public + 9 under `pages/po/`).
- `src/components/<feature>/` — accounts, budgets, dashboard, expenses, goals, import,
  income, investments, permissions, recurring, reminders, subscriptions, transactions,
  filters, landing, brand, po, settings.
- `src/components/ui/` — 50 shadcn/Radix primitives (unmodified except `tabs`, `chart`,
  plus three project-local additions: `icon-chip`, `money-input`, `category-chart`,
  `date-picker-field`, `password-input`).
- Styling: Tailwind + CSS custom properties in `src/index.css`; five themes
  (`obsidian` default/dark, `light`, plus cyber/mint/copper) driven by `ThemeContext`.

### 3.2 State & data access — **three coexisting patterns**
This is the single most important structural fact about the codebase.

| Pattern | Where | Example |
|---|---|---|
| **A. React Query hook → Supabase** | `src/hooks/use*.ts` | `useTransactions`, `useBudgets`, `useGoals`, `useRecurring`, `useNotifications`, `useDematAccounts`, `useIncomeStreams` |
| **B. `lib/*Store.ts` "store" hooks** — same shape as the old localStorage stores, now backed by Supabase, each with a one-time localStorage→DB importer | `src/lib/` | `accountsStore`, `investmentsStore`, `debtsStore`, `insuranceStore`, `netWorthStore`, `tripsStore`, `remindersStore`, `subscriptionsStore` |
| **C. Still pure localStorage** | scattered | `recurringReminders.ts`, `expenseSubcategories.ts` (custom subcategories), `categories.ts` (custom categories), `useAccountBalanceHistory.ts`, `netWorthStore` history seed, `dashboardLayout.ts`, `appLock.ts`, `valar.profiles` saved logins |

Pattern B was a deliberate migration bridge; it has become permanent. Pattern C means several
user-visible features are **device-local and lost on browser change** — see
[Known_Issues.md](./Known_Issues.md) §"Data durability".

### 3.3 Authorization
Two independent mechanisms, both server-resolved:

1. **Row access** — Postgres RLS. Every tenant table policy is
   `is_tenant_member(tenant_id, 'viewer' | 'admin')`.
2. **Feature/menu access** — `get_effective_menus(tenant_id)` RPC returns
   `plan.menu_set ⊖ tenant.menu_overrides.deny ∩ member.menu_overrides.allow`.
   Consumed by `AccessContext` → `MenuGuard` (route gate) and `AppSidebar` (nav rendering).

Menu access is **presentation-only**. A user denied the `investments` menu can still read
`investments` rows via the REST API, because RLS grants row access on membership alone. See
[Authorization_Flow.md](./Authorization_Flow.md) §5.

### 3.4 Tenancy
`tenants` ← `tenant_members(tenant_id, user_id, role)` → `auth.users`. Every finance table
carries `tenant_id NOT NULL DEFAULT current_tenant_id()`.

**Critical structural gap:** no client code ever reads or writes `tenant_id`. Inserts rely on
the DB default (`current_tenant_id()` = the user's *first* membership by `created_at`), and
reads rely on RLS returning rows for *all* memberships. `TenantContext.currentTenantId` drives
only the menus/billing/members RPCs — never the finance data layer. For a single-workspace user
this is invisible; for anyone in two workspaces it silently misroutes writes and merges reads.
See [Known_Issues.md](./Known_Issues.md) **KI-001**.

### 3.5 Edge functions
| Function | `verify_jwt` | Purpose | Secrets used |
|---|---|---|---|
| `po-auth` | **false** | resolve PO identifier → email; verify 16-digit secret → mint magic-link token | `SUPABASE_SERVICE_ROLE_KEY` |
| `payments-webhook` | **false** | Paddle subscription events → upsert `subscriptions` by `tenant_id` | `PAYMENTS_*_WEBHOOK_SECRET`, service role |
| `live-price` | **false** | proxy Yahoo Finance / mfapi.in quotes | none |
| `billing-api` | true | read subscription + Paddle transactions; cancel/resume/invoice | `PADDLE_*_API_KEY`, service role |
| `send-email` | true | Resend transactional send | `RESEND_API_KEY` |

## 4. Request lifecycles

**Read (e.g. expenses list)**
`Expenses.tsx` → `useTransactions("expense")` → `supabase.from("transactions").select("*")`
→ PostgREST → RLS `tx_select` → rows for every tenant the JWT's user belongs to → React Query
cache keyed `["transactions","expense",user.id]`.

**Write (e.g. add expense)**
`TransactionDialog` → `useCreateTransaction` → insert `{...input, user_id}` → DB fills
`tenant_id = current_tenant_id()` → RLS `tx_insert` requires `is_tenant_member(tenant_id,'admin')`
→ invalidate `["transactions"]`.

**Plan change (self-serve)**
`Billing.tsx` → `upgradeable_plans()` → Paddle.js checkout (`customData: {user_id, tenant_id}`)
→ Paddle → `payments-webhook` (HMAC verify) → service-role upsert on `subscriptions`
`onConflict: tenant_id` → next `get_effective_menus` call reflects the new ceiling.

**PO secret login**
`PoLogin` → `po-auth {mode:"secret"}` → `po_verify_secret` (bcrypt) →
`auth.admin.generateLink('magiclink')` → client `verifyOtp({token_hash})` → session →
`PoShell` re-checks `is_platform_admin()`.

## 5. Cross-cutting concerns — current state

| Concern | Implementation | Assessment |
|---|---|---|
| Error handling | per-call `toast.error(e.message)` | no React error boundary anywhere; a render throw blanks the app |
| Logging | `console.*` in edge functions only | no structured logs, no correlation ids |
| Monitoring | none | no Sentry/APM/uptime check |
| Rate limiting | none (Supabase platform defaults only) | public edge functions are unthrottled |
| Caching | React Query (`staleTime` 60 s), SW app-shell | no HTTP cache headers controlled by app |
| i18n | none | strings hardcoded EN; currency hardcoded `en-IN`/₹ in `lib/finance.ts` |
| Feature flags | none | `plans.menu_set` is the closest analogue |
| Background jobs | **none scheduled** | `expire_subscriptions()` and `notify_expiring_subscriptions()` exist but no pg_cron job calls them |
| CI/CD | **none** | no `.github/`, no Dockerfile, no pipeline; deploys are manual CLI |

## 6. Environments

| Env | Supabase ref | Config source |
|---|---|---|
| Live (Lovable-managed) | `tsmdnfywxsjsjqjszoek` | `.env` |
| Development | `hkfwuxqeexamyphcgkxr` (ap-northeast-1) | `.env.development` |
| Production build | inherits `.env` | `.env.production` (Paddle live token only) |

`supabase/config.toml` pins `project_id` to the **live** ref, so any CLI command without an
explicit `--project-ref` targets production. All 32 migrations have been applied to dev; the
live project's migration state is not tracked in this repo. See
[Deployment_Checklist.md](./Deployment_Checklist.md).

## 7. Build output (verified 2026-08-04)

```
dist/assets/index-*.js      2,562 kB  (735 kB gzip)   ← single main chunk
dist/assets/pdf-*.js          458 kB  (136 kB gzip)   ← lazy (pdfjs)
dist/assets/pdf.worker*.mjs 1,232 kB                  ← lazy
dist/assets/index-*.css       149 kB  ( 24 kB gzip)
```

No route-level code splitting: every page, `recharts`, `framer-motion`, `xlsx` and the
71 kB `Landing.tsx` ship in one chunk to every visitor. See
[Performance_Report.md](./Performance_Report.md).

## 8. Architectural strengths

- Authorization is genuinely server-side. RLS is applied uniformly and consistently across all
  22 tables; the policy shape never varies.
- Privileged mutations funnel through audited `SECURITY DEFINER` RPCs rather than table writes.
- Migrations are append-only and readable; each has a header comment explaining intent.
- The PO console reads aggregates via RPC rather than raw finance rows, as designed.
- Clean provider composition and a single generated types file keep the client coherent.

## 9. Architectural weaknesses (summary — details in the linked reports)

1. `tenant_id` is invisible to the client (KI-001) — tenancy is nominal, not enforced end-to-end.
2. Three parallel data-access patterns; localStorage still holds user-visible state.
3. `subscriptions` is directly UPDATE-able by tenant owners → plan self-upgrade (SEC-001).
4. Several `SECURITY DEFINER` helpers were never revoked from `PUBLIC` (SEC-002/003).
5. `send-email` is an authenticated open mail relay (SEC-004).
6. No CI, no error boundary, no monitoring, no scheduled jobs, ~2 % test coverage.
7. TypeScript `strict` is off and `tsc` currently fails with 10 errors that the SWC build ignores.
