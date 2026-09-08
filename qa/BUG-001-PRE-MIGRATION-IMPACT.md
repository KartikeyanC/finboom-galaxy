# BUG-001 — Pre-Migration Impact Analysis

**Migration under review:** `supabase/migrations/20260907190000_bug001_link_recurring_to_income_stream.sql`
**Target:** LIVE Supabase project `ludbntvhagefadfkhrjj` (shared, **no backups** — `docs/Disaster_Recovery.md`)
**Analysis date:** 2026-09-08
**Analysis type:** READ-ONLY. Nothing was applied. No `db push`, no `UPDATE`, `DELETE`, `INSERT`, `ALTER`, `DROP`, `TRUNCATE` was run against the live database.

---

## 0. Execution status of this analysis

| Check | How | Result |
|---|---|---|
| Is the migration already applied? | `GET /rest/v1/recurring_items?select=id,income_stream_id&limit=1` with the `anon` key | **NOT applied** — `400 42703 column recurring_items.income_stream_id does not exist` |
| `recurring_items` reachable read-only? | `GET /rest/v1/recurring_items?select=id&limit=1` (anon) | `200 []` — table exists, RLS returns nothing to `anon` (expected) |
| `income_streams` reachable read-only? | `GET /rest/v1/income_streams?select=id&limit=1` (anon) | `200 []` — same |

**The data-dependent sections (2, 3, 4, 5, 6) could not be computed.** This environment has:
no `SUPABASE_ACCESS_TOKEN`, no database password, no session-pooler host, no `service_role` key.
The only credential present is the `anon` publishable key, and RLS correctly hides all
`recurring_items` / `income_streams` rows from it. A cross-tenant count needs `service_role`
or a direct DB connection.

**Sections 2–6 below contain the exact read-only SQL to run** (Supabase SQL Editor, or
`psql` against the pooler, or PostgREST with a `service_role` JWT). Each query is a pure
`SELECT`. Paste the results back and this report can be finalised with real numbers. The
**static review (1, 7, 8) is complete** and is sufficient to reach the recommendation at the end.

---

## 1. Backup / snapshot review  (migration step 0)

```sql
CREATE SCHEMA IF NOT EXISTS _backup;
CREATE TABLE IF NOT EXISTS _backup.recurring_items_bug001 AS
  SELECT * FROM public.recurring_items;
```

### What it captures

| Question | Answer |
|---|---|
| What records are captured? | **Every row of `public.recurring_items`** — `SELECT *`, no `WHERE`. Not just income rows; the whole table. |
| Is every potentially-modified/deleted row captured? | **Yes.** Step 2 (`UPDATE`) and step 3 (`DELETE`) both only ever touch rows already in `public.recurring_items`, and the snapshot copies all of them *before* step 1 adds the column. Every row either statement can reach is in the snapshot. |
| Is `tenant_id` included? | **Yes** — `SELECT *` copies all columns: `id, user_id, tenant_id, type, name, category, subtype, amount, currency, fx_rate, frequency, next_due_date, last_generated_at, icon, notes, is_active, created_at, updated_at`. |
| Are all important columns included? | **Yes**, all 18. The snapshot is a faithful column-for-column copy. |
| Can the snapshot restore the original state? | **Partially — see §8.** Deleted rows: yes, by re-`INSERT` (the original `id` is preserved, so `transactions.source_recurring_id` still resolves). Updated rows: the pre-migration value of `income_stream_id` was *always* `NULL` (the column did not exist), so "restore" = set it back to `NULL` or drop the column. |
| Can the snapshot be safely removed later? | **Yes.** `_backup` is an isolated schema with no FKs, no views, no policies pointing into it. `DROP TABLE _backup.recurring_items_bug001;` (and later `DROP SCHEMA _backup;`) is clean. |

### Problems with the snapshot as written

1. **`CREATE TABLE IF NOT EXISTS … AS` is a footgun on a re-run.**
   `supabase db push` is described in the runbook as "safe to re-run". If this migration
   half-applies (e.g. a lock timeout after step 0 but before step 3) and is retried, or if a
   `_backup.recurring_items_bug001` table is left over from any earlier rehearsal, the
   `IF NOT EXISTS` turns the `CREATE … AS` into a **silent no-op**. The migration then proceeds
   to `UPDATE`/`DELETE` production rows while "the snapshot" is a stale copy from the previous
   attempt — or empty. **Fix:** timestamp the snapshot name (`recurring_items_bug001_20260908`)
   or `RAISE EXCEPTION` if the table already exists and is non-empty.

2. **No row-count assertion.** The migration never checks `count(_backup) = count(public.recurring_items)`
   after the copy. A snapshot that silently captured 0 rows (see #1) would not be noticed until
   a restore is attempted.

3. **The snapshot is unprotected cross-tenant financial data.** `_backup.recurring_items_bug001`
   has no RLS and inherits default schema privileges. PostgREST only exposes `public` (plus
   explicitly-configured schemas), so it is **not API-reachable** — but Stage 1b hardening exists
   precisely because grants have leaked to `anon`/`authenticated` before. Confirm with:
   ```sql
   SELECT grantee, privilege_type
     FROM information_schema.role_table_grants
    WHERE table_schema = '_backup' AND grantee IN ('anon','authenticated');
   -- expect 0 rows
   ```
   And drop the snapshot promptly once verification passes — it should not become a permanent
   unencrypted copy of every workspace's income schedule.

4. **Snapshot and DML are only coupled if run as one transaction.** Applied via `supabase db push`
   the whole file runs in one transaction, so this is fine. If any statement is ever run by hand
   in isolation, rows can change between the snapshot and the DML. Keep it a single migration.

**Verdict on step 0:** the *shape* is right (full copy, all columns, all tenants, before the DML),
but the `IF NOT EXISTS` re-run hazard and the missing count assertion must be fixed before this
is a snapshot you can rely on.

---

## 2. Backfill impact  (migration step 2)  — SQL TO RUN

> `UPDATE recurring_items SET income_stream_id = (the same-tenant stream with equal name AND amount,
> tie-broken by `display_order, id`) WHERE type='income' AND income_stream_id IS NULL`.
> The column does not exist yet, so run these against the CURRENT schema — substitute
> `income_stream_id IS NULL` with `TRUE` (every income row is currently "unlinked").

```sql
-- 2.1  Totals
SELECT
  count(*) FILTER (WHERE type='income')                              AS total_recurring_income,
  0                                                                  AS already_linked,   -- column doesn't exist pre-migration
  count(*) FILTER (WHERE type='income')                              AS currently_unlinked
FROM public.recurring_items;

-- 2.2  How many would step 2 link, and to what (name + amount, same tenant)
WITH candidate AS (
  SELECT ri.id            AS recurring_id,
         ri.tenant_id,
         ri.name          AS recurring_name,
         ri.amount        AS recurring_amount,
         ri.created_at    AS recurring_created_at,
         (
           SELECT s.id FROM public.income_streams s
            WHERE s.tenant_id = ri.tenant_id
              AND s.name      = ri.name
              AND s.amount    = ri.amount
            ORDER BY s.display_order, s.id
            LIMIT 1
         ) AS stream_id
    FROM public.recurring_items ri
   WHERE ri.type = 'income'
)
SELECT
  count(*) FILTER (WHERE stream_id IS NOT NULL) AS would_be_linked,
  count(*) FILTER (WHERE stream_id IS NULL)     AS would_stay_unlinked
FROM candidate;

-- 2.3  The full per-row backfill list (the detail the task asks for)
WITH candidate AS (
  SELECT ri.id AS recurring_id, ri.tenant_id, ri.name AS recurring_name,
         ri.amount AS recurring_amount, ri.created_at AS recurring_created_at,
         (
           SELECT s.id FROM public.income_streams s
            WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name AND s.amount = ri.amount
            ORDER BY s.display_order, s.id LIMIT 1
         ) AS stream_id
    FROM public.recurring_items ri
   WHERE ri.type = 'income'
)
SELECT c.tenant_id,
       c.recurring_id,
       c.recurring_name,
       c.recurring_amount,
       c.recurring_created_at,
       s.id            AS matched_stream_id,
       s.name          AS matched_stream_name,
       s.amount        AS matched_stream_amount,
       s.created_at    AS matched_stream_created_at,
       abs(extract(epoch FROM (c.recurring_created_at - s.created_at))) AS created_seconds_apart
  FROM candidate c
  JOIN public.income_streams s ON s.id = c.stream_id
 ORDER BY c.tenant_id, c.recurring_name;
```

**`created_seconds_apart` is the key diagnostic column.** A genuine AddIncomeDialog twin is
created in the same user action as its stream, so the two `created_at` values are within a few
seconds. A large gap (hours/days) means the name+amount match is a **coincidence** between a
manually-created recurring income and an unrelated stream — a false link that will later
cascade-delete a deliberate reminder.

| Result to fill in | Value |
|---|---|
| TOTAL recurring income items | _AWAITING EXECUTION_ |
| TOTAL already linked | 0 (column absent pre-migration) |
| TOTAL unlinked | _AWAITING EXECUTION_ |
| TOTAL that would be linked (same tenant + name + amount) | _AWAITING EXECUTION_ |
| …of those, linked with `created_at` > 60s apart (suspect) | _AWAITING EXECUTION_ |

---

## 3. Duplicate / ambiguous-match analysis  — SQL TO RUN

```sql
-- 3.1  One stream matched by MANY recurring income rows
--      (stream deletion would cascade-delete several reminders)
SELECT s.tenant_id, s.id AS stream_id, s.name, s.amount,
       count(ri.id) AS matching_recurring_rows,
       array_agg(ri.id) AS recurring_ids
  FROM public.income_streams s
  JOIN public.recurring_items ri
    ON ri.tenant_id = s.tenant_id AND ri.name = s.name AND ri.amount = s.amount
   AND ri.type = 'income'
 GROUP BY s.tenant_id, s.id, s.name, s.amount
HAVING count(ri.id) > 1
 ORDER BY matching_recurring_rows DESC;

-- 3.2  One recurring income row matched by MANY streams
--      (the migration's `ORDER BY display_order, id LIMIT 1` silently picks one;
--       deleting a DIFFERENT matching stream would NOT clean the reminder)
SELECT ri.tenant_id, ri.id AS recurring_id, ri.name, ri.amount,
       count(s.id) AS matching_streams,
       array_agg(s.id ORDER BY s.display_order, s.id) AS stream_ids,
       (array_agg(s.id ORDER BY s.display_order, s.id))[1] AS stream_the_migration_picks
  FROM public.recurring_items ri
  JOIN public.income_streams s
    ON s.tenant_id = ri.tenant_id AND s.name = ri.name AND s.amount = ri.amount
 WHERE ri.type = 'income'
 GROUP BY ri.tenant_id, ri.id, ri.name, ri.amount
HAVING count(s.id) > 1
 ORDER BY matching_streams DESC;
```

**Why these are high-risk:**

- **3.1 (many recurring → one stream):** legitimate if a user added the same income twice (the
  UI allows it), but if any of those recurring rows are actually *manual* entries that merely
  share the name+amount, they all get linked to that one stream and all vanish when it is
  deleted. The user deleted one income source and lost several reminders.
- **3.2 (one recurring → many streams):** the backfill's `LIMIT 1` tie-break is arbitrary from
  the user's point of view. The reminder is linked to stream A; the user later deletes the
  duplicate stream B (identical name+amount) expecting *that* to clear the reminder — it doesn't,
  because the CASCADE only fires for stream A. The BUG-001 symptom is only *partly* fixed for
  these tenants. The migration comment acknowledges this ("a wrong guess here only affects which
  stream's deletion cascades the reminder") and deems it acceptable; that judgement should be
  re-confirmed against the actual count.

| Result to fill in | Value |
|---|---|
| Streams matched by >1 recurring income row | _AWAITING EXECUTION_ |
| Recurring income rows matched by >1 stream | _AWAITING EXECUTION_ |

---

## 4. Manual-record risk  — SQL TO RUN

A `recurring_items` row with `type='income'` was created by one of exactly two code paths:

| Path | File | Creates a stream twin? | Creates a `recurring_reminders` row? |
|---|---|---|---|
| "Add Income" dialog | `src/components/income/AddIncomeDialog.tsx` | **Yes** — `income_streams` row with identical `name` + `amount` (neither is FX-converted; both store the raw entered value) | No |
| "Add Recurring Income" dialog | `src/components/recurring/RecurringDialog.tsx` (`type="income"`) | **No** | Yes, *if* the user toggled the reminder on |

So a row that is **manual** (RecurringDialog) rather than a **twin** (AddIncomeDialog) is
identifiable by *negative* evidence of the twin pattern:

```sql
-- 4.1  Recurring income rows that look MANUAL, not stream-generated
SELECT ri.tenant_id, ri.id, ri.name, ri.amount, ri.category, ri.subtype,
       ri.frequency, ri.created_at, ri.last_generated_at,
       EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id = ri.id) AS has_reminder,
       EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id = ri.id)        AS has_generated_txn,
       EXISTS (SELECT 1 FROM public.income_streams s
                WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name)                         AS name_matches_a_stream,
       EXISTS (SELECT 1 FROM public.income_streams s
                WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name AND s.amount = ri.amount) AS name_amount_matches_a_stream,
       (SELECT min(abs(extract(epoch FROM (ri.created_at - s.created_at))))
          FROM public.income_streams s
         WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name AND s.amount = ri.amount)       AS closest_stream_created_secs
  FROM public.recurring_items ri
 WHERE ri.type = 'income'
 ORDER BY ri.tenant_id, ri.created_at;
```

**Read the output like this:**

- `has_reminder = true` **or** `has_generated_txn = true` → the user has actively engaged with
  this reminder. Treat as a **deliberate record**. Must not be hard-deleted.
- `name_amount_matches_a_stream = false` **and** `name_matches_a_stream = false` → step 3 of the
  migration **will delete this row**. If it is also `has_reminder`/`has_generated_txn`, that is a
  data-loss defect.
- `closest_stream_created_secs` small (< ~10s) → almost certainly a real twin.
  `NULL` or large → not a twin; a name/amount coincidence at best.

| Result to fill in | Value |
|---|---|
| Recurring income rows with no matching stream name (step-3 delete candidates) | _AWAITING EXECUTION_ |
| …of those, with a `recurring_reminders` row | _AWAITING EXECUTION_ |
| …of those, with a generated transaction (`source_recurring_id`) | _AWAITING EXECUTION_ |
| Rows linked by step 2 whose closest stream is > 60s apart in `created_at` | _AWAITING EXECUTION_ |

---

## 5. Delete impact  (migration step 3)  — SQL TO RUN

> Step 3: `DELETE FROM recurring_items WHERE type='income' AND income_stream_id IS NULL
> AND NOT EXISTS (stream in same tenant with the same name)`.
> Pre-migration, `income_stream_id IS NULL` is true for every row, so the predicate reduces to
> **"type='income' and no stream in this tenant shares the name"**.

```sql
-- 5.1  EXACTLY the rows step 3 would delete
SELECT ri.id            AS recurring_item_id,
       ri.tenant_id,
       ri.name,
       ri.amount,
       ri.type,
       ri.frequency,
       ri.is_active,
       ri.created_at,
       ri.last_generated_at,
       EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id = ri.id) AS has_reminder,
       EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id = ri.id)        AS has_generated_txn,
       'type=income; no income_streams row in tenant shares this name'                          AS delete_reason
  FROM public.recurring_items ri
 WHERE ri.type = 'income'
   AND NOT EXISTS (
     SELECT 1 FROM public.income_streams s
      WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name
   )
 ORDER BY ri.tenant_id, ri.created_at;

-- 5.2  Count + per-tenant split of the delete set
SELECT ri.tenant_id, count(*) AS rows_step3_deletes,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id = ri.id)
                            OR EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id = ri.id)) AS of_which_engaged
  FROM public.recurring_items ri
 WHERE ri.type = 'income'
   AND NOT EXISTS (SELECT 1 FROM public.income_streams s
                    WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name)
 GROUP BY ri.tenant_id
 ORDER BY rows_step3_deletes DESC;
```

**DO NOT DELETE THESE ROWS. This is read-only analysis.**

| Result to fill in | Value |
|---|---|
| TOTAL rows step 3 deletes | _AWAITING EXECUTION_ |
| …of which have a reminder or a generated transaction (engaged → data loss) | _AWAITING EXECUTION_ |
| Tenants with ≥1 step-3 deletion | _AWAITING EXECUTION_ |

---

## 6. Tenant analysis  — SQL TO RUN

```sql
-- 6.1  Per-tenant summary. No names, no amounts — counts only.
WITH inc AS (
  SELECT ri.*,
         EXISTS (SELECT 1 FROM public.income_streams s
                  WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name AND s.amount = ri.amount) AS nm_amt_match,
         EXISTS (SELECT 1 FROM public.income_streams s
                  WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name)                          AS nm_match
    FROM public.recurring_items ri
   WHERE ri.type = 'income'
)
SELECT tenant_id,
       count(*)                                              AS recurring_income_total,
       count(*) FILTER (WHERE nm_amt_match)                  AS would_link_step2,
       count(*) FILTER (WHERE NOT nm_match)                  AS would_delete_step3,
       count(*) FILTER (WHERE nm_match AND NOT nm_amt_match) AS name_only_match_unchanged,
       count(*) FILTER (WHERE nm_amt_match) 
         - count(*) FILTER (WHERE NOT nm_match)              AS net_change_estimate
  FROM inc
 GROUP BY tenant_id
 ORDER BY recurring_income_total DESC;

-- 6.2  Context: how many tenants exist, how many have income streams at all
SELECT
  (SELECT count(*) FROM public.tenants)                                              AS tenants_total,
  (SELECT count(DISTINCT tenant_id) FROM public.income_streams)                      AS tenants_with_streams,
  (SELECT count(DISTINCT tenant_id) FROM public.recurring_items WHERE type='income') AS tenants_with_recurring_income;
```

| Tenant (opaque id) | Recurring income total | Would link | Would delete | Unchanged |
|---|---|---|---|---|
| _AWAITING EXECUTION_ | | | | |

*(Report counts only. Do not paste `name`, `amount`, `notes`, or any figure that identifies a
person's income.)*

---

## 7. Migration safety review — is `name + amount` reliable?

**No. Not on its own, and step 3 is worse — it matches on `name` alone.**

### 7a. Is there any existing relationship metadata to use instead?

**No.** This was checked exhaustively against the schema:

- `recurring_items` today: `id, user_id, tenant_id, type, name, category, subtype, amount,
  currency, fx_rate, frequency, next_due_date, last_generated_at, icon, notes, is_active,
  created_at, updated_at`. **No column references `income_streams`.**
- `income_streams`: `id, tenant_id, user_id, name, type, icon, amount, currency,
  exchange_rate_to_inr, is_visible, display_order, frequency, notes, created_at, updated_at`.
  **No column references `recurring_items`.**
- The only nearby FK is `recurring_reminders.recurring_item_id → recurring_items.id`
  (`ON DELETE CASCADE`), and `transactions.source_recurring_id` (an *un*-constrained uuid column,
  no FK).
- `AddIncomeDialog` fires the two inserts independently and keeps no correlation id. `useIncomeStreams.add()`
  does not even return the new stream id today.

So a *fully reliable* automatic backfill is **impossible** — the information to do it perfectly
was never recorded. The question is how to be *safe* given that.

### 7b. Why `name + amount` is unsafe

| # | Failure | Consequence | Reversible? |
|---|---|---|---|
| 1 | A **manual** recurring income (RecurringDialog) shares `name`+`amount` with an unrelated stream | Step 2 links it; later deleting that stream **cascade-deletes the manual reminder** | No (silent CASCADE, months later) |
| 2 | A **manual** recurring income shares its `name` with no stream | **Step 3 hard-deletes it** — the migration comment's claim that these "never had a matching stream name" is exactly why they fall into the delete set | No (row gone; snapshot needed) |
| 3 | Two streams, identical `name`+`amount` | Backfill's `LIMIT 1` links the reminder to one; deleting the other doesn't clear it | Partial fix only |
| 4 | User renamed or re-amounted the stream after the twin was created | Twin no longer matches → step 3 deletes a reminder for a **live** income source | No |
| 5 | Stream stored `5000.00`, twin stored `5000` | Equal in Postgres `numeric` — fine. But `fx` differs: `income_streams.amount` and `recurring_items.amount` both hold the **raw entered value** (verified in both dialogs), so this specific mismatch does *not* occur. Good. |

Failure **#2** is the migration's central defect. Step 3 as written will delete every
`type='income'` recurring row whose name matches no current stream — and deliberate
Recurring-Income-tab entries are, by construction, the rows most likely to have no matching
stream name.

### 7c. Safer strategy (recommended, in priority order)

1. **Make step 2 conservative — add a temporal + identity guard.**
   Only backfill where the recurring row and the stream were created in the same user action:
   ```sql
   AND abs(extract(epoch FROM (ri.created_at - s.created_at))) < 10   -- seconds
   AND ri.user_id = s.user_id
   ```
   A real twin passes this trivially; a name/amount coincidence almost never does.

2. **Change step 3 from `DELETE` to a reversible soft-delete.**
   ```sql
   UPDATE public.recurring_items
      SET is_active = false
    WHERE type = 'income'
      AND income_stream_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.income_streams s
                       WHERE s.tenant_id = recurring_items.tenant_id
                         AND s.name = recurring_items.name);
   ```
   `ActionableReminders` filters on `is_active`, so the dashboard outcome is identical — the
   nagging reminder disappears — but the row survives and a mistake is one `UPDATE` away from
   undone. The migration file *already documents this as the fallback*; it should be the
   **default**.

3. **Exclude engaged rows from step 3 entirely**, regardless of name match:
   ```sql
   AND NOT EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id = recurring_items.id)
   AND NOT EXISTS (SELECT 1 FROM public.transactions t         WHERE t.source_recurring_id = recurring_items.id)
   AND last_generated_at IS NULL
   ```
   A row the user has set a reminder on, or has clicked "Mark received" on, is not debris.

4. **Manual review of the pre-flight SELECT (§5.1) before applying anything destructive** —
   which, with soft-delete in place, is no longer strictly required but is still cheap insurance
   on a database with no backups.

5. **Keep the CASCADE FK (step 1) — it is correct and it fixes BUG-001 going forward.**
   The disagreement is only about how aggressively to reconcile *history*. The forward fix
   (`income_stream_id` + `ON DELETE CASCADE`, populated at insert time by a patched
   `AddIncomeDialog`) is sound and should ship.

---

## 8. Rollback review

### Can the snapshot restore what the migration changes?

| Change | Restorable from `_backup.recurring_items_bug001`? | How |
|---|---|---|
| **Step 1** — `ADD COLUMN income_stream_id` + index | N/A (additive) | `ALTER TABLE public.recurring_items DROP COLUMN income_stream_id;` |
| **Step 2** — `UPDATE … SET income_stream_id` | **Yes, trivially** | The pre-migration value was universally `NULL`. `UPDATE public.recurring_items SET income_stream_id = NULL;` fully reverses it. No snapshot even needed. |
| **Step 3** — `DELETE` | **Yes, but with caveats** | `INSERT INTO public.recurring_items SELECT * FROM _backup.recurring_items_bug001 b WHERE NOT EXISTS (SELECT 1 FROM public.recurring_items r WHERE r.id = b.id);` — the original `id` is preserved, so `transactions.source_recurring_id`, `recurring_reminders.recurring_item_id` still resolve. |

### Caveats on restoring the deleted rows

1. **No down-script is provided.** The migration has no rollback section; the restore above must
   be written and run by hand under incident pressure. **Add an explicit rollback block** (as a
   comment) to the migration.

2. **Time-sensitivity.** If step 3 runs, the mistake is noticed a week later, and in that week
   users have re-created or edited recurring items, a blind re-`INSERT` from the snapshot can
   resurrect rows the user already replaced (now duplicated) or collide on `id` (the guard above
   handles the collision but not the semantic duplicate). The snapshot is a *point-in-time* copy;
   its usefulness decays.

3. **`recurring_reminders` children are already gone.** If a deleted `recurring_items` row had a
   `recurring_reminders` row, that child was cascade-deleted by the FK and is **not** in this
   snapshot (only `recurring_items` was copied). Restoring the parent does not restore the
   reminder setting. **If step 3 stays a `DELETE`, the snapshot must also copy
   `recurring_reminders`** (or at least the subset referencing income rows).

4. **The FK direction is safe for rollback.** `income_stream_id` points *out* to `income_streams`;
   dropping the column or nulling it cannot orphan anything.

### What additional protection is required

- **Preferred:** soft-delete instead of hard `DELETE` (§7c.2) — then §8 caveats 1–3 disappear.
- **If hard delete is kept:**
  - snapshot `recurring_reminders` too;
  - fix the `CREATE TABLE IF NOT EXISTS … AS` re-run hazard (§1.1);
  - add the row-count assertion (§1.2);
  - write the rollback script into the migration;
  - apply within a maintenance window so "users edited data in between" cannot happen before a
    rollback decision;
  - ideally, upgrade the project to Pro and enable PITR first (`Disaster_Recovery.md` §3.1,
    P0-this-week and still open) so the snapshot is not the *only* net.

---

## 9. Final report

> Numbers marked _PENDING_ require the §2–§6 SQL to be run with `service_role` / DB access.
> The risk level and recommendation are derived from the **static review**, which is complete.

| Metric | Value |
|---|---|
| **TOTAL AFFECTED** (recurring income rows in scope) | _PENDING_ — `SELECT count(*) FROM recurring_items WHERE type='income'` |
| **TOTAL TO UPDATE** (step 2 backfill) | _PENDING_ — §2.2 `would_be_linked` |
| **TOTAL TO DELETE** (step 3) | _PENDING_ — §5.2; **this is the number that gates the apply decision** |
| **AMBIGUOUS MATCHES** (one row ↔ many streams, or many rows ↔ one stream) | _PENDING_ — §3.1 + §3.2 |
| **POTENTIAL MANUAL RECORDS** (RecurringDialog entries at risk from step 2 mis-link or step 3 delete) | _PENDING_ — §4.1 rows with `has_reminder` / `has_generated_txn` / large `closest_stream_created_secs` |
| **TENANTS AFFECTED** | _PENDING_ — §6.1 rows where `would_link_step2 > 0` or `would_delete_step3 > 0` |

### RISK LEVEL: **HIGH**

Rationale:
- Target is the **live shared database with no backups and no PITR**.
- Step 3 is an **irreversible hard `DELETE`** whose predicate (`type='income'` + no stream shares
  the name) **does not distinguish a pre-fix orphan from a deliberate manual recurring income**.
  The migration's own comment justifying this is logically backwards.
- Step 2's `name + amount` match can create false links that **cascade-delete a deliberate
  reminder months later, silently**.
- The step-0 snapshot has a **re-run footgun** (`CREATE TABLE IF NOT EXISTS … AS` → silent
  no-op) and does **not** cover `recurring_reminders`, so a rollback after step 3 cannot fully
  restore state.
- The FK + CASCADE design itself (step 1) is **correct** and low-risk.

Effective risk drops to **LOW** *if* the §5 pre-flight SELECT shows step 3 deletes **zero rows**,
or only rows that are provably orphans (`is_active=false` already, no reminder, no generated
transaction, name is an obvious former-stream name). It rises to **CRITICAL** if applied with no
pre-flight review.

### RECOMMENDATION: **REQUIRES MIGRATION CHANGES** *and* **REQUIRES MANUAL REVIEW**

Do **not** apply as written. Before this migration is applied:

1. **Run §2–§6 read-only SQL** and review the output — especially §5.1 (exact delete set) and
   §4.1 (manual-record signals). Attach the results to this report.
2. **Change step 3 `DELETE` → `UPDATE … SET is_active = false`** (reversible, identical dashboard
   outcome). Keep the hard `DELETE` only for rows that are *already* `is_active = false` with no
   reminder and no generated transaction, if at all.
3. **Add a temporal guard to step 2**: `abs(created_at difference) < 10s AND ri.user_id = s.user_id`.
4. **Fix the snapshot**: timestamp the table name (kill the `IF NOT EXISTS … AS` no-op), add a
   `count(*)` assertion, and — if any hard `DELETE` survives — snapshot `recurring_reminders` too.
5. **Add an explicit rollback block** (commented SQL) to the migration.
6. **Apply in a maintenance window**, ideally after PITR is enabled on the project.
7. Keep step 1 (the FK + `ON DELETE CASCADE` + index) — it is the correct forward fix. Follow it
   with the planned `AddIncomeDialog` / `useIncomeStreams.add()` change to set `income_stream_id`
   at insert time, then drop the interim name+amount delete in `useIncomeStreams.remove()`.

### ABSOLUTE RULE HONOURED

This analysis ran **no** `db push`, `UPDATE`, `DELETE`, `INSERT`, `ALTER`, `DROP`, or `TRUNCATE`
against the live database. The only live calls were three `anon`-key `GET`s that returned `[]` or
a schema `400`. Nothing was applied. Work stopped at this report.
