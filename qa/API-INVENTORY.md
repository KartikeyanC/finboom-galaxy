# FinRoot — API Inventory

FinRoot has **no bespoke REST API**. The client talks to Supabase three ways:
1. **PostgREST** table reads/writes (`supabase.from(<table>)…`) — RLS-enforced.
2. **RPC** (`supabase.rpc(<fn>)`) — Postgres functions, several `SECURITY DEFINER`.
3. **Edge Functions** (`supabase.functions.invoke(<fn>)`) — Deno.

Auth: every call carries the user's Supabase JWT (anon key + `Authorization: Bearer <session>`), except the intentionally public status checks and `po-auth`'s first step. During browser testing, Supabase calls are **cross-origin** and were **not captured by the network panel** — they were verified indirectly (UI state, `localStorage`, success/error toasts, direct `fetch` probes). Health probe run this session: `GET https://ludbntvhagefadfkhrjj.supabase.co/auth/v1/health` → 200 (GoTrue v2.196.0); `/status` page live checks → DB & API + Sign-in both "Operational".

## 1. Edge Functions (`supabase/functions/`)

| API | METHOD | PURPOSE | AUTH | USED BY | STATUS |
|---|---|---|---|---|---|
| `billing-api` | `GET` | load `{subscription, transactions, role}` for `x-tenant-id` | user JWT, tenant member | `src/pages/Billing.tsx:186` | **PASS** — Billing page populated (plan Canopy ACTIVE), no error |
| `billing-api` | `POST {action:"cancel"|"resume", tenant_id}` | schedule cancel / resume subscription | user JWT, **owner** | `Billing.tsx:207` | **NOT TESTED** — would change the demo account's live plan state |
| `billing-api` | `POST {action:"invoice_pdf", transaction_id, tenant_id}` | fetch a Paddle invoice PDF url | user JWT, **admin+** | `Billing.tsx:222` | **NOT TESTED** — no payment history on the demo account |
| `live-price` | `GET`/`POST` | live market prices for holdings | user JWT | investments/portfolio hooks | **NOT TESTED** — demo has no holdings; no price widget exercised |
| `payments-webhook` | `POST` | Paddle → subscription state, `audit_log` | Paddle signature (no user) | Paddle only | **NOT TESTED** — external; known gaps BUG-008 (docs) |
| `po-auth` | `POST {step:"resolve"}` | identifier → challenge for Owner Console | public (rate-limit gap, BUG-006/007 docs) | `src/pages/po/PoLogin.tsx:52` | **NOT TESTED** — demo admin bypassed `/po/login` |
| `po-auth` | `POST {step:"secret"}` | verify 16-digit secret, mint PO session | public | `PoLogin.tsx:66,80`, `po/security/ChangePasswordSection.tsx:43` | **NOT TESTED** — would touch admin credentials |
| `scan-receipt` | `POST` (image payload) | Gemini vision → merchant/items/category | user JWT | `src/pages/BillScan.tsx:134` | **PASS\*** — UI reached; extraction not run (needs real receipt + server Gemini key) |
| `send-email` | `POST` | transactional email via Resend | — | — | **NOT DEPLOYED** by design (was an open relay, BUG-005 docs) |

## 2. RPCs called from the client (43)

Verified working this session are marked ✅ (observed a correct result in the UI). Others were reached only indirectly or not at all.

### Finance / tenant-scoped (user JWT + RLS / `is_tenant_member`)
| RPC | Purpose | Used by | Status |
|---|---|---|---|
| `dashboard_summary` | dashboard aggregate figures | `useDashboardSummary` | ✅ dashboard + after CRUD updates |
| `budget_set_allocation` | upsert a budget allocation | `useBudgets` | ✅ Add/Edit budget |
| `budget_spend` | spend per budget/period | `useBudgetSpend` | ✅ budget rows show spent/remaining |
| `goal_contribute` | add funds to a goal | `useGoals` | ✅ "Add funds" ₹1,000→₹3,500 |
| `tracker_spend` | spend rolled up per tracker | `useTrackerSpend` | ✅ tracker detail "TOTAL SPENT" |
| `create_invitation` | create a workspace invite | Workspace | ✅ invite link generated |
| `accept_invitation` | redeem an invite token | `AcceptInvite` | ✅ negative path (wrong email rejected) |
| `list_tenant_members` | member roster | Workspace | ✅ shows Demo Owner |
| `revoke_member` / `update_member_role` / `set_member_menus` | member admin | Workspace | **NOT TESTED** — only 1 member |
| `mark_all_notifications_read` | clear unread | Notifications | **NOT TESTED** — 0 notifications |
| `mark_recurring_generated` | mark a recurring item fired | `useRecurring` | **NOT TESTED** — "Mark received" not clicked |
| `record_legal_acceptance` | store ToS/Privacy acceptance at sign-up | `legalAcceptance.ts` | **NOT TESTED** — no new sign-up |
| `tenant_subscription_status` | plan/period/status for the tenant | `useSubscription` | ✅ "Canopy plan" in sidebar/header |
| `get_effective_menus` | resolved menu set for the tenant | `AccessContext` | ✅ full sidebar rendered for Canopy owner |

### Plan / upsell (user JWT)
| RPC | Purpose | Status |
|---|---|---|
| `upgradeable_plans` | plans the tenant could move up to | **NOT TESTED** (no upgrade UI path taken) |

### Platform-admin (PO) — `SECURITY DEFINER`, aggregates only
| RPC | Purpose | Status |
|---|---|---|
| `is_platform_admin` / `po_has_secret` / `po_get_identifiers` | PO gate + identity | ✅ demo admin reached `/po` |
| `po_dashboard_stats` / `po_recent_activity` | Overview | ✅ /po |
| `po_list_tenants` / `po_list_deleted_tenants` | Tenants | ✅ /po/tenants |
| `po_tenant_engagement` / `po_tenant_activity_months` | Analytics | ✅ /po/analytics |
| `po_audit_log` | Audit Log | ✅ /po/audit |
| `po_list_coupons` | Coupons | ✅ (feature disabled message) |
| `po_create_tenant` / `po_delete_tenant` / `po_purge_tenant` / `po_restore_tenant` | tenant lifecycle | **NOT TESTED** — shared live data |
| `po_assign_plan` / `po_set_plan_menus` / `po_set_plan_price` / `po_set_plan_paddle_price_id` | plan admin | **NOT TESTED** |
| `po_set_tenant_menus` / `po_set_tenant_status` | tenant module/status admin | **NOT TESTED** |
| `po_set_secret` / `po_revoke_secret` / `po_set_identifiers` | PO credential admin | **NOT TESTED** — would alter admin login |
| `po_create_coupon` / `po_delete_coupon` / `po_set_coupon_active` | coupons | **NOT TESTED** — feature disabled |
| `po_set_site_setting` | branding / pricing / status content | **NOT TESTED** — would change the live landing page |

## 3. PostgREST tables touched by the client (`.from(...)`)

`accounts`, `budgets`, `debts`, `demat_accounts`, `demat_ledger`, `goals`, `income_streams`, `insurance`, `investments`, `net_worth_entries`, `net_worth_snapshots`, `notifications`, `plans`, `profiles`, `recurring_items`, `recurring_reminders`, `reminders`, `site_settings`, `subscriptions`, `tenant_members`, `tenant_settings`, `tenants`, `tracked_subscriptions`, `trackers`, `transactions`, `trips`.

Verified via CRUD this session: **`income_streams`** (insert/delete), **`recurring_items`** (insert/delete), **`transactions`** (insert/update/delete), **`budgets`** (insert/update/delete), **`goals`** (insert/update/delete), **`trackers`** (insert/delete), **`accounts`** (insert/update/delete). All writes persisted across a full page reload → RLS + tenant scoping working for the owner role.

## 4. Not exercised — and why

| Area | Reason |
|---|---|
| All PO mutations | Shared **live** platform database; a non-destructive audit does not create/delete real tenants, plans, coupons, secrets, or edit the public site content. |
| `billing-api` cancel/resume/invoice, Paddle checkout, `payments-webhook` | Would change the demo account's live subscription or require an external Paddle transaction. |
| `scan-receipt` (Gemini) | Needs a real receipt image and a server-side model key; UI reached only. |
| `send-email` | Deliberately not deployed. |
| Multi-role RLS (admin / viewer boundary, `revoke_member`, `set_member_menus`, SEC negative suite) | Only one usable account; the role-harness accounts were never provisioned (autoconfirm off, no service-role key). |
| `accept_invitation` happy path | Needs a second real account matching the invited email. |
| `record_legal_acceptance`, onboarding wizard RPCs | Need a fresh sign-up; free-tier auth mailer is rate-limited and the demo account is already onboarded. |
