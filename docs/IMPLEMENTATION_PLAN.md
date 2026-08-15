# FinRoot — Step-by-Step Implementation Plan

> Companion to [DESIGN.md](./DESIGN.md). Cost-first, low-traffic. Work top to bottom; each phase is shippable and independently testable.

## Ground rules

- **Never** edit existing migrations or generated `src/integrations/supabase/client.ts` / `types.ts`. Add new migrations; regenerate types with `supabase gen types`.
- Each phase = new migration(s) + matching React Query hooks + UI wiring + tests.
- Verify RLS with two test users (member vs non-member) before moving on.
- Keep everything on free tiers. No new paid service without explicit approval.

---

## Phase 0 — Local backend setup (½ day)

1. Install Supabase CLI; `supabase init` is already done (config.toml exists).
2. `supabase start` (local Docker stack) for development; link the cloud project for deploys.
3. Confirm `.env` has `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Baseline: run existing migrations locally; smoke-test login.

**Done when:** app runs locally against local Supabase; existing 5 tables present.

---

## Phase 1 — Tenancy foundation (2–3 days)

**Migration:**
- Create `profiles`, `tenants`, `tenant_members`, `platform_admins`.
- Helper functions (SECURITY DEFINER): `is_tenant_member(tenant_id, min_role)`, `is_platform_admin()`, `current_tenant_id()` (first active membership).
- Trigger on `auth.users` insert → create `profiles` row + personal `tenant` + owner `tenant_members` row.
- Backfill: for every existing `auth.users`, create personal tenant + membership + profile.

**Frontend:**
- `TenantContext` (replaces nothing yet) exposing `currentTenantId`, memberships, role.
- Regenerate `types.ts`.

**Done when:** new signups auto-create a tenant; existing users have a personal tenant; helpers unit-tested.

---

## Phase 2 — Migrate finance data to the server (4–6 days)

**Migration:**
- Add `tenant_id` to `transactions`, `budgets`, `goals`, `recurring_items`; backfill from owner's personal tenant; swap RLS to `is_tenant_member(...)`.
- New tenant-scoped tables + RLS: `accounts`, `debts`, `investments`, `insurance`, `net_worth_snapshots`, `trips`, `reminders`, `tracked_subscriptions` (finance-feature subs, NOT the billing `subscriptions` table).

**Frontend (per module):**
- Replace each `lib/*Store.ts` (localStorage) with a React Query hook hitting Supabase (model on existing `useTransactions`/`useBudgets`).
- One-time **client migration**: on first login, if localStorage data exists and server is empty, upload it, then mark migrated. (Note: legacy keys vary — e.g. `finroots.accounts.v1` but `subscriptions.records.v1` — capture each exact key.)
- Keep the same component APIs to minimize churn.

**Order:** accounts → investments → debts → insurance → net-worth → trips → reminders → tracked_subscriptions.

**Done when:** all data persists server-side, syncs across devices, localStorage stores removed.

---

## Phase 3 — Server-enforced permissions (2–3 days)

**Migration:**
- `get_effective_menus(tenant_id)` RPC = `plan.menu_set ⊕ tenant.menu_overrides ⊕ member.menu_overrides`.
- RPCs for collaborator management: `invite_member`, `update_member_role`, `set_member_menus`, `revoke_member` (each checks role + writes `audit_log`).

**Frontend:**
- Rewrite `AccessContext` to read memberships + `get_effective_menus` from the server (drop `finroots.access.*` localStorage).
- `PermissionsCenter.tsx` → calls the new RPCs.
- Route guards use server-resolved menus; `canWrite` derives from server role.

**Done when:** permissions survive a devtools wipe; a viewer cannot mutate via API (RLS-tested).

---

## Phase 4 — Plans & subscription monitoring (2–3 days)

**Migration:**
- `plans` (+ seed: Free, Pro). Add `tenant_id` + `plan_id` to the **existing** `subscriptions` table (do not create `tenant_subscriptions`); backfill from each user's personal tenant.
- On signup trigger → attach default trial/free subscription row.
- RPC `tenant_subscription_status(tenant_id)`; scheduled function (pg_cron / Supabase scheduled edge) to flip `active`→`expired` past `period_end`.

**Frontend:**
- Subscription status banner; gate menus by plan via `get_effective_menus`.

**Done when:** menus reflect plan; expiry transitions run automatically.

---

## Phase 5 — Product Owner console (4–5 days)

**Migration / functions:**
- Seed first `platform_admins` row (you).
- Store hashed 16-digit secret (pgcrypto).
- Edge function **`po-auth`**: resolve email/username/mobile, password OR 16-digit secret path, verify `platform_admins`, write `audit_log`.
- PO aggregate RPCs (SECURITY DEFINER, aggregates only): `po_dashboard_stats()` (total tenants, active/expired subs, user counts, financial summary), `po_recent_activity()`, `po_list_tenants()`.
- PO management RPCs: `po_create_tenant`, `po_set_tenant_status`, `po_assign_plan`, `po_set_tenant_menus`, `po_delete_tenant` (all audited).

**Frontend:**
- PO login screen (multi-method + secret fallback).
- PO dashboard: tenant stats, subscriptions, user stats, financial summary, recent activity, alerts, quick actions.
- Tenant management table (CRUD, activate/deactivate, plan + menu control).

**Done when:** PO logs in via all 4 methods, sees only aggregates, manages tenants; every action audited.

---

## Phase 6 — Notifications, audit UI, hardening (2–3 days)

- `notifications` table + in-app bell wired to `src/pages/Notifications.tsx`.
- Resend edge function for email (subscription expiring, member invited, tenant suspended).
- Audit log viewer (PO).
- RLS test matrix (member/non-member/viewer/PO) in `src/test` + Playwright happy paths.
- Enable Supabase DB backups (Pro) when going live.

**Done when:** alerts fire in-app + email; audit visible; test suite green.

---

## Phase 7 — Self-serve billing (Paddle) (3–4 days, optional/later)

- Paddle account + products mapped to `plans`.
- Reuse/extend `payments-webhook` edge function → update `tenant_subscriptions` on Paddle events (signature-verified).
- Checkout/upgrade flow in `Billing.tsx`.

**Done when:** a tenant self-upgrades and the subscription updates from the webhook.

---

## Sequencing & estimate

| Phase | Focus | Est. |
|---|---|---|
| 0 | Local setup | ½ day |
| 1 | Tenancy foundation | 2–3 d |
| 2 | Finance data → server | 4–6 d |
| 3 | Server permissions | 2–3 d |
| 4 | Plans & subscriptions | 2–3 d |
| 5 | Product Owner console | 4–5 d |
| 6 | Notifications/audit/hardening | 2–3 d |
| 7 | Paddle billing (later) | 3–4 d |

**MVP backend = Phases 1–5** (~3 weeks solo). Phases 6–7 follow.

## Cost summary

$0/month through launch (Supabase free, Vercel/Netlify free, Resend free). Supabase Pro ($25/mo) only when free limits are hit; Paddle takes a % of revenue only.
