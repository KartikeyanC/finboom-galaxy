# Security Report — executive summary & remediation plan

> Audit date 2026-08-04. Full technical detail: [Security_Audit.md](./Security_Audit.md).
> Related: [Database_Report.md](./Database_Report.md), [API_Report.md](./API_Report.md),
> [Authorization_Flow.md](./Authorization_Flow.md).

---

## Verdict

**Do not accept paying subscribers on the current build.**

The authorization *foundation* is genuinely good — RLS is applied uniformly to all 22 tables,
privileged actions run through audited `SECURITY DEFINER` RPCs, and there is no SQL injection,
no IDOR, and no path to self-granting platform-admin. What is missing is the last mile:
one over-broad UPDATE policy makes the paywall optional, several helper functions were never
revoked from `PUBLIC`, one edge function is an open mail relay, and there is no rate limiting,
monitoring or backup anywhere.

Two of the four blocking findings are exploitable from the browser console by any user who
completes signup, in under a minute, with no trace left in the audit log.

---

## Finding register

| ID | Finding | Sev | Exploitable by | Effort |
|---|---|---|---|---|
| **SEC-001** | Tenant owner can UPDATE `subscriptions` → self-grant any plan | **Critical** | any signed-up user | XS |
| **SEC-014** | `log_audit` / `create_notification` etc. executable by `PUBLIC` → forge audit rows, push notifications to any user | **High** | any signed-up user | XS |
| **SEC-009** | `send-email` accepts arbitrary `to`/`html` → open relay from your domain | **High** | any signed-up user | S |
| **SEC-011** | No rate limiting: PO secret brute force, reset-mail bomb, `live-price` abuse | **High** | anonymous | M |
| **SEC-010** | 16-digit code is an *alternative* to the PO password, not a second factor | **High** | anonymous (with the code) | S |
| **SEC-012** | Paddle webhook has no replay window or event de-duplication | **High** | network observer | S |
| **SEC-002** | Plan/menu gating not enforced on data endpoints — paywall is cosmetic | **High** | any member | M |
| A06 | 9 high-severity dependency CVEs; `xlsx` prototype pollution has **no npm fix** and parses user uploads | **High** | crafted upload | M |
| A09 | No error monitoring, no auth-event logging, no alerting, no error boundary | **High** | — | M |
| **SEC-016** | No CSP / HSTS / frame-ancestors / nosniff — no hosting header config in the repo | **Medium** | — | S |
| **SEC-006** | Session JWT in `localStorage` (compounds any XSS) | **Medium** | — | M |
| **SEC-005** | PIN = unsalted SHA-256 over ≤10⁶ keyspace; `isUnlocked` fails open | **Medium** | device/XSS | S |
| **SEC-013** | Goal/budget/balance arithmetic is client-authored with no server invariant | **Medium** | any member | M |
| **SEC-018** | `config.toml` targets the **live** project — accidental prod deploys | **Medium** | operator error | XS |
| **SEC-003** | `/app/export`, `/app/billing` ungated; a `viewer` can export everything | **Medium** | viewer | XS |
| **SEC-007** | Non-constant-time webhook HMAC compare | **Medium** | — | XS |
| **SEC-004** | Unlimited tenant creation | **Medium** | any user | XS |
| **SEC-015** | Wildcard CORS on all edge functions | **Low** | — | XS |
| **SEC-017** | `.env*` not in `.gitignore`; `.env.e2e` holds live test creds | **Low** | — | XS |
| **SEC-019** | `live-price` unauthenticated proxy (abuse, not SSRF) | **Low** | anonymous | S |
| A08 | Three lockfiles; no SRI on Google Fonts / Paddle.js | **Low** | — | XS |
| — | No PII retention, export or erasure flow (GDPR/DPDP) | **Medium (legal)** | — | M |

## What is genuinely solid ✅

- No SQL injection anywhere — no dynamic SQL, no string-built queries.
- No IDOR/BOLA — there are no id-parameterised endpoints; RLS scopes every row.
- **No privilege-escalation path to Product Owner** — `platform_admins` has no INSERT/UPDATE
  policy and no RPC that writes it; seeding requires service-role access.
- Member-management RPCs correctly exclude `role = 'owner'` and restrict grantable roles to
  `admin|viewer`.
- Password and PO-secret hashing use bcrypt; the secret is never returned to a client.
- The PO console reads aggregates via RPC, never raw finance rows — as designed.
- Paddle amounts come from the webhook payload, never from the client.
- Both `dangerouslySetInnerHTML` sites operate on hardcoded constants, not user input.

---

## Remediation plan

### Sprint 0 — release blockers (≈1 day, mostly SQL)

```sql
-- 1. SEC-001  close the plan self-upgrade
DROP POLICY IF EXISTS sub_update ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;

-- 2. SEC-014  revoke default PUBLIC execute
REVOKE EXECUTE ON FUNCTION public.log_audit(uuid,text,text,text,jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid,uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_subscriptions()                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_expiring_subscriptions(int)                FROM PUBLIC, anon, authenticated;

-- 3. SEC-004  stop arbitrary tenant creation
DROP POLICY IF EXISTS tenants_insert ON public.tenants;

-- 4. DB-004  unblock the "Other" trip type
ALTER TABLE public.trips DROP CONSTRAINT trips_kind_check;
ALTER TABLE public.trips ADD  CONSTRAINT trips_kind_check
  CHECK (kind IN ('solo','friends','family','other'));
```

Also in Sprint 0:
- **SEC-009** — rewrite `send-email` to take `{template, tenant_id, params}` and resolve
  recipients server-side. Until then, **undeploy it** (only `PermissionsCenter`'s best-effort
  invite mail calls it, and it no-ops without `RESEND_API_KEY` anyway).
- **SEC-018** — remove `project_id` from `config.toml` or point it at dev; require an explicit
  `--project-ref` in every documented command.
- **SEC-003** — add `MenuGuard` to `/app/billing` and `/app/export`.
- **SEC-017** — add `.env*` to `.gitignore` (keep `.env.example`); rotate the `.env.e2e` test
  account password.

### Sprint 1 — hardening (≈1 week)

- **SEC-011** rate limiting: per-IP + per-identifier token bucket on `po-auth`; lockout after
  5 failures; throttle `resetPasswordForEmail`; require a JWT on `live-price` and cache it.
- **SEC-012/007** webhook: reject `ts` older than 5 minutes, constant-time compare, and a
  `processed_webhooks(event_id)` unique table.
- **SEC-010** make the 16-digit code a second factor on top of the password.
- Log every PO sign-in (success and failure) to `audit_log`.
- **A06** dependency remediation: `npm audit fix`; replace or sandbox `xlsx`.
- **SEC-016** ship `vercel.json`/`_headers` with CSP, HSTS, `frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **A09** add Sentry (or equivalent) + a React `ErrorBoundary` + an uptime check.
- **SEC-015** replace `*` CORS with an origin allow-list.

### Sprint 2 — structural (≈2–3 weeks)

- ~~**SEC-002** decide and implement the menu-authorization contract (see AZ-001). If plans are a
  paywall, the gate must live in RLS.~~ **Done 2026-08-05 (Stage 2.15):** `has_menu()` is ANDed
  into the RLS of the 11 tables that map 1:1 to a menu, so plans are now a real paywall there;
  the `transactions`-backed menus are documented as navigation-only. Follow-up: AZ-009/BUG-081.
- **KI-001** explicit `tenant_id` on every read and write (see [Known_Issues.md](./Known_Issues.md)).
- **SEC-013** move goal/budget/balance mutations into `SECURITY DEFINER` RPCs with invariants.
- **SEC-005** PBKDF2/scrypt for the PIN; fail closed; add a PIN-reset path.
- **DB-007** move insurance documents and the branding logo to Supabase Storage with size caps
  and MIME validation.
- PII lifecycle: retention policy for `audit_log`/`notifications`/`subscriptions.raw`, plus a
  data-export and account-deletion flow.
- Backups: enable Supabase PITR (requires Pro) and **test a restore** —
  see [Disaster_Recovery.md](./Disaster_Recovery.md).

---

## Sign-off criteria

Before the first paying subscriber, all of the following must be true:

- [ ] SEC-001, SEC-014, SEC-009, SEC-004 closed and verified by an automated test that attempts
      the exploit and asserts failure
- [ ] SEC-011 rate limiting live on `po-auth` and password reset
- [ ] SEC-012 webhook replay window + de-duplication in place
- [ ] A written, implemented decision on SEC-002 (paywall enforcement)
- [ ] Security headers deployed and verified against securityheaders.com
- [ ] `npm audit --omit=dev` shows no High with an available fix; `xlsx` mitigated or replaced
- [ ] Error monitoring receiving events; an error boundary in place
- [ ] PITR enabled and a restore rehearsed
- [ ] A negative-path RLS test suite in CI (see [Testing_Master_Plan.md](./Testing_Master_Plan.md) §Security testing)
