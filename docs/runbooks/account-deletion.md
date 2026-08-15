# Runbook — deleting an account

**Status:** the request queue (`20260811130000_stage5_account_deletion.sql`) is **written but not
applied**. Until it is, requests arrive by email from the Settings page and this runbook is followed
by hand from step 3.

**Promise made to the user:** in the [Privacy Policy](../../src/pages/legal/PrivacyPolicy.tsx) —
identity confirmed, acted on within 30 days, told when it is done. There is a 30-day recovery window
before anything is destroyed.

---

## 1. Confirm it is really them

Do not act on the email address alone. Reply to the request **from the address on the account** and
require a confirmation, or confirm inside a support session where they are already signed in. An
erasure request is the one instruction an attacker most wants to forge.

## 2. Check what they own

```sql
select m.tenant_id, t.name, m.role,
       (select count(*) from tenant_members x where x.tenant_id = m.tenant_id) as members
from tenant_members m join tenants t on t.id = m.tenant_id
where m.user_id = '<user-uuid>';
```

If they **own a workspace with other members**, stop and write back first. Deleting the owner takes
the workspace with it, and the other members lose records they may consider theirs. Offer to
transfer ownership. The Settings card warns about this, but the check is here because the warning
can be clicked past.

## 3. Wait out the grace period

30 days from the request (`retention_policy.account_deletion_grace`). Cancelling inside the window
is the user's right and costs us nothing.

## 4. Soft-delete the workspaces they own

Use the existing PO console (`/po/tenants` → Recently deleted) or:

```sql
select po_delete_tenant('<tenant-uuid>');
```

This is reversible for 30 days and is what `purge_expired_tenants()` acts on later. It also enqueues
the workspace's files into `storage_purge_queue` — Postgres cannot delete Storage objects (Stage
3.5), so the files are drained separately.

## 5. Drain the files

```sql
select * from po_pending_storage_purges();
```

Delete each `insurance-docs/<tenant_id>/` prefix **through the Storage API** (a service_role script
or the dashboard — SQL will refuse), then:

```sql
select complete_storage_purge('<queue-row-id>');
```

⚠️ **BUG-086 is still open here:** nothing drains that queue automatically yet. If you skip this
step, purged workspaces leave their uploaded documents behind, and the erasure is incomplete in a
way the user cannot see.

## 6. Delete the auth user

Dashboard → Authentication → Users → delete, or with `service_role`:

```bash
curl -X DELETE "https://<ref>.supabase.co/auth/v1/admin/users/<user-uuid>" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

This cascades to `profiles` and anything else keyed to `auth.users`.

## 7. Close the loop

```sql
select complete_account_deletion('<request-id>', 'deleted 2026-09-10, 1 workspace purged, 3 files removed');
```

Then reply to the user confirming it is done and what was removed. Their `audit_log` tombstones stay
(`tenant_id IS NULL`) — they are the record that the deletion happened, and Stage 3.6 exempts them
from pruning for that reason.

---

## What is deliberately NOT automated

A nightly job that erases accounts unattended is a single bug away from deleting the wrong one, and
this product has one operator. The queue makes the work visible and ordered; a human still presses
the last button. Revisit when volume justifies it — the shape of the queue is already right for a
cron job.
