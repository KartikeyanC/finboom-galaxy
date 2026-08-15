# Disaster Recovery

> Audit date 2026-08-04.
>
> ## 🔴 There is currently no disaster recovery capability.
>
> No backups are configured. No restore has ever been performed. Migrations have no down
> scripts. Tenant deletion is a hard cascade. **Any destructive event today results in
> permanent, total loss of customer financial data.**
>
> This document therefore has two parts: **what to build** (§1–5) and **what to do right now if
> something breaks** (§6), which is honestly very little.

---

## 1. Objectives

| Metric | Target | Today |
|---|---|---|
| **RPO** (max acceptable data loss) | ≤ 5 minutes | **∞ — total loss** |
| **RTO** (max acceptable downtime) | ≤ 4 hours | **unbounded** |
| Backup retention | 30 days PITR + 90 days weekly | none |
| Restore rehearsal | quarterly | never |

For a product holding people's complete financial history, an RPO of "everything" is not a
tolerable position at any scale — including the current one.

---

## 2. What must be protected

| Asset | Criticality | Where | Recoverable today? |
|---|---|---|---|
| Postgres `public` schema (22 tables) | **Critical** — irreplaceable customer data | Supabase | ❌ |
| `auth.users` | **Critical** — accounts and credentials | Supabase GoTrue | ❌ |
| Migration history (32 files) | High — schema is reproducible from these | this repo | ✅ if the repo survives |
| Edge function source (5) | High | this repo | ✅ |
| Function secrets (service role, Paddle, Resend) | **Critical** | Supabase dashboard | ⚠️ only if recorded in a password manager |
| Frontend build | Medium — reproducible from source | Vercel/Netlify | ✅ |
| Insurance documents + branding logo | High — **stored as base64 inside the DB**, so they live and die with the database | Postgres | ❌ |
| `site_settings` (pricing, branding) | Medium | Postgres | ❌ |
| Paddle subscription state | High | Paddle (system of record) | ✅ replayable from Paddle |

⚠️ **The repository itself is not under version control** — the working directory is not a git
repo. The migrations and function source that make the schema reproducible exist in exactly one
place, on one disk. **Initialise git and push to a remote before anything else in this
document.**

---

## 3. Backup strategy to implement

### 3.1 Supabase PITR — the primary control
Requires the **Pro** plan (~$25/mo). This is the one place where the project's cost-first
constraint should be overridden: the cost of a month of Pro is trivially less than the cost of
losing a single customer's financial history.

- Enable PITR on the live project → continuous WAL archiving, 7-day window on Pro.
- Achieves **RPO ≈ minutes**.

### 3.2 Independent logical backup — the safety net
PITR lives inside the same vendor account. An account compromise, a billing lapse or an
accidental project deletion takes it with the database. Keep a copy outside Supabase:

```bash
# Nightly, from a machine or scheduled job outside Supabase
pg_dump "$LIVE_DB_URL" \
  --format=custom --no-owner --no-privileges \
  --file="finroot-$(date +%F).dump"

# Verify it is non-empty and restorable before uploading
pg_restore --list "finroot-$(date +%F).dump" > /dev/null || exit 1

# Encrypt, then upload to a different provider (S3/R2/B2)
age -r "$RECIPIENT" < "finroot-$(date +%F).dump" > "finroot-$(date +%F).dump.age"
```

- Retention: 7 daily, 4 weekly, 12 monthly.
- Encrypted at rest, in a **different account and provider** from Supabase.
- **A backup that has never been restored is not a backup.**

### 3.3 Auth data
`auth.users` is included in a full `pg_dump` of the database. Confirm this explicitly during the
first restore rehearsal — losing accounts while keeping finance rows is the worst of both worlds
because the RLS predicates reference `auth.uid()`.

### 3.4 Secrets
Record every function secret in a shared password manager: service role key, Paddle sandbox and
live API keys, both webhook secrets, `RESEND_API_KEY`, the Supabase access token, and the PO's
16-digit code (which is bcrypt-hashed and **can never be recovered from the database**).

---

## 4. Restore procedures

### 4.1 Point-in-time restore (after PITR is enabled)
1. Declare the incident; note the last known-good timestamp.
2. Put the frontend into maintenance mode (a static page — one does not exist; create one).
3. Supabase dashboard → Database → PITR → restore to a **new project**.
4. Verify on the restored copy before switching:
   ```sql
   SELECT count(*) FROM transactions;
   SELECT count(*) FROM tenant_members;
   SELECT count(*) FROM auth.users;
   SELECT max(created_at) FROM transactions;
   ```
5. Repoint `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, redeploy the frontend.
6. Redeploy all edge functions and re-set every secret on the new project.
7. Update the Paddle webhook URL to the new project ref.
8. Run the §7 verification.

**Estimated RTO: 2–4 hours**, dominated by steps 6–7.

### 4.2 Logical restore from a dump
```bash
age -d -i key.txt < finroot-2026-08-04.dump.age > restore.dump
createdb finroot_restore
pg_restore --dbname="$SCRATCH_DB_URL" --no-owner --no-privileges restore.dump
```
Then re-apply grants and re-verify RLS — `--no-privileges` drops them.

### 4.3 Partial restore (a single tenant deleted in error)
`po_delete_tenant` is a hard delete that cascades every finance table. To recover one tenant:
1. Restore a full copy into a **scratch** project.
2. Extract that tenant's rows in FK order:
   `tenants → tenant_members → subscriptions → accounts → transactions → …`
3. Re-insert into live inside a transaction, preserving the original `id` values so foreign
   keys and the description-encoded account ids still resolve.

**This is slow and error-prone. The real fix is soft delete** (roadmap 3.5): mark
`status = 'deleted'`, purge after 30 days, and offer an export first.

---

## 5. Failure scenarios

| Scenario | Likelihood | Impact | Today | With the plan |
|---|:-:|:-:|---|---|
| Bad migration corrupts data | Medium | Critical | **unrecoverable** | PITR to just before the migration |
| Accidental `po_delete_tenant` | Medium | Critical | **unrecoverable** | soft delete, or partial restore |
| Supabase regional outage | Low | High | wait it out | wait it out (single region — accepted) |
| Supabase account compromise | Low | Critical | **total loss** | off-site encrypted dump |
| Ransomware / disk loss on the dev machine | Medium | High | **migration source lost** | git remote |
| Paddle outage | Low | Medium | checkout unavailable; existing access unaffected ✔ | webhook replay from Paddle |
| Yahoo / mfapi outage | High | Low | prices fall back to stored values ✔ | + caching |
| Resend outage | Medium | Low | email is already a no-op ✔ | queue and retry |
| Edge function deploy breaks billing | Medium | High | redeploy the previous source | tagged releases |
| Frontend deploy breaks the app | Medium | Medium | host rollback ✔ | ✔ |
| Session/JWT signing key rotation | Low | High | all users signed out | documented, communicated |
| ⚠️ **`supabase db push` against live by accident** | **Medium** | **Critical** | **unrecoverable** | `config.toml` fixed + PITR |

The last row is the compounding risk: `config.toml` points at live (BUG-033), migrations are
irreversible, and there are no backups. Three single points of failure aligned.

---

## 6. What to do *today* if something breaks

Honest, current-state runbook:

1. **Stop all writes immediately.** Take the frontend down (host → disable deployment). The
   longer the app runs on corrupted data, the less recoverable it becomes.
2. **Do not run any further migration or fix.**
3. **Snapshot whatever survives**, right now:
   ```bash
   pg_dump "$LIVE_DB_URL" --format=custom --file="emergency-$(date +%s).dump"
   ```
   Even a post-incident dump preserves what is left and prevents further loss.
4. **Contact Supabase support.** On the free tier they have no obligation to hold a backup, but
   ask — internal snapshots sometimes exist.
5. **Reconstruct what you can from external systems:** Paddle holds the authoritative
   subscription and payment history; `auth.users` may be partially reconstructable from Paddle
   customer emails.
6. **Communicate.** Tell affected users what was lost and over what period. For financial data,
   silence is worse than the loss.
7. **Then** implement §3 before restarting the service.

---

## 7. Post-restore verification

| # | Check |
|---|---|
| 1 | Row counts per table match the pre-incident baseline (record one weekly) |
| 2 | `select count(*) from auth.users` matches |
| 3 | Every tenant has exactly one owner in `tenant_members` |
| 4 | Every tenant has exactly one `subscriptions` row |
| 5 | No orphan `tenant_id` values in any finance table |
| 6 | RLS verified with a non-owner JWT (a viewer cannot write; workspace B cannot read A) |
| 7 | All five edge functions respond |
| 8 | Paddle webhook delivers to the new URL |
| 9 | A test sign-in and a test transaction succeed |
| 10 | Insurance document data URLs still render |

---

## 8. Immediate actions

| # | Action | Owner | Priority |
|---|---|---|---|
| 1 | **`git init`, commit, and push to a private remote** — the migration source exists in one place on one disk | Eng | **P0 — today** |
| 2 | Record every secret in a password manager | Ops | **P0 — today** |
| 3 | Remove the live `project_id` from `supabase/config.toml` | Eng | **P0 — today** |
| 4 | Take a manual `pg_dump` of live and store it encrypted off-site | Ops | **P0 — this week** |
| 5 | Upgrade the live project to Pro and enable PITR | Ops | P0 — this week |
| 6 | Automate the nightly encrypted dump | Ops | P1 |
| 7 | Rehearse a full restore into a scratch project and time it | Eng | P1 |
| 8 | Convert tenant deletion to soft delete + export | Eng | P1 |
| 9 | Create a static maintenance page | Eng | P2 |
| 10 | Record a weekly row-count baseline for verification | Ops | P2 |
| 11 | Document an incident-response process and an on-call contact | Ops | P2 |
| 12 | Schedule quarterly restore rehearsals | Ops | P2 |
