# API Report

> Endpoint-by-endpoint review against the Phase 1 checklist.
> Surface reference: [API_Documentation.md](./API_Documentation.md). Audit 2026-08-04.

---

## Summary scorecard

| Dimension | Verdict |
|---|---|
| Authentication | ✅ JWT on every table/RPC call; 3 of 5 edge functions are intentionally public |
| Authorization | ⚠️ RLS is sound for rows; **feature/menu gating is client-side only** |
| Object-level access (BOLA/IDOR) | ✅ no id-based endpoints — RLS scopes every row |
| Function-level access | ❌ several `SECURITY DEFINER` functions callable by `PUBLIC` |
| Mass assignment | ❌ `subscriptions` UPDATE lets a client set `plan_id`/`status`/`period_end` |
| Input validation | ⚠️ DB CHECKs + a few zod schemas; **no validation layer on RPC arguments** |
| Output validation | ❌ none |
| Rate limiting | ❌ none anywhere |
| Pagination / filtering / sorting | ❌ available in PostgREST, essentially unused |
| Error handling | ❌ raw Postgres/Paddle messages reach the UI |
| Status codes | ⚠️ `live-price` always returns 200 |
| Versioning | ❌ none |
| Caching | ⚠️ client-side only |
| OpenAPI readiness | ⚠️ auto-generated for PostgREST; nothing for edge functions |

---

## AR-001 · `subscriptions` PATCH is a paid-plan bypass — **Critical**

`PATCH /rest/v1/subscriptions?tenant_id=eq.<mine>` with
`{"plan_id":"<pro>","status":"active","current_period_end":"2099-01-01"}` succeeds for any
workspace owner. Same root cause as DB-002 / SEC-001.
**Fix:** revoke write grants; drop the `sub_update` policy.

## AR-002 · Menu authorization is not enforced on data endpoints — **High**

`get_effective_menus()` is consumed by `MenuGuard` and `AppSidebar` only. RLS grants row access
purely on membership. A viewer restricted to `{dashboard}` can still:

```
GET /rest/v1/investments?select=*       → 200, all rows
GET /rest/v1/insurance?select=*         → 200, all rows incl. base64 documents
```

Anything a plan or an owner "hides" is a UI illusion. This also means **plan gating is not a
paywall** — a Free-plan tenant can read every feature's data over REST.
**Fix:** either (a) accept menus as pure navigation and say so, or (b) add
`get_effective_menus(tenant_id) @> ARRAY['<menu>']` to the SELECT policy of the tables that
back gated features.

## AR-003 · `send-email` is an authenticated open relay — **High**

Any signed-up user can POST arbitrary `to`, `subject` and `html` and have it delivered from the
product's Resend domain. Consequences: phishing that passes SPF/DKIM for your domain, spam
complaints, domain reputation loss, Resend quota exhaustion.
**Fix:** replace the free-form payload with a template id + typed params; derive `to`
server-side from the DB (e.g. the invitee's email for `member.invited`); rate-limit per user.

## AR-004 · `po-auth` is public, unthrottled and enumerable — **High**

- `mode:"resolve"` returns 200 with an email for a PO identifier and 404 otherwise → confirms
  which identifiers are platform-admin accounts, and **discloses the PO's email address**.
- `mode:"secret"` accepts unlimited attempts against a 16-digit code with no lockout. Each
  attempt runs a bcrypt comparison server-side, so it is also a cheap CPU-exhaustion vector.
- A valid code yields a **full session with no password and no second factor** — this is the
  highest-privilege account in the system.
- `PoLogin`'s "Forgot password?" calls the same public function and then
  `resetPasswordForEmail` — an unauthenticated mail-bomb trigger against the PO.

**Fix:** return a uniform response for both branches; add per-IP and per-identifier throttling
with exponential backoff and lockout; log failures to `audit_log`; require the secret **plus**
password (make it a second factor, not an alternative); add a CAPTCHA on repeated failure.

## AR-005 · Paddle webhook: non-constant-time compare + no replay window — **High**

```ts
return hex === h1;                      // timing-variable comparison
```
and the parsed `ts` is never checked for freshness. A captured valid webhook can be replayed
indefinitely — e.g. re-applying a `subscription.created` for a plan that has since been
downgraded, or re-activating a cancelled subscription.
**Fix:** use a constant-time comparison; reject signatures whose `ts` is older than ~5 minutes;
de-duplicate on `event_id` in a `processed_webhooks` table.

## AR-006 · Raw backend errors surface to end users — **Medium**

Every mutation ends `onError: (e) => toast.error(e.message)`. Users see strings like
`new row for relation "trips" violates check constraint "trips_kind_check"` or
`duplicate key value violates unique constraint "budgets_user_id_bucket_period_start_key"`.
This leaks schema internals and is unusable as user-facing copy.
**Fix:** a single `toUserMessage(error)` mapper with a default of "Something went wrong — we've
logged it"; log the raw error to the monitoring backend.

## AR-007 · No pagination on any list endpoint — **Medium**

`useTransactions` fetches the entire history on every mount of any page that uses it (dashboard
widgets, expenses, income, export, search). Payload and parse time grow linearly and
unboundedly.
**Fix:** `.range()` + date-window filters; infinite query for the ledger.

## AR-008 · No rate limiting on any surface — **Medium**

`live-price` is an unauthenticated proxy to Yahoo/mfapi with no cache and no throttle: a script
can drive unlimited outbound requests from your project and burn edge-function invocations.
Signup, password reset and PO login are similarly unthrottled beyond Supabase platform defaults.
**Fix:** per-IP token bucket at the edge; cache `live-price` responses (60 s for equities,
24 h for MF NAV) in a small table or KV.

## AR-009 · Wildcard CORS on all edge functions — **Low/Medium**

`Access-Control-Allow-Origin: *` on `billing-api` and `send-email` means any origin can invoke
them with a token it already holds. It does not by itself grant access (the JWT is still
required and cookies are not used), but it removes a useful defence-in-depth layer.
**Fix:** echo an allow-list of known origins.

## AR-010 · `billing-api` resolves by `user_id`, not `tenant_id` — **Medium**

The rest of the system is tenant-scoped; this function is not. For a user who owns two
workspaces it returns whichever subscription row was updated most recently, so the Billing page
can display and act on the wrong workspace's subscription (including cancelling it).
**Fix:** accept `tenant_id`, verify membership, then query by tenant.

## AR-011 · No idempotency or transactionality on multi-call flows — **Medium**

- `PoTenants` "create tenant with modules" = `po_create_tenant` then `po_set_tenant_menus`. A
  failure in between leaves a tenant with default menus and no error surfaced.
- Smart Split posts a transaction and then updates local state.
- `useMarkRecurring` inserts a transaction then bumps `next_due_date` in a second statement —
  a failure between the two double-posts on retry.

**Fix:** wrap each flow in a single `SECURITY DEFINER` RPC so Postgres provides the transaction.

## AR-012 · `live-price` always returns HTTP 200 — **Low**

Upstream failures return `{price:null}` with status 200, so clients cannot distinguish
"no quote" from "provider down". Retries and alerting are impossible.

---

## Endpoint risk table

| Endpoint | Auth | Rate-limited | Validated | Risk |
|---|---|---|---|---|
| `PATCH /rest/v1/subscriptions` | JWT | ✗ | ✗ | **Critical** |
| `POST /functions/v1/send-email` | JWT | ✗ | partial | **High** |
| `POST /functions/v1/po-auth` | **none** | ✗ | regex only | **High** |
| `POST /functions/v1/payments-webhook` | HMAC | ✗ | ✗ | **High** |
| `rpc/log_audit`, `rpc/create_notification` | JWT (should be none) | ✗ | ✗ | **High** |
| `GET /rest/v1/<finance tables>` | JWT | ✗ | n/a | Medium (AR-002) |
| `GET /functions/v1/live-price` | none | ✗ | provider allow-list | Medium |
| `GET/POST /functions/v1/billing-api` | JWT | ✗ | ✗ | Medium |
| PO `rpc/po_*` | JWT + `is_platform_admin()` | ✗ | ✗ | Low ✔ |
| `rest/v1/plans`, `coupons`, `site_settings` | anon | ✗ | n/a | Low ✔ (intentional) |

## Fix order

1. AR-001 revoke `subscriptions` writes
2. AR-003 lock down `send-email`
3. Revoke `PUBLIC` execute (DB-003)
4. AR-004 throttle + de-enumerate `po-auth`
5. AR-005 webhook constant-time + replay window
6. AR-002 decide and document the menu-authorization contract
7. AR-006 error mapper · AR-007 pagination · AR-010 tenant-scope billing-api
8. AR-008 rate limiting · AR-011 transactional RPCs · AR-009/012 hygiene
