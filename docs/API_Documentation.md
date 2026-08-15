# API Documentation

> FinRoot has no bespoke HTTP API. Its surface is (a) Supabase **PostgREST** over the `public`
> schema, (b) **RPC** endpoints (`POST /rest/v1/rpc/<fn>`), and (c) five **edge functions**
> (`/functions/v1/<name>`). Audit date 2026-08-04.
> Findings: [API_Report.md](./API_Report.md).

Base URL: `https://<project-ref>.supabase.co`
Every PostgREST/RPC call carries `apikey: <anon key>` and `Authorization: Bearer <user JWT>`.
Authorization is enforced by RLS and by in-function guards — **not** by the transport.

---

## 1. PostgREST — table endpoints

`GET|POST|PATCH|DELETE /rest/v1/<table>`

| Table | R | C | U | D | Effective rule |
|---|:-:|:-:|:-:|:-:|---|
| `transactions`, `budgets`, `goals`, `recurring_items`, `accounts`, `investments`, `debts`, `insurance`, `net_worth_entries`, `trips`, `reminders`, `tracked_subscriptions`, `income_streams`, `demat_accounts`, `demat_ledger` | ✔ viewer | ✔ admin | ✔ admin | ✔ admin | `is_tenant_member(tenant_id, …)` |
| `tenants` | ✔ member/PO | ✔ any user (`created_by = uid`) | ✔ owner/PO | ✔ owner/PO | see DB-005 |
| `tenant_members` | ✔ self / co-member / PO | ✔ owner/PO | ✔ owner/PO | ✔ owner/PO | |
| `profiles` | ✔ self/PO | ✔ self | ✔ self | — | |
| `platform_admins` | ✔ self/PO | — | — | — | seeded by service role |
| `subscriptions` | ✔ viewer/PO | — | **✔ owner/PO** | — | ⚠️ SEC-001 |
| `plans` | ✔ anon+auth | — | — | — | public catalogue |
| `coupons` | ✔ anon (active) / PO (all) | — | — | — | |
| `site_settings` | ✔ anon (`landing_%`) / PO | — | — | — | |
| `notifications` | ✔ own | — | ✔ own | — | insert via RPC |
| `audit_log` | ✔ tenant owner / PO | — | — | — | insert via `log_audit()` |
| `account_balance_history` | ✔ own | ✔ own | ✔ own | ✔ own | table unused by the client |

**Query features available** (PostgREST built-ins, used only sparsely by the app):
filtering `?col=eq.x`, ordering `?order=col.desc`, pagination `Range` / `?limit&offset`,
embedding `?select=col,rel(cols)`. The app uses `select`, `eq`, `order`; it uses `limit` only
for notifications.

**Not available:** versioning, server-side validation beyond CHECK constraints, custom error
shapes, rate limiting, idempotency keys.

---

## 2. RPC endpoints

`POST /rest/v1/rpc/<function>` with a JSON body of named parameters.

### 2.1 Tenant-facing

| Function | Params | Returns | Guard |
|---|---|---|---|
| `get_effective_menus` | `p_tenant_id uuid` | `text[]` | membership (returns `[]` if not a member) |
| `list_tenant_members` | `p_tenant_id uuid` | rows `(user_id, role, status, menu_overrides, display_name, email, username)` | member or PO |
| `invite_member` | `p_tenant_id, p_email, p_role, p_menus jsonb` | `uuid` | owner or PO; role ∈ {admin,viewer}; **target account must already exist** |
| `update_member_role` | `p_tenant_id, p_user_id, p_role` | `void` | owner/PO; cannot touch the owner row |
| `set_member_menus` | `p_tenant_id, p_user_id, p_menus jsonb` | `void` | owner/PO; cannot touch the owner row |
| `revoke_member` | `p_tenant_id, p_user_id` | `void` | owner/PO; hard delete of the membership |
| `tenant_subscription_status` | `p_tenant_id` | `(plan_name, status, current_period_end, provider)` | viewer or PO; derives `'expired'` from dates |
| `upgradeable_plans` | — | active, paid, Paddle-mapped plans | any authenticated |
| `mark_all_notifications_read` | — | `void` | acts on `auth.uid()` |
| `is_platform_admin` | — | `bool` | self |

`p_menus` shape: member override `{"allow":["income","expenses"]}`;
tenant override `{"deny":["investments"]}`.

### 2.2 Product Owner (all guarded by `is_platform_admin()`, all audited)

| Function | Params | Returns |
|---|---|---|
| `po_dashboard_stats` | — | `jsonb` (tenant/user/collaborator counts, sub counts, plan breakdown, 30-day growth, global income/expense totals) |
| `po_recent_activity` | `p_limit int = 25` | recent audit rows |
| `po_audit_log` | `p_limit int = 100` | full audit rows incl. metadata |
| `po_list_tenants` | — | `(id, name, status, owner_email, member_count, plan_name, sub_status, created_at)` |
| `po_create_tenant` | `p_name, p_owner_email` | `uuid` — creates tenant + owner membership + Free sub |
| `po_set_tenant_status` | `p_tenant_id, p_status` | `void` — notifies all members on suspend/activate |
| `po_set_tenant_menus` | `p_tenant_id, p_menus jsonb` | `void` |
| `po_assign_plan` | `p_tenant_id, p_plan_id` | `void` — upsert to `provider='manual'`, `status='active'` |
| `po_delete_tenant` | `p_tenant_id` | `void` — **hard delete, cascades all data** |
| `po_set_plan_menus` | `p_plan_id, p_menus jsonb` | `void` |
| `po_set_site_setting` | `p_key text, p_value jsonb` | `void` |
| `po_create_coupon` / `po_list_coupons` / `po_set_coupon_active` / `po_delete_coupon` | | |
| `po_set_secret` | `p_secret text` | `void` — must match `^[0-9]{16}$`, bcrypt-hashed |
| `po_has_secret` / `po_revoke_secret` / `po_get_identifiers` / `po_set_identifiers` | | ⚠️ absent from `types.ts` |

### 2.3 Internal (service role only)
`po_resolve_identifier(p_identifier)`, `po_verify_secret(p_identifier, p_secret)` —
`REVOKE`d from `PUBLIC`, granted to `service_role`, called by `po-auth`.

### 2.4 Unintentionally exposed
`log_audit`, `create_notification`, `expire_subscriptions`,
`notify_expiring_subscriptions`, `plan_menus`, `all_feature_menus`, `current_tenant_id`,
`is_tenant_member`, `handle_new_user`, `update_updated_at_column` — no `REVOKE` was issued, so
`PUBLIC` retains `EXECUTE`. See **DB-003 / SEC-002**.

---

## 3. Edge functions

### 3.1 `POST /functions/v1/po-auth` — *public, no JWT*
```jsonc
// mode: "resolve"
{ "mode": "resolve", "identifier": "owner@example.com" }
→ 200 { "email": "owner@example.com" }        // identifier belongs to a PO
→ 404 { "error": "No Product Owner account matches that identifier" }

// mode: "secret"
{ "mode": "secret", "identifier": "…", "secret": "1234567890123456" }
→ 200 { "email": "…", "token_hash": "…" }     // client then verifyOtp({token_hash, type:'magiclink'})
→ 400 { "error": "Secret must be 16 digits" }
→ 401 { "error": "Invalid secret access code" }
```
No rate limiting, no lockout, no CAPTCHA. The 200/404 split is a PO-account enumeration oracle.

### 3.2 `POST /functions/v1/payments-webhook?env=sandbox|live` — *public, HMAC-verified*
Header `paddle-signature: ts=<unix>;h1=<hex hmac-sha256 of "ts:body">`.
Handles `subscription.*`: resolves tenant from `custom_data.tenant_id` (fallback: the user's
owner membership), maps `price.id → plans.paddle_price_id`, upserts `subscriptions`
`onConflict: tenant_id`. `transaction.*` events are logged and ignored.
Responses: `200 {received:true}` · `401 invalid signature` · `400 bad json` · `500`.

### 3.3 `GET /functions/v1/live-price?provider=yahoo|mf&symbol=<s>` — *public*
`→ 200 { "price": number | null }`. Always 200, even on upstream failure.

### 3.4 `GET|POST /functions/v1/billing-api` — *requires JWT*
- `GET` → `{ subscription, transactions[], env }` (Paddle transactions for the stored
  `paddle_customer_id`).
- `POST {action:"cancel"}` → cancel at next billing period.
- `POST {action:"resume"}` → clear scheduled change.
- `POST {action:"invoice_pdf", transaction_id}` → Paddle invoice URL.
- Errors: `401 unauthorized`, `400 no subscription | unknown action | missing transaction_id`.
- **Note:** looks the subscription up by `user_id`, not `tenant_id`.

### 3.5 `POST /functions/v1/send-email` — *requires JWT*
`{ to, subject, html }` → `{sent:true, id}` · `{skipped:true}` when `RESEND_API_KEY` is unset ·
`400` when `to`/`subject` missing · `502` on Resend failure.
**All three fields are caller-controlled with no allow-list.** See SEC-004.

---

## 4. Client-side calling conventions

- Reads: `useQuery` keyed `[entity, …, user.id]`, `staleTime` 60 s, `retry` 1,
  `refetchOnWindowFocus` false.
- Writes: `useMutation` → `qc.invalidateQueries` → `toast.success` / `toast.error(e.message)`.
- **Raw Postgres error messages are surfaced directly to users** (constraint names, column
  names). See API_Report AR-006.
- No request ids, no retry/backoff strategy beyond React Query's single retry, no offline queue.

## 5. CORS

All five edge functions return `Access-Control-Allow-Origin: *`. PostgREST CORS is managed by
Supabase and is also permissive by default.

## 6. OpenAPI

Supabase auto-publishes an OpenAPI document at `/rest/v1/` for tables and RPCs. Edge functions
are **not** described anywhere. No spec is committed to the repo and none is used for client
generation or contract testing.
