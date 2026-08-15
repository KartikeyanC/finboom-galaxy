# FinRoot — Multi-Tenant Backend Design

> Status: **Confirmed** (2026-06-04). Source of truth for the backend evolution.
> Companion docs: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), [../CLAUDE.md](../CLAUDE.md).

## 1. Understanding Summary

- **What:** Evolve FinRoot (Finboom Galaxy) from a localStorage-heavy single-user app into a small multi-tenant finance SaaS with a Product Owner admin layer.
- **Why:** Today nothing is enforced server-side — permissions (`AccessContext`) and most finance data (`lib/*Store.ts`) live in the browser; there is no tenancy, plans, subscription monitoring, or audit.
- **Who:** Individual users (each = one tenant workspace, with optional invited collaborators) + one Product Owner (master admin).
- **Constraints:** Low traffic, few users, **cost-first** (free tiers), all-Supabase backend + free frontend host. No rewrite of the existing React UI.
- **Non-goals:** No SMS, no high-scale infrastructure, no UI redesign, no premature optimization (YAGNI).

## 2. Current State (baseline)

- **Frontend:** ~22.7k LOC, Vite + React 18 + TS + shadcn/ui, 24 pages, real Supabase email/password auth (`useAuth`).
- **Backend (existing):** 5 tables with per-user RLS (`auth.uid() = user_id`): `transactions`, `budgets`, `goals`, `recurring_items`, `subscriptions`. **NOTE (verified 2026-06-04):** the existing `subscriptions` table is the **SaaS billing** table (Paddle fields: `paddle_subscription_id`, `plan_name`, `current_period_end`, …), driven by `Billing.tsx` → `billing-api` + `payments-webhook` edge functions. The *finance-feature* "Subscriptions" (track Netflix/Spotify) is a **separate, localStorage-only** store (`lib/subscriptionsStore.ts`, key `subscriptions.records.v1`, page `Subscriptions.tsx`). Other edge functions: `live-price`.
- **Gaps:**
  1. localStorage-only data: accounts, debts, investments, insurance, net worth, trips, reminders.
  2. localStorage-only permissions: `AccessContext` (`finroots.access.profiles`) — unenforced, editable in devtools.
  3. No multi-tenancy: no Product Owner, tenants, plans, menu-access control, or audit log.

## 3. Decision Log

| # | Decision | Choice | Alternatives considered | Why |
|---|---|---|---|---|
| 1 | Tenancy model | Tenant = individual workspace; `tenant_members` for collaborators | Schema-per-tenant; org-first model | Simplest for "few users"; RLS handles isolation |
| 2 | Access control | Server-side **membership RLS**; drop localStorage perms | Keep client perms; JWT custom claims | localStorage is unenforceable |
| 3 | Menu access | `plan.menu_set ⊕ tenant.menu_overrides ⊕ member.menu_overrides` | Plan-only; role-only | Per-tenant + per-member flexibility |
| 4 | Billing | Hybrid: PO manual entry + Paddle self-serve | Stripe; manual-only | Paddle = merchant-of-record (no tax/VAT burden); cheap start |
| 5 | PO auth | email / mobile / username + 16-digit secret fallback | email-only; magic link | Per requirements |
| 6 | Tenant auth | Supabase email + password | OAuth providers | Already wired; lowest cost |
| 7 | Notifications | In-app + email (Resend free tier) | SMS; Twilio | No SMS cost |
| 8 | Hosting | Supabase free→Pro; Vercel/Netlify free frontend | VPS; AWS | $0 until growth |
| 9 | PO data access | Aggregates via SECURITY DEFINER RPCs only | Direct table read with bypass RLS | PO must never read raw finance rows |
| 10 | Billing table | **Evolve existing `subscriptions`** (add `tenant_id`, `plan_id`) | New `tenant_subscriptions` table | Already wired to Paddle webhook + billing-api; don't fork billing |
| 11 | Finance-feature subs table | New `tracked_subscriptions` (tenant-scoped) | Reuse `subscriptions` name | `subscriptions` is taken by billing; avoid collision |

## 4. Data Model

### New core tables
- **`profiles`** — extends `auth.users`: `id (FK auth.users)`, `username (unique)`, `mobile (unique)`, `display_name`, `created_at`. Enables username/mobile login lookup.
- **`tenants`** — `id`, `name`, `status` (active/suspended/deleted), `menu_overrides jsonb`, `created_by`, `created_at`, `updated_at`.
- **`tenant_members`** — `(tenant_id, user_id)` PK, `role` (owner/admin/viewer), `menu_overrides jsonb`, `status` (active/invited/revoked), `invited_by`, `created_at`. **Replaces `AccessContext` localStorage.**
- **`platform_admins`** — `user_id` PK. Product Owner(s). PO is *not* a tenant member.
- **`plans`** — `id`, `name`, `price_cents`, `currency`, `interval` (month/year), `menu_set jsonb` (allowed menu ids), `limits jsonb`, `is_active`. (Maps to Paddle price/product ids.)
- **`subscriptions`** *(evolve existing table)* — add `tenant_id` (per-tenant billing) and `plan_id` (FK → `plans`); keep existing Paddle columns and `payments-webhook` integration. This is the per-tenant SaaS billing record. Add a `provider` notion (manual/paddle) so the PO can grant a plan manually.
- **`audit_log`** — `id`, `actor_user_id`, `tenant_id (nullable)`, `action`, `entity`, `entity_id`, `metadata jsonb`, `created_at`.
- **`notifications`** — `id`, `tenant_id`, `user_id`, `type`, `payload jsonb`, `read_at (nullable)`, `created_at`.

### Finance tables (migrate localStorage → DB), all tenant-scoped
New tables: `accounts`, `debts`, `investments`, `insurance`, `net_worth_snapshots`, `trips`, `reminders`, `tracked_subscriptions` (finance-feature Netflix/Spotify tracker, from `lib/subscriptionsStore.ts`).
Existing tables `transactions`, `budgets`, `goals`, `recurring_items` get a **`tenant_id`** column (backfilled from `user_id`'s personal tenant). The existing billing `subscriptions` table likewise gains `tenant_id` + `plan_id`.

### Menu IDs (canonical, from `lib/accessMenus.ts`)
`dashboard, income, expenses, investments, budget, goals, reminders, calculator, bill-scan, import, insurance, budget-allocator, net-worth, subscriptions, trips`.

## 5. Security Model (RLS)

- One SECURITY DEFINER helper: **`is_tenant_member(tenant_id uuid, min_role text) returns boolean`** — checks `tenant_members` for an active row with role ≥ `min_role` (viewer < admin < owner).
- Every tenant-scoped table policy:
  - **SELECT:** `is_tenant_member(tenant_id, 'viewer')`
  - **INSERT/UPDATE/DELETE:** `is_tenant_member(tenant_id, 'admin')` (or `'owner'` for destructive tenant-level ops)
- **Effective menus** resolved server-side by RPC `get_effective_menus(tenant_id)` = plan.menu_set, minus tenant denies, minus/plus member overrides. UI uses it to render nav; RLS is the real gate for data.
- **Product Owner:**
  - `is_platform_admin()` SECURITY DEFINER helper.
  - PO management writes (create/suspend/delete tenant, assign plan, set menus) go through SECURITY DEFINER RPCs that check `is_platform_admin()` and write `audit_log`.
  - PO dashboard reads via SECURITY DEFINER RPCs returning **aggregates only** (counts, sums) — never raw finance rows.
- **Secrets:** 16-digit PO secret stored **hashed** (pgcrypto). Verified only inside the `po-auth` edge function.

## 6. Authentication Flows

- **Tenant user:** Supabase `signInWithPassword` (already wired). On signup, a trigger/RPC creates a personal `tenant` + `tenant_members` owner row + `profiles` row + default trial `tenant_subscription`.
- **Product Owner:** edge function **`po-auth`**:
  1. Resolve identifier (email / username / mobile) → email via `profiles`.
  2. If password path → verify via Supabase auth.
  3. If 16-digit secret path → verify hash, then mint a session.
  4. Confirm `platform_admins` membership; write `audit_log`.

## 7. Notifications & Audit

- **Audit:** all PO actions + critical tenant ops (member invite/revoke, plan change) write to `audit_log` via the RPC that performs them.
- **Notifications:** `notifications` table drives the in-app bell; an edge function sends matching emails via Resend (free tier). Triggers: subscription expiring/expired, member invited, tenant suspended.

## 8. Hosting & Cost

| Component | Tier | Cost |
|---|---|---|
| Supabase (DB + Auth + Edge + Storage) | Free → Pro | $0 → $25/mo at growth |
| Frontend (Vercel or Netlify) | Free | $0 |
| Email (Resend) | Free (3k/mo) | $0 |
| Billing (Paddle) | Pay-per-txn | % of revenue only |

Stays **$0/month** until real usage forces Supabase Pro.

## 9. Risks

- **Backfill correctness** when adding `tenant_id` to existing tables — mitigate with a one-shot migration mapping each `user_id` → personal tenant.
- **localStorage→DB migration** must not lose existing user data — provide a one-time client import on first login.
- **RLS mistakes** = data leak — every table tested with the membership helper before shipping.
- **Generated `client.ts`/`types.ts`** must be regenerated, never hand-edited.
