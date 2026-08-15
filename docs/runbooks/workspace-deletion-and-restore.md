# Runbook — deleting, restoring and purging a workspace

Deleting a workspace takes its transactions, budgets, goals, investments, insurance policies, trips
and members with it. It is therefore **soft** for 30 days, and the restore path is a supported
operation rather than a favour.

For an individual asking to have their *account* erased, start at
[account-deletion.md](account-deletion.md) — this runbook is the workspace half of it.

---

## What happens, in order

```
po_delete_tenant()   →  status = 'deleted', deleted_at = now()
                        the workspace disappears from its members' switcher immediately
   ↓ 30 days (retention_policy.deleted_tenants)
purge_expired_tenants()  →  the rows are gone, and the audit tombstone is not
```

The audit log survives the workspace it describes: `audit_log` rows for a purged tenant keep a null
`tenant_id` rather than cascading away. An audit trail that disappears with the thing it was
auditing is not an audit trail.

## 1. Delete

Preferred: `/po/tenants` → the trash icon on the workspace. It asks for confirmation and says the
30 days out loud.

```sql
select po_delete_tenant('<tenant-uuid>');   -- platform admin only, audited
```

⚠️ The console uses `window.confirm`, which an automation browser dismisses silently. If you are
driving it from a script, call the RPC.

## 2. Restore, inside the window

`/po/tenants` → **Recently deleted** → Restore, or:

```sql
select po_restore_tenant('<tenant-uuid>');
select * from po_list_deleted_tenants();    -- id, name, deleted_at, purge_after, days_left
```

Members get access back exactly as it was. Nothing was destroyed, so there is nothing to rebuild.

## 3. Purge, deliberately or on schedule

```sql
select po_purge_tenant('<tenant-uuid>');    -- now, irreversible
select purge_expired_tenants();             -- everything past its 30 days
```

`purge_expired_tenants()` is scheduled with `pg_cron`. Running it by hand is safe — it only touches
workspaces whose window has already closed.

## 4. 🔴 Drain the documents — a separate, deliberate step

**A purge does not remove uploaded files.** Insurance documents live in Storage, and SQL cannot
delete a storage object at all (`storage.protect_delete`). The purge enqueues them instead:

```sql
select * from po_pending_storage_purges();  -- what is waiting, and where
```

Every row there is a set of documents belonging to a workspace that no longer exists. **Telling
somebody their data is gone while their insurance PDFs are still in a bucket is a false statement
made to a person exercising a legal right**, so this step is not optional — it is the step that
makes the deletion true.

`scripts/storage-purge.mjs` does it (BUG-086). It needs the **service role** key, which must never
be a `VITE_` variable and must never be committed — see
[rotate-credentials.md](./rotate-credentials.md).

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service-role-key> npm run drain:storage
```

That is a **dry run**: it lists every object it would delete and deletes nothing. Read the list,
then repeat with `--apply`:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run drain:storage -- --apply
```

The script refuses any queue row whose `path_prefix` is not exactly `<tenant-uuid>/`, and refuses
to delete a listed object that falls outside that prefix — both fail closed, because the alternative
is deleting a live workspace's documents. It re-lists after deleting and only then calls
`complete_storage_purge()`; a failure is written to the row's `last_error` instead of being marked
complete, so the next run starts informed rather than blind.

If you do the deletion by hand instead, close the entry yourself:

```sql
select complete_storage_purge('<queue-id>');
```

## 5. Check afterwards

```sql
select id, name, status, deleted_at from tenants where id = '<tenant-uuid>';
select count(*) from transactions where tenant_id = '<tenant-uuid>';   -- 0 after a purge
select count(*) from audit_log  where tenant_id is null;               -- tombstones survive
select * from po_pending_storage_purges();                             -- empty when truly done
```

## Related

- Retention windows live in the `retention_policy` table, not in code, so they can be changed
  without a deploy — and so the privacy policy can quote them accurately.
- Re-requesting a deletion must **not** restart the 30-day clock; that is written into the
  (not yet applied) account-deletion migration.
