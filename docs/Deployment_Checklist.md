# Deployment Checklist

> ## ⚠️ Superseded in part — read [runbooks/deploy.md](./runbooks/deploy.md) first.
>
> This is a **2026-08-04 audit snapshot**. Three of its statements are no longer true:
> `vercel.json` and `public/_headers` now exist and carry the CSP; `supabase/config.toml` no longer
> defaults to the live project; and the dev project it names (`hkfwuxqeexamyphcgkxr`) was deleted in
> the 2026-08-05 rebuild — the project in use is named in `.env.development`.
> The environment matrix and the per-step reasoning below are still worth reading.

> Audit date 2026-08-04. **There is no CI/CD.** Every step below is currently manual, which is
> itself the largest deployment risk (BUG-031). The proposed pipeline is in
> [Testing_Master_Plan.md](./Testing_Master_Plan.md) §8.

---

## 0. Current deployment reality

| Aspect | State |
|---|---|
| Pipeline | ❌ none — no `.github/`, no Dockerfile |
| Environments | dev `hkfwuxqeexamyphcgkxr` · live `tsmdnfywxsjsjqjszoek` (Lovable-managed, different account). **No staging.** |
| Frontend host | not configured in this repo — no `vercel.json`, `netlify.toml` or `_headers` |
| DB deploy | manual `supabase db push` |
| Function deploy | manual `supabase functions deploy` |
| Rollback | ❌ none — migrations are append-only with no down scripts |
| Backups | ❌ none |
| ⚠️ **Default target** | `supabase/config.toml` sets `project_id` to the **live** project, so any CLI command without `--project-ref` hits production |

**Fix `config.toml` before running any CLI command in this repo.**

---

## 1. Environment matrix

| Variable | Where | Dev | Live | Notes |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env*` | dev ref | live ref | public |
| `VITE_SUPABASE_PROJECT_ID` | `.env*` | dev ref | live ref | public |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env*` | dev anon | live anon | public by design |
| `VITE_PAYMENTS_CLIENT_TOKEN` | `.env.development` / `.env.production` | `test_…` | `live_…` | Paddle client token; `Billing.tsx` picks sandbox vs production from the `live_` prefix |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase function secrets | ✔ | ✔ | **never** in `.env*` |
| `PADDLE_SANDBOX_API_KEY` / `PADDLE_LIVE_API_KEY` | function secrets | sandbox | live | `billing-api` picks live only when the live key is set and the sandbox key is not |
| `PAYMENTS_SANDBOX_WEBHOOK_SECRET` / `PAYMENTS_LIVE_WEBHOOK_SECRET` | function secrets | ✔ | ✔ | webhook HMAC |
| `RESEND_API_KEY` | function secrets | ❌ unset | ❌ unset | `send-email` no-ops without it |
| `EMAIL_FROM` | function secrets | — | — | defaults to `FinRoot <onboarding@resend.dev>` |

⚠️ `.gitignore` does not cover `.env`, `.env.development` or `.env.production`. Add
`.env*` (keeping `.env.example`) before the first real secret is added.

---

## 2. Pre-deployment gate

Every item must pass. Today, items 1, 2, 5 and 6 **fail**.

| # | Check | Command | Current |
|---|---|---|---|
| 1 | Type check | `npx tsc -p tsconfig.app.json --noEmit` | ❌ exit 2 (10 errors) |
| 2 | Lint | `npx eslint .` | ❌ exit 1 (11 errors) |
| 3 | Unit tests | `npx vitest run` | ✅ 30/30 |
| 4 | Build | `node_modules/.bin/vite build` | ✅ |
| 5 | Bundle budget ≤ 250 kB gz | inspect `dist/assets/index-*.js` | ❌ 735 kB gz |
| 6 | Dependency audit | `npm audit --omit=dev --audit-level=high` | ❌ 9 high |
| 7 | E2E | `npm run e2e` | needs `.env.e2e` |
| 8 | Security negative suite | SEC-T01…T20 | ❌ not written |
| 9 | Migrations apply to an empty DB | `supabase db reset` on a scratch project | not verified |
| 10 | `types.ts` matches the schema | regenerate and `git diff` | ❌ 4 migrations stale |
| 11 | No open S1/S2 bugs | [BUG_TRACKER.md](./BUG_TRACKER.md) | ❌ 2 S1, 35 S2 |

---

## 3. Database deployment

```bash
# ALWAYS pass --project-ref explicitly. Never rely on config.toml.
SB=".tools/supabase/supabase.exe"          # standalone CLI, v2.104
DEV_REF="hkfwuxqeexamyphcgkxr"
ROOT="F:/Movie/AK/FinRoot/_extracted"
```

**Order of operations**

1. **Back up first.** No migration runs against live until a verified backup exists
   ([Disaster_Recovery.md](./Disaster_Recovery.md)).
2. Dry-run against a scratch project restored from the latest backup.
3. Review the diff:
   ```bash
   "$SB" db diff --project-ref "$DEV_REF" --workdir "$ROOT"
   ```
4. Push:
   ```bash
   "$SB" db push --db-url "<session-pooler-url>" --workdir "$ROOT"
   ```
   *Use the **session pooler** host — `db.<ref>.supabase.co` does not resolve over IPv4.
   URL-encode special characters in the password (`&` → `%26`).*
5. Regenerate types and commit:
   ```bash
   "$SB" gen types typescript --project-id "$DEV_REF" > src/integrations/supabase/types.ts
   ```
   *(`--db-url` requires Docker; `--project-id` needs `SUPABASE_ACCESS_TOKEN`.)*
6. Verify RLS with a non-owner JWT before declaring success.

**⚠️ Live is untracked.** The live project is Lovable-managed in a different account; nothing
records which of the 32 migrations it has. **Reconcile and document this before the next live
push** (BUG-034).

---

## 4. Edge function deployment

```bash
"$SB" functions deploy po-auth          --project-ref "$DEV_REF" --workdir "$ROOT"
"$SB" functions deploy payments-webhook --project-ref "$DEV_REF" --no-verify-jwt --workdir "$ROOT"
"$SB" functions deploy live-price       --project-ref "$DEV_REF" --no-verify-jwt --workdir "$ROOT"
"$SB" functions deploy billing-api      --project-ref "$DEV_REF" --workdir "$ROOT"
# send-email — DO NOT DEPLOY until BUG-005 (open relay) is fixed
```

`--workdir` is required. Deployment works without Docker (it only warns).
`verify_jwt = false` for `po-auth`, `payments-webhook` and `live-price` is set in
`config.toml` — keep those three in sync with the deploy flags.

**Currently deployed to dev:** `po-auth`, `send-email`, `payments-webhook`, `billing-api`.
**Not deployed:** `live-price` — which is why Investments logs CORS errors (BUG-059).

---

## 5. Frontend deployment

```bash
npm ci
npm run build           # or: node_modules/.bin/vite build
```
Publish `dist/` to Vercel or Netlify with SPA rewrites (`/* → /index.html`).

**Hosting configuration — now shipped** in both `vercel.json` and `public/_headers`; keep the two
in sync. The live files also carry a `Content-Security-Policy-Report-Only` variant to shake out
violations before the policy is enforced. Note `font-src 'self'`: fonts are self-hosted as of Stage
4.11, so a font moved back to Google Fonts would be blocked.

```
/*
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.supabase.co https://*.paddle.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' https://cdn.paddle.com; frame-ancestors 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache
```
*Note: the CSP above assumes fonts stay on Google Fonts. Self-hosting them (roadmap 4.11)
lets you drop two exceptions.*

**Service worker:** `public/sw.js` uses cache `finroots-v1` and never intercepts cross-origin
requests. **Bump the cache name on any change to the SW itself**, or clients keep the old one.

---

## 6. Third-party configuration

### Paddle
- [ ] Products and prices created (sandbox **and** live)
- [ ] `plans.paddle_price_id` populated for every paid plan — `upgradeable_plans()` returns
      nothing without it
- [ ] Webhook endpoint: `https://<ref>.supabase.co/functions/v1/payments-webhook?env=live`
- [ ] Webhook secret stored as a function secret
- [ ] Events subscribed: `subscription.created|updated|canceled`
- [ ] Sandbox purchase completed end-to-end and the `subscriptions` row verified
- [ ] ⚠️ Prices reconciled with the landing page (BUG-019)

### Resend
- [ ] Domain verified; SPF, DKIM and DMARC published
- [ ] `RESEND_API_KEY` + `EMAIL_FROM` set
- [ ] ⚠️ **`send-email` rebuilt as a template API first** (BUG-005)

### Supabase Auth
- [ ] Site URL and redirect allow-list set (`/app`, `/reset-password`)
- [ ] SMTP configured — password reset and email confirmation do not work without it
- [ ] Email-confirmation policy decided and matched to the UI copy
- [ ] Google OAuth configured (note: brokered by `@lovable.dev/cloud-auth-js`)
- [ ] Rate limits reviewed

### Product Owner
- [ ] At least one row seeded in `platform_admins` via service role — there is **no** self-service path
- [ ] `po_set_secret()` called and the 16-digit code stored in a password manager (it can never be displayed again)
- [ ] Optional `po_user_id` / `po_number_id` set

---

## 7. Post-deployment verification

| # | Check |
|---|---|
| 1 | `/` loads; no console errors; no horizontal overflow at 375, 390 and 414 px |
| 2 | Sign up a throwaway account → profile, tenant, owner membership and a Free subscription all created |
| 3 | PIN gate appears, then the dashboard renders |
| 4 | Create, edit and delete a transaction |
| 5 | A second account **cannot** see the first account's data |
| 6 | A `viewer` cannot write |
| 7 | Menus match the plan |
| 8 | `/po/login` works; `/po/*` rejects a non-PO |
| 9 | Paddle sandbox checkout → webhook → `subscriptions` row upgraded in place |
| 10 | Notification bell and mark-all-read work |
| 11 | Import a template CSV; export it back |
| 12 | Errors are arriving in the monitoring dashboard |
| 13 | `securityheaders.com` grade ≥ A |
| 14 | PWA installs and the offline shell loads |
| 15 | **Delete the throwaway account and its tenant** |

---

## 8. Rollback

There is no automated rollback. Today:

| Layer | Rollback |
|---|---|
| Frontend | redeploy the previous build (Vercel/Netlify instant rollback) |
| Edge functions | redeploy the previous source — **keep a tagged copy** |
| Database | ❌ **no path** — migrations are append-only with no down scripts. The only recovery is a restore, and no backups exist |

**Required before the next live migration:** a verified backup and a written forward-fix plan
per migration. Treat every DB change as irreversible until PITR is enabled.

---

## 9. Release sign-off

| Item | Owner | ✔ |
|---|---|---|
| Pre-deployment gate all green | Eng | ⬜ |
| No open S1/S2 bugs | QA | ⬜ |
| Backup verified within the last 24 h | Ops | ⬜ |
| Migrations dry-run against a restored copy | Eng | ⬜ |
| Security negative suite passing | Security | ⬜ |
| Rollback plan written for this release | Eng | ⬜ |
| Monitoring confirmed receiving events | Ops | ⬜ |
| Post-deployment verification complete | QA | ⬜ |
