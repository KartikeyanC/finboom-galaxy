# Database Architecture

> Postgres 15 (Supabase). Schema `public`. 22 tables, ~40 functions, RLS on every table.
> Derived by reading all 32 files in `supabase/migrations/`. Audit date 2026-08-04.
> Findings and remediation: [Database_Report.md](./Database_Report.md).

---

## 1. Entity map

```
auth.users ─1:1─ profiles
     │
     ├─1:N─ tenant_members ─N:1─ tenants ─1:1─ subscriptions ─N:1─ plans
     │                                │
     │                                └─1:N─ all finance tables (tenant_id)
     ├─1:1─ platform_admins            
     ├─1:N─ notifications
     ├─1:N─ audit_log (actor)
     └─1:N─ account_balance_history

tenants ──1:N──> accounts · transactions · budgets · goals · recurring_items ·
                 investments · debts · insurance · net_worth_entries · trips ·
                 reminders · tracked_subscriptions · income_streams ·
                 demat_accounts ─1:N─ demat_ledger

standalone: coupons · site_settings
```

## 2. Table catalogue

### 2.1 Identity & tenancy

| Table | PK | Key columns | RLS |
|---|---|---|---|
| `profiles` | `id` → `auth.users` | `username` UQ, `mobile` UQ, `display_name` | own row; PO reads all |
| `tenants` | `id` | `name`, `status` ∈ {active,suspended,deleted}, `menu_overrides jsonb`, `created_by` | member reads; owner/PO writes; **insert allowed to any user where `created_by = auth.uid()`** |
| `tenant_members` | `(tenant_id,user_id)` | `role` ∈ {owner,admin,viewer}, `menu_overrides jsonb`, `status` ∈ {active,invited,revoked}, `invited_by` | self OR co-member reads; owner/PO writes |
| `platform_admins` | `user_id` | `secret_hash` (bcrypt), `po_user_id` UQ, `po_number_id` UQ | self or PO reads; **no insert/update policy → seeded manually via service role** |

### 2.2 Billing

| Table | PK | Key columns | RLS |
|---|---|---|---|
| `plans` | `id` | `name` UQ, `price_cents`, `currency`, `interval`, `menu_set jsonb`, `limits jsonb`, `is_active`, `paddle_price_id` | `SELECT USING (true)` for `anon` + `authenticated` |
| `subscriptions` | `id` | `tenant_id` **UNIQUE**, `plan_id`, `provider` ∈ {manual,paddle}, all Paddle ids, `status`, `current_period_start/end`, `raw jsonb` | SELECT: viewer/PO · **UPDATE: owner/PO** · no INSERT/DELETE policy |
| `coupons` | `id` | `code` UQ, `discount_percent`, `active`, `expires_at` | public reads active+unexpired; PO reads all; writes via RPC only |

### 2.3 Finance (all tenant-scoped, identical policy shape)

Every table below has:
`tenant_id uuid NOT NULL DEFAULT current_tenant_id() REFERENCES tenants ON DELETE CASCADE`,
`user_id uuid DEFAULT auth.uid() REFERENCES auth.users ON DELETE SET NULL`,
`created_at`/`updated_at` + an `update_updated_at_column()` trigger, and policies
`SELECT = is_tenant_member(tenant_id,'viewer')`,
`INSERT/UPDATE/DELETE = is_tenant_member(tenant_id,'admin')`.

| Table | Distinctive columns | Index |
|---|---|---|
| `transactions` | `type`(income/expense), `amount numeric(14,2)`, `currency`, `category`, `description`, `occurred_at`, `source_recurring_id` | `(user_id,occurred_at DESC)`, `(tenant_id,occurred_at DESC)`, `(source_recurring_id)` |
| `budgets` | `bucket`, `allocated`, `spent`, `period`, `period_start`; **UQ `(user_id,bucket,period_start)`** | `(tenant_id)` |
| `goals` | `title`, `target_amount`, `current_amount`, `target_date`, `status` | `(tenant_id)` |
| `recurring_items` | `type`, `frequency`, `next_due_date`, `last_generated_at`, `fx_rate`, `is_active` | `(user_id,type)`, `(user_id,next_due_date)`, `(tenant_id)` |
| `accounts` | `type`(bank/debit/credit/wallet/cash/investment/other), `bank`, `last4`, `exp_*`, `opening_balance`, `purposes text[]` | `(tenant_id)` |
| `investments` | `asset` (9 kinds), `broker`, `fields jsonb`, `derived jsonb`, `saved_at` | `(tenant_id,saved_at DESC)` |
| `debts` | `lender`, `total_amount`, `duration`, `monthly`, `installments jsonb` | `(tenant_id,created_at DESC)` |
| `insurance` | `category`, `sum_insured`, `premium`, `due_date`, **`document_data_url text` (base64)** | `(tenant_id,created_at)` |
| `net_worth_entries` | `kind`(asset/liability), `grp`, `name`, `amount numeric(16,2)` | `(tenant_id,created_at)` |
| `trips` | `kind` ∈ **{solo,friends,family}**, `days`, `companions/allocation/expenses jsonb`, `status` | `(tenant_id,created_at DESC)` |
| `reminders` | `context` ∈ {fixed_due,balance_buffer,maturity}, `due_date`, `maturity_leads/debt jsonb`, `status` | `(tenant_id,due_date)` |
| `tracked_subscriptions` | `frequency` ∈ {weekly,monthly,annual}, `renewal_date`, `status` | `(tenant_id,renewal_date)` |
| `income_streams` | `type`(active/passive), `exchange_rate_to_inr`, `is_visible`, `display_order` | `(tenant_id,display_order)` |
| `demat_accounts` | `broker`, `nickname`, `opening_balance`, `opening_date`; **no `user_id`** | `(tenant_id)` |
| `demat_ledger` | `type` ∈ {fund_in,fund_out,buy,sell,dividend}, `amount CHECK > 0`, `ref_investment_id` | `(demat_account_id,txn_date DESC)`, `(tenant_id)` |

### 2.4 Platform

| Table | Notes |
|---|---|
| `audit_log` | `actor_user_id`, `tenant_id`, `action`, `entity`, `entity_id`, `metadata jsonb`. SELECT = tenant owner or PO. Written only by `log_audit()`. |
| `notifications` | `user_id` NOT NULL, `type`, `title`, `body`, `payload`, `read_at`. SELECT/UPDATE own only; insert via `create_notification()`. |
| `site_settings` | `key` PK / `value jsonb`. Anon may read `key LIKE 'landing_%'`. Keys in use: `landing_pricing`, `landing_branding`. |
| `account_balance_history` | **user-scoped, not tenant-scoped** (`auth.uid() = user_id`, `FOR ALL`). Migration exists but the client (`useAccountBalanceHistory.ts`) was rewritten to use `localStorage` — the table is effectively dead. |

## 3. Functions

### 3.1 Helpers (SECURITY DEFINER, STABLE)
| Function | Returns | Notes |
|---|---|---|
| `is_platform_admin()` | bool | used in ~25 policies/RPCs |
| `is_tenant_member(tenant_id, min_role)` | bool | role ranking owner 3 > admin 2 > viewer 1 |
| `current_tenant_id()` | uuid | **first active membership ordered by `created_at`** — the tenancy weak point |
| `all_feature_menus()` | text[] | 14 ids; must mirror `src/lib/accessMenus.ts` |
| `plan_menus(tenant)` | text[] | active, unexpired sub's `menu_set`; `["*"]` → all; fallback Free |
| `get_effective_menus(tenant)` | text[] | plan ⊖ tenant deny ∩ member allow; owner → plan menus |
| `update_updated_at_column()` | trigger | shared |
| `handle_new_user()` | trigger on `auth.users` | creates profile + personal tenant + owner membership + Free subscription |

### 3.2 Tenant RPCs (`authenticated`)
`list_tenant_members`, `invite_member`, `update_member_role`, `set_member_menus`,
`revoke_member`, `tenant_subscription_status`, `mark_all_notifications_read`,
`upgradeable_plans`.
All member-mutating RPCs guard on `is_tenant_member(tenant,'owner') OR is_platform_admin()`
and call `log_audit()`.

### 3.3 Product Owner RPCs (`authenticated`, guarded by `is_platform_admin()`)
`po_dashboard_stats`, `po_recent_activity`, `po_list_tenants`, `po_audit_log`,
`po_set_tenant_status`, `po_assign_plan`, `po_set_tenant_menus`, `po_delete_tenant`,
`po_create_tenant`, `po_set_plan_menus`, `po_set_site_setting`,
`po_create_coupon`, `po_list_coupons`, `po_set_coupon_active`, `po_delete_coupon`,
`po_set_secret`, `po_has_secret`, `po_revoke_secret`, `po_get_identifiers`,
`po_set_identifiers`.

### 3.4 Service-role only (explicitly `REVOKE ... FROM PUBLIC`)
`po_resolve_identifier(text)`, `po_verify_secret(text,text)` — called by the `po-auth`
edge function.

### 3.5 Unscheduled maintenance functions
`expire_subscriptions()`, `notify_expiring_subscriptions(days)` — written for pg_cron but
**no cron job is defined anywhere in the repo**. Expiry is therefore evaluated lazily at read
time by `plan_menus()` / `tenant_subscription_status()`.

## 4. Constraints, defaults and integrity

- All FKs to `tenants` are `ON DELETE CASCADE`; FKs to `auth.users` are `ON DELETE SET NULL`
  (finance tables) or `CASCADE` (`profiles`, `tenant_members`, `platform_admins`,
  `notifications`).
- Enumerations are enforced with `CHECK (col IN (...))` rather than Postgres enum types —
  cheap to add, but adding a value requires a new migration (see the `trips.kind` bug).
- Money is `numeric(14,2)` (`net_worth_entries` uses `16,2`) — correct choice, no floats.
- `budgets` uniqueness is `(user_id, bucket, period_start)` — **not** tenant-scoped, which is
  inconsistent with the rest of the schema.
- `subscriptions.tenant_id` is `UNIQUE` (nullable), which is what lets the Paddle webhook
  upsert `onConflict: tenant_id`.

## 5. Realtime

`transactions`, `budgets`, `goals` are in the `supabase_realtime` publication with
`REPLICA IDENTITY FULL`. The client subscribes with `filter: user_id=eq.<uid>`.

## 6. Migration history

| Range | Theme |
|---|---|
| `20260525` – `20260601` | Lovable baseline: transactions, budgets, goals, recurring_items, subscriptions (per-user RLS), realtime |
| `20260604120000` | Phase 1 — tenancy foundation |
| `20260604130000` – `190100` | Phase 2a–2i — tenant-scope existing tables; migrate 8 localStorage stores |
| `20260604200000` | Phase 3 — audit_log, effective menus, member RPCs |
| `20260604210000` | Phase 4 — plans, tenant billing, plan-gated menus, expiry |
| `20260604220000`/`220100` | Phase 5 — PO console backend (+ ambiguity fix) |
| `20260604230000` | Phase 6 — notifications, PO audit viewer |
| `20260604240000` | Phase 7 — Paddle price mapping, one-sub-per-tenant |
| `20260605` – `20260624` | PO plan menus, PO create tenant, menu list realign, coupons, site_settings (pricing + branding), PO secret mgmt, PO identifiers |
| `20260627120000` | Phase 2j — income_streams |
| `20260701*` | account_balance_history, demat accounts + ledger, demat opening balance |

**Drift:** `src/integrations/supabase/types.ts` predates the last four migrations —
`income_streams`, `demat_accounts`, `demat_ledger`, `account_balance_history` and the
`po_*_secret`/`po_*_identifiers` RPCs are all missing from it.
