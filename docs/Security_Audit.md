# Security Audit — OWASP Top 10 (2021) + extended checklist

> Audit date 2026-08-04 · Method: full source review of `src/`, `supabase/migrations/`,
> `supabase/functions/`, config and env files. No live penetration testing was performed;
> every finding below is derived from code that was read directly, with file references.
> Executive summary and remediation plan: [Security_Report.md](./Security_Report.md).

**Result: NOT production-ready.** 4 Critical/High findings must be closed before onboarding a
paying subscriber. Two of them are trivially exploitable by any signed-up user.

---

## A01 — Broken Access Control

### SEC-001 · Tenant owner can grant themselves any plan — **CRITICAL**
`supabase/migrations/20260604210000_phase4_plans_billing.sql`

```sql
CREATE POLICY sub_update ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin())
  WITH CHECK (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin());
```
The `GRANT ... UPDATE ... TO authenticated` from `20260601063818` was never revoked, and
`plans` is world-readable (`plans_select USING (true)`).

**Exploit** (any signed-up user, from the browser console):
```js
const { data: pro } = await supabase.from('plans').select('id').eq('name','Pro').single();
await supabase.from('subscriptions')
  .update({ plan_id: pro.id, plan_name:'Pro', status:'active',
            provider:'manual', current_period_end:'2099-01-01' })
  .eq('tenant_id', myTenantId);
```
`plan_menus()` immediately returns the Pro menu set. **Revenue bypass, zero payment.**

**Fix**
```sql
DROP POLICY IF EXISTS sub_update ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
```
All legitimate writes already go through `payments-webhook` (service role) or `po_assign_plan`.

### SEC-002 · Feature/plan gating is not enforced on data endpoints — **HIGH**
`get_effective_menus()` is consumed only by `MenuGuard`/`AppSidebar`. RLS grants row access on
membership alone, so a Free tenant — or a collaborator explicitly denied a menu — can read and
write every gated table over PostgREST:
```
GET /rest/v1/investments?select=*
GET /rest/v1/insurance?select=*      → includes base64 policy documents
```
**FIXED 2026-08-05 (Stage 2.15).** Both reads above now return `[]` for a tenant whose plan or
member overrides exclude the menu, and the matching inserts are refused — `has_menu()` is ANDed
into all four RLS policies on eleven tables.
See [Authorization_Flow.md](./Authorization_Flow.md) AZ-001, and AZ-009 for the owner caveat.

### SEC-003 · Ungated high-value routes — **MEDIUM**
`/app/export` (full-workspace export, available to `viewer`), `/app/billing`,
`/app/workspace`, `/app/accounts` render without `MenuGuard`.

### SEC-004 · Any user can create unlimited tenants — **MEDIUM**
`tenants_insert WITH CHECK (created_by = auth.uid())`, no quota (DB-005).

### IDOR / BOLA — **not found ✅**
There are no id-parameterised endpoints. Every read is `SELECT * FROM t` filtered by RLS on
`tenant_id`. Substituting another tenant's row id yields zero rows.

---

## A02 — Cryptographic Failures

### SEC-005 · App-lock PIN hashing is inadequate — **MEDIUM**
`src/lib/appLock.ts`: `SHA-256("finroot:<uid>:<pin>")`, no salt, no iterations, 4–6 digit PIN
(≤10⁶ keyspace). Anyone with the device or an XSS payload recovers the PIN instantly.
`isUnlocked()` returns `true` when storage access throws — **fail-open**.
Mitigating: the PIN protects nothing server-side; the Supabase session is independent.

### SEC-006 · Session tokens in `localStorage` — **MEDIUM**
`src/integrations/supabase/client.ts` sets `storage: localStorage`. Combined with the absence of
a CSP, any script injection exfiltrates a long-lived session.

### SEC-007 · Non-constant-time HMAC comparison — **MEDIUM**
`supabase/functions/payments-webhook/index.ts`: `return hex === h1;`
Use `crypto.subtle.timingSafeEqual`-equivalent byte comparison.

### Correct ✅
- Passwords: GoTrue bcrypt. PO secret: pgcrypto bcrypt (`crypt` + `gen_salt('bf')`), never
  returned to the client.
- Money as `numeric`, never float.
- TLS everywhere; Supabase encrypts at rest.

---

## A03 — Injection

### SQL injection — **not found ✅**
No dynamic SQL anywhere. PostgREST parameterises; all RPCs take typed arguments; plpgsql bodies
use parameters, never string concatenation. `format()`/`EXECUTE` are not used.

### XSS — **LOW, but unmitigated by design**
Two `dangerouslySetInnerHTML` sites, both audited:
- `src/components/import/TransactionImporter.tsx:761` — renders `broker.steps`, a **hardcoded
  constant array** in the same file, with a `**bold**` → `<strong>` transform. Not
  user-controllable.
- `src/components/ui/chart.tsx:70` — shadcn's standard CSS-variable injection from a
  developer-supplied `ChartConfig`. Not user-controllable.

No stored or reflected XSS was found. However:
- **SEC-008 · No Content-Security-Policy — MEDIUM.** No CSP header or `<meta>` anywhere. The
  branding feature stores an arbitrary **data-URL logo** in `site_settings` (PO-controlled) and
  renders it via `<img src>`; `<img>` neutralises SVG scripts, so this specific path is safe,
  but a CSP is the standard defence-in-depth and its absence turns any future injection into a
  session takeover (SEC-006).

### Command / NoSQL / LDAP injection — n/a ✅

---

## A04 — Insecure Design

### SEC-009 · `send-email` is an authenticated open mail relay — **HIGH**
`supabase/functions/send-email/index.ts` accepts caller-supplied `to`, `subject` and `html` and
sends via Resend from the product's own domain. Any signed-up user can send arbitrary HTML mail
to arbitrary recipients with your SPF/DKIM alignment.
Impact: phishing branded as FinRoot, spam listing, domain reputation loss, quota exhaustion.
**Fix:** template-id + typed params; resolve recipients server-side from the database; per-user
rate limit.

### SEC-010 · The 16-digit secret is an *alternative* to the password, not a factor — **HIGH**
`po-auth {mode:"secret"}` mints a **full session with no password**. It converts the
highest-privilege account in the platform from "password + (optional) email confirmation" into
"one 16-digit number". Combined with SEC-011 (no throttling) and the fact that the same public
endpoint discloses which identifiers are PO accounts, this is a net **reduction** in security.
**Fix:** require password **and** secret, or replace with TOTP.

### SEC-011 · No rate limiting anywhere — **HIGH**
No throttling on `po-auth` (unlimited 16-digit guesses, each running a bcrypt), on
`/auth` sign-in/sign-up, on `resetPasswordForEmail` (mail-bomb via `PoLogin`'s
"Forgot password?"), on `live-price` (unauthenticated outbound proxy), or on any RPC.

### SEC-012 · No replay protection on the Paddle webhook — **HIGH**
The signature's `ts` field is parsed but never validated for freshness, and there is no
event-id de-duplication table. A captured valid webhook body + signature can be replayed
indefinitely to re-apply a subscription state.

### SEC-013 · Business logic on the client — **MEDIUM**
`goals.current_amount` increments, `budgets.spent`, Smart Split reconciliation and live account
balances are all computed and written by the browser. A user can set any goal to complete or
any balance to any value. There are no server-side invariants (no triggers, no check functions).

---

## A05 — Security Misconfiguration

### SEC-014 · `SECURITY DEFINER` functions executable by `PUBLIC` — **HIGH**
Postgres grants `EXECUTE` to `PUBLIC` on `CREATE FUNCTION`; only `po_resolve_identifier` and
`po_verify_secret` were revoked.

| Callable by any user | Impact |
|---|---|
| `log_audit(...)` | **forge audit entries** for any tenant → the audit trail is not evidence |
| `create_notification(user_id, ...)` | **push arbitrary in-app notifications to any user** → in-product phishing |
| `expire_subscriptions()` | mass state flip (idempotent) |
| `notify_expiring_subscriptions(days)` | notification flood |

```sql
REVOKE EXECUTE ON FUNCTION public.log_audit(uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid,uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_subscriptions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_expiring_subscriptions(int) FROM PUBLIC, anon, authenticated;
```
(They are invoked from other `SECURITY DEFINER` functions, which run as owner — unaffected.)

### SEC-015 · Wildcard CORS on every edge function — **LOW/MEDIUM**
`Access-Control-Allow-Origin: *` on all five, including `billing-api` and `send-email`.

### SEC-016 · No security headers — **MEDIUM**
No CSP, HSTS, `X-Frame-Options`/`frame-ancestors` (clickjacking), `X-Content-Type-Options`,
`Referrer-Policy`, or `Permissions-Policy`. There is no hosting config (`vercel.json`,
`netlify.toml`, `_headers`) in the repo at all.

### SEC-017 · `.env` files are committed and untracked by `.gitignore` — **LOW**
`.gitignore` covers `.env.e2e` and `*.local` only. `.env`, `.env.development` and
`.env.production` sit in the working tree. Their contents (project ref, anon key, Paddle
*client* token) are all public-by-design values, so the direct exposure is low — but the
pattern will leak a real secret the first time one is added, and `.env.e2e` holds live test
credentials on disk.

### SEC-018 · `supabase/config.toml` points at production — **MEDIUM (operational)**
`project_id = "tsmdnfywxsjsjqjszoek"` (live). Any `supabase db push` / `functions deploy` run
without an explicit `--project-ref` targets the production database.

---

## A06 — Vulnerable and Outdated Components

`npm audit --omit=dev` (2026-08-04): **10 vulnerabilities — 9 high, 1 moderate.**

| Package | Severity | Advisory | Fix |
|---|---|---|---|
| `xlsx` (0.18.5) | **High** | Prototype pollution (GHSA-4r6h-8v6p-xvw6), ReDoS (GHSA-5pgg-2g8v-p4x9) | **No fix on npm** — SheetJS publishes only from its own CDN. Directly reachable: `importParsers.ts` parses **user-uploaded spreadsheets** |
| `postcss` | High | XSS via unescaped `</style>`, arbitrary file read via `sourceMappingURL` (×3) | `npm audit fix` |
| `minimatch` | High | ReDoS ×3 | `npm audit fix` |
| `lodash` | High | (transitive) | `npm audit fix` |
| `yaml` | Moderate | stack overflow on nested collections | `npm audit fix` |

`xlsx` is the material one: prototype pollution in a parser that consumes untrusted files from
the Import page. **Mitigate now** — either move to the SheetJS CDN build, switch to
`exceljs`/`papaparse`-only, or parse spreadsheets in a Web Worker with a frozen prototype.

Also: `caniuse-lite` is 14 months stale; `@lovable.dev/cloud-auth-js` sits in the auth path and
is not audited here.

---

## A07 — Identification and Authentication Failures

| Item | State |
|---|---|
| Password policy | 8–72 chars, no complexity/breach check |
| Brute-force protection | ❌ none (SEC-011) |
| MFA | ❌ none (SEC-010) |
| User enumeration | ⚠️ `po-auth` `mode:"resolve"` returns 200+email vs 404 |
| Session fixation | ✅ GoTrue issues a fresh session |
| Session invalidation | ⚠️ sign-out leaves PIN hash and `valar.profiles` on the device |
| Concurrent sessions | not limited or visible to the user |
| Email verification | depends on a Supabase project setting not tracked in this repo |
| PO login auditing | ❌ **PO sign-ins are never written to `audit_log`** |

---

## A08 — Software and Data Integrity Failures

- **SEC-012** webhook replay (above).
- **SEC-014** forgeable audit log (above) — this is an integrity failure as much as a
  misconfiguration: the audit trail cannot be trusted as evidence of who did what.
- No Subresource Integrity on the Google Fonts `<link>`, and Paddle.js is loaded dynamically
  from Paddle's CDN without SRI.
- No CI, so no dependency pinning gate, no signed builds, no provenance.
- `bun.lockb`, `bun.lock` **and** `package-lock.json` all exist — three lockfiles, ambiguous
  install determinism.

---

## A09 — Security Logging and Monitoring Failures

| Item | State |
|---|---|
| Audit log | ✅ exists, wired to every privileged RPC, PO-viewable — ❌ but forgeable and never pruned |
| Auth event logging | ❌ no sign-in/sign-out/failed-login records in `audit_log` |
| Application logging | ❌ `console.*` in edge functions only; nothing structured |
| Error monitoring | ❌ no Sentry/Rollbar; **no React error boundary anywhere** |
| Uptime/alerting | ❌ none |
| Failed-authorization logging | ❌ RLS denials are invisible |
| Retention | ❌ undefined |

A successful exploit of SEC-001 (self-upgrade to Pro) would leave **no trace at all** —
no audit row, no alert, no log.

---

## A10 — Server-Side Request Forgery

### SEC-019 · `live-price` is an unauthenticated outbound proxy — **LOW**
`verify_jwt=false`; `provider` is constrained to `yahoo|mf` and `symbol` is
`encodeURIComponent`-ed into a fixed host path, so arbitrary-host SSRF is **not** possible.
Residual risk is abuse: unlimited unauthenticated outbound requests and edge invocations
billed to your project, and a path-parameter injection surface into two third-party APIs.
**Fix:** require a JWT, validate `symbol` against `^[A-Z0-9.\-:]{1,20}$`, and cache responses.

---

## Extended checklist

| Control | Result |
|---|---|
| Broken access control | ❌ SEC-001/002/003/004 |
| Cryptographic failures | ⚠️ SEC-005/006/007 |
| Injection | ✅ SQL none; XSS none found |
| Insecure design | ❌ SEC-009/010/011/012/013 |
| Security misconfiguration | ❌ SEC-014/015/016/017/018 |
| Vulnerable components | ❌ 9 high (xlsx unfixable on npm) |
| Auth failures | ❌ no MFA, no throttling, enumeration |
| Integrity failures | ❌ replay + forgeable audit |
| Logging failures | ❌ no monitoring at all |
| SSRF | ✅ constrained (SEC-019 abuse only) |
| CSRF | ✅ n/a — bearer tokens, no cookie auth |
| CORS | ⚠️ `*` |
| CSP | ❌ absent |
| Security headers | ❌ absent |
| Cookie flags | n/a |
| JWT handling | ⚠️ `localStorage` |
| Secrets management | ⚠️ Supabase function secrets ✔; `.env` untracked by `.gitignore`; `.env.e2e` holds live test creds |
| Rate limits | ❌ none |
| DoS / DDoS readiness | ❌ unbounded queries + unthrottled public functions + bcrypt-per-request |
| File uploads | ⚠️ insurance docs & branding logo are base64 into DB — no size cap, no MIME verification beyond the input `accept`, no AV scan |
| API abuse | ❌ no quotas |
| Directory traversal | ✅ n/a (SPA + PostgREST) |
| Open redirects | ✅ none — all redirects are `window.location.origin`-anchored |
| Clickjacking | ❌ no `frame-ancestors` |
| IDOR | ✅ none |
| Command injection | ✅ n/a |
| NoSQL injection | ✅ n/a |
| Race conditions | ⚠️ read-modify-write on `goals.current_amount`, `budgets.spent` |
| Replay attacks | ❌ SEC-012 |
| Privilege escalation | ⚠️ SEC-001; **no path to platform-admin found ✅** |
| Session hijacking | ⚠️ SEC-006 + no CSP |
| Brute force | ❌ SEC-011 |
| Enumeration | ⚠️ `po-auth` |
| Webhook validation | ⚠️ signature ✔, replay ✖, timing ✖ |
| Billing abuse | ❌ SEC-001 |
| Subscription bypass | ❌ SEC-001 + SEC-002 |
| Payment manipulation | ✅ amounts come from Paddle, not the client ✔ |
| License bypass | ❌ = subscription bypass |
| Tenant isolation | ⚠️ RLS is correct, but `current_tenant_id()` misroutes writes for multi-workspace users (KI-001) — a **correctness** failure, not a cross-account leak |
| Sensitive info leakage | ⚠️ raw DB errors in toasts; PO email via `po-auth` |
| Error leakage | ❌ AR-006 |
| PII leakage | ⚠️ no retention/erasure flow; base64 documents pulled into the browser on every list load |
| Environment leakage | ⚠️ `.env*` untracked by `.gitignore` |
| Backup leakage | n/a — **no backups exist** |
| Cloud configuration | ⚠️ `config.toml` targets production |
| Storage buckets | ✅ none in use (which is itself DB-007) |
| Encryption | ✅ transit + at rest; ❌ no column-level encryption for financial PII |
