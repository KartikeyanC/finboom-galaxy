# Database Report

> Review of the schema against the checklist in the Phase 1 brief.
> Schema reference: [Database_Architecture.md](./Database_Architecture.md). Audit 2026-08-04.
> Severity: **C**ritical / **H**igh / **M**edium / **L**ow.

---

## Executive summary

The schema is **well-formed and internally consistent**: uniform RLS, correct money types,
sensible cascades, append-only migrations. Two classes of problem dominate:

1. **Tenancy is resolved by a default, not by the caller.** `current_tenant_id()` returns the
   user's *first* membership. Because no client code sets `tenant_id`, every write by a
   multi-workspace user lands in the wrong workspace, and every read merges workspaces.
2. **Privilege boundaries leak through un-revoked `EXECUTE` grants and one over-broad UPDATE
   policy.** Postgres grants `EXECUTE` to `PUBLIC` by default; several `SECURITY DEFINER`
   functions were never revoked.

---

## DB-001 · Tenant resolution is positional, not explicit — **C**

`current_tenant_id()`:
```sql
SELECT m.tenant_id FROM tenant_members m
WHERE m.user_id = auth.uid() AND m.status = 'active'
ORDER BY m.created_at ASC LIMIT 1;
```
Combined with `tenant_id NOT NULL DEFAULT current_tenant_id()` on 15 tables and client hooks
that never send `tenant_id`, the consequences are:

- **Write misrouting.** A collaborator in workspace B always writes into their own workspace A
  (created first, at signup). The row passes `is_tenant_member(tenant_id,'admin')` because they
  *are* an admin of A. No error is raised; the data simply vanishes from B's view.
- **Read merging.** `SELECT * FROM transactions` returns rows from *every* workspace the user
  belongs to. `useTransactions` applies no `tenant_id` filter, so a collaborator sees their own
  finances merged with the workspace they were invited into.
- **Aggregates are wrong.** Every dashboard total, budget utilisation and net-worth figure for
  a multi-workspace user is computed over the union of workspaces.

**Fix:** pass `tenant_id` explicitly from `TenantContext` on every insert, add
`.eq("tenant_id", currentTenantId)` to every select, and add a `WITH CHECK` that the supplied
`tenant_id` matches the caller's active workspace. Keep the default only as a safety net.

## DB-002 · Tenant owners can UPDATE their own `subscriptions` row — **C**

```sql
CREATE POLICY sub_update ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin())
  WITH CHECK (...same...);
```
`GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO authenticated` (from the original
Lovable migration) was never narrowed. `plans` is world-readable, so the Pro plan's `id` is
public. Any workspace owner can run:

```sql
UPDATE subscriptions
SET plan_id = '<pro-plan-uuid>', plan_name = 'Pro',
    status = 'active', current_period_end = '2099-01-01', provider = 'manual'
WHERE tenant_id = '<their own tenant>';
```

`plan_menus()` then returns the Pro menu set. **Complete billing bypass with no payment.**
Cross-referenced as **SEC-001** in [Security_Audit.md](./Security_Audit.md).

**Fix:** drop `sub_update`; `REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM authenticated`.
All writes should go through the webhook (service role) or `po_assign_plan`.

## DB-003 · `SECURITY DEFINER` functions left executable by `PUBLIC` — **H**

Postgres grants `EXECUTE` to `PUBLIC` on `CREATE FUNCTION`. Only `po_resolve_identifier` and
`po_verify_secret` were revoked. The following are therefore callable by any `anon` or
`authenticated` role:

| Function | Impact |
|---|---|
| `log_audit(tenant, action, entity, entity_id, metadata)` | **forge arbitrary audit-log entries** for any tenant, attributed to the caller — destroys audit integrity |
| `create_notification(user_id, tenant_id, type, title, body, payload)` | **send arbitrary in-app notifications to any user** — phishing/spam inside the product |
| `expire_subscriptions()` | mass-flip expired subs (idempotent, low harm) |
| `notify_expiring_subscriptions(days)` | notification flood |
| `plan_menus`, `all_feature_menus`, `is_tenant_member`, `is_platform_admin`, `current_tenant_id` | information only; low risk |

**Fix:** `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` on `log_audit`,
`create_notification`, `expire_subscriptions`, `notify_expiring_subscriptions`; grant only to
`service_role`. They are called from other `SECURITY DEFINER` functions, which run as owner and
are unaffected.

## DB-004 · `trips.kind` CHECK does not include `'other'` — **H**

`src/lib/tripsStore.ts` declares `TripKind = "solo" | "friends" | "family" | "other"` and the
Trips UI offers an "Other" tile, but the constraint is
`CHECK (kind IN ('solo','friends','family'))`. Creating an "Other" trip fails with a
constraint violation surfaced as a raw Postgres message in a toast.

**Fix:** new migration — `ALTER TABLE trips DROP CONSTRAINT trips_kind_check, ADD CONSTRAINT
trips_kind_check CHECK (kind IN ('solo','friends','family','other'));`

## DB-005 · Any authenticated user can create unlimited tenants — **M**

`tenants_insert` is `WITH CHECK (created_by = auth.uid())` with no rate or quota. The rows are
orphans (no membership is created), so they are invisible and unreachable, but they inflate
`po_dashboard_stats().total_tenants` and grow the table without bound.

**Fix:** remove the INSERT policy; require `po_create_tenant()` or the signup trigger.

## DB-006 · `budgets` uniqueness is user-scoped, not tenant-scoped — **M**

`UNIQUE (user_id, bucket, period_start)` predates tenancy. Two members of the same workspace can
create duplicate buckets for the same period; conversely one user in two workspaces collides
with themselves across workspaces.

**Fix:** replace with `UNIQUE (tenant_id, bucket, period_start)` after de-duplicating.

## DB-007 · Base64 documents stored in a `text` column — **M**

`insurance.document_data_url` holds a base64 data URL for uploaded policy PDFs/images; the same
pattern is used for the branding logo in `site_settings.value->>'logoUrl'`.

Consequences: a 2 MB PDF becomes ~2.7 MB of row data; `SELECT *` on the insurance list pulls
every document into the browser on every page load; TOAST pressure; no CDN; no size limit;
backup size grows fast.

**Fix:** move to Supabase Storage with signed URLs; keep only the object path in the row.

## DB-008 · No pagination-friendly access path — **M**

No table has a covering index that supports keyset pagination *and* no client query uses
`.range()`/`.limit()` except `notifications` (100). `transactions` is the growth table: at
10 000 rows a dashboard load transfers several MB and does all aggregation in JS.

**Fix:** add `.range()` + `occurred_at` filters; consider a materialised monthly-summary table
or a `SECURITY DEFINER` aggregate RPC for dashboard tiles.

## DB-009 · Structured data encoded in `transactions.description` — **M**

Format: `[PaymentMode|accountId] subcategory · note`, parsed by
`/^\[([^\]|]+)(?:\|([^\]]*))?\] /`. Split metadata uses a second scheme in the same column.

Consequences: account balances cannot be computed in SQL; any user note beginning with `[`
corrupts the parse; no referential integrity between the embedded `accountId` and `accounts.id`
(deleting an account orphans the reference silently).

**Fix:** add `account_id uuid REFERENCES accounts(id)` and `payment_mode text` columns plus a
backfill migration; keep the parser only for historical rows.

## DB-010 · `account_balance_history` is dead — **L**

The table and its RLS exist in migration `20260701120000`, but
`src/hooks/useAccountBalanceHistory.ts` writes to `localStorage`
(`finroot.balance_history.<userId>`). Balance history is therefore per-device and lost on
browser change, while an unused table sits in the schema.

**Fix:** either wire the hook to the table (preferred — the table is already correct) or drop
the migration's table in a follow-up.

## DB-011 · `demat_accounts` has no `user_id` — **L**

Every other tenant table records which member created the row. `demat_accounts` does not, so
demat records cannot be attributed in an audit or a per-member view. Minor, but inconsistent.

## DB-012 · Generated types are 4 migrations stale — **H (process)**

`types.ts` lacks `income_streams`, `demat_accounts`, `demat_ledger`,
`account_balance_history`, and the `po_has_secret` / `po_revoke_secret` /
`po_get_identifiers` / `po_set_identifiers` RPC signatures. Consequences: 6 of the 10 current
`tsc` errors, and `useIncomeStreams` bypasses the typed client entirely via
`supabase as unknown as SupabaseClient`.

**Fix:** `supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts`
and remove the untyped handle. Add this to the deployment checklist.

---

## Checklist results

| Item | Result |
|---|---|
| Normalization | ✅ 3NF for relational parts; deliberate jsonb denormalisation for `installments`, `allocation`, `expenses`, `companions`, `fields`, `derived` |
| Indexes | ⚠️ every table has a `tenant_id` index; **no index supports the `type`/`category`/date filters the UI actually runs**, and none support keyset pagination |
| Relations / FKs | ✅ complete and correct |
| Transactions / rollback | ❌ **multi-step client flows are not transactional** — e.g. Smart Split posts a transaction then updates buckets; `PoTenants` calls `po_create_tenant` then `po_set_tenant_menus`. A failure between steps leaves partial state |
| Constraints | ✅ CHECK-based; ⚠️ DB-004 drift |
| Data duplication | ⚠️ `budgets.spent` duplicates a value derivable from `transactions`; `investments.derived` caches computed values |
| Cascade deletion | ✅ `ON DELETE CASCADE` from `tenants`; ⚠️ `po_delete_tenant` is a **hard delete** that cascades all finance data with no soft-delete or export |
| Race conditions | ⚠️ `goals.current_amount` and `budgets.spent` are read-modify-write from the client → lost updates with two concurrent members |
| Deadlocks | ✅ none likely (no multi-table transactions) |
| Slow queries / N+1 | ⚠️ `po_list_tenants` runs a correlated `count(*)` per tenant; dashboards issue 6–10 independent full-table selects |
| Missing indexes | ⚠️ see above |
| Large tables | ⚠️ `transactions`, `insurance` (base64), `subscriptions.raw jsonb` |
| Migration safety | ⚠️ Phase 2a set `tenant_id NOT NULL` **after** a backfill that only covers users with an owner membership; a user without one would have failed the migration. Acceptable at current size, unsafe at scale (no `NOT VALID` + `VALIDATE` pattern, no lock timeouts) |
| Backup strategy | ❌ **none configured** — Supabase free tier has no PITR; see [Disaster_Recovery.md](./Disaster_Recovery.md) |
| Recovery strategy | ❌ untested |
| Encryption | ✅ at rest + TLS in transit (Supabase managed); ❌ no column-level encryption for PII |
| PII | ⚠️ email, mobile, display name, bank name + last4, policy numbers, full financial history. No retention policy, no data-subject export/delete flow |
| Passwords | ✅ GoTrue bcrypt; PO secret bcrypt via pgcrypto |
| Token storage | ⚠️ session JWT in `localStorage` (XSS-readable) |
| Session storage | ✅ GoTrue managed |
| SQL injection | ✅ none — PostgREST parameterises; RPCs use typed args; no dynamic SQL anywhere |
| ORM misuse | ⚠️ `as unknown as Json` / `as unknown as SupabaseClient` casts defeat generated typing |
| Data corruption | ⚠️ DB-009 free-text encoding; jsonb blobs with no schema validation |
| Audit logs | ✅ present and wired to every privileged RPC; ❌ forgeable (DB-003) and never pruned |
| Retention policy | ❌ none for `audit_log`, `notifications`, `subscriptions.raw` |
| Data validation | ⚠️ CHECK constraints only; no length limits on `text` columns (unbounded `description`, `notes`, `document_data_url`) |
| Multi-tenancy readiness | ❌ **blocked by DB-001** |
| Scalability | ⚠️ fine to ~10k rows/tenant; needs pagination + summary tables beyond that |

---

## Priority order

| # | ID | Severity | Effort |
|---|---|---|---|
| 1 | DB-002 subscription self-upgrade | C | XS (one migration) |
| 2 | DB-001 explicit tenant_id | C | L (client + policies) |
| 3 | DB-003 revoke PUBLIC execute | H | XS |
| 4 | DB-012 regenerate types | H | XS |
| 5 | DB-004 trips.kind | H | XS |
| 6 | Backups / PITR | H | S |
| 7 | DB-005 tenant insert policy | M | XS |
| 8 | DB-006 budgets uniqueness | M | S |
| 9 | DB-008 pagination + indexes | M | M |
| 10 | DB-007 documents → Storage | M | M |
| 11 | DB-009 description columns | M | M |
| 12 | DB-010/011 cleanup | L | S |
