-- ===========================================================================
-- BUG-001 pre-migration impact — READ-ONLY query pack
--
-- Run in the Supabase SQL Editor for project ludbntvhagefadfkhrjj, or via psql
-- against the session pooler. EVERY statement here is a plain SELECT. Do not run
-- the migration. Do not run any UPDATE/DELETE/INSERT/ALTER/DROP.
--
-- Paste the results back into qa/BUG-001-PRE-MIGRATION-IMPACT.md (§2-§6, §9).
-- Report COUNTS ONLY where a section says so — no names, amounts or notes.
-- ===========================================================================

\echo '=== 0. schema state ==='
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='recurring_items'
     AND column_name='income_stream_id'
) AS income_stream_id_column_exists;   -- expect FALSE (migration unapplied)

\echo '=== 2.1 totals ==='
SELECT
  count(*) FILTER (WHERE type='income') AS total_recurring_income,
  count(*) FILTER (WHERE type='income') AS currently_unlinked   -- column absent => all unlinked
FROM public.recurring_items;

\echo '=== 2.2 backfill counts ==='
WITH candidate AS (
  SELECT ri.id,
         (SELECT s.id FROM public.income_streams s
           WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount
           ORDER BY s.display_order, s.id LIMIT 1) AS stream_id
    FROM public.recurring_items ri
   WHERE ri.type='income'
)
SELECT count(*) FILTER (WHERE stream_id IS NOT NULL) AS would_be_linked,
       count(*) FILTER (WHERE stream_id IS NULL)     AS would_stay_unlinked
FROM candidate;

\echo '=== 2.3 backfill detail (per row) ==='
WITH candidate AS (
  SELECT ri.id AS recurring_id, ri.tenant_id, ri.name AS recurring_name,
         ri.amount AS recurring_amount, ri.created_at AS recurring_created_at,
         (SELECT s.id FROM public.income_streams s
           WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount
           ORDER BY s.display_order, s.id LIMIT 1) AS stream_id
    FROM public.recurring_items ri
   WHERE ri.type='income'
)
SELECT c.tenant_id, c.recurring_id, c.recurring_name, c.recurring_amount,
       c.recurring_created_at,
       s.id AS matched_stream_id, s.name AS matched_stream_name,
       s.amount AS matched_stream_amount, s.created_at AS matched_stream_created_at,
       abs(extract(epoch FROM (c.recurring_created_at - s.created_at))) AS created_seconds_apart
  FROM candidate c
  JOIN public.income_streams s ON s.id = c.stream_id
 ORDER BY c.tenant_id, c.recurring_name;

\echo '=== 3.1 one stream <- many recurring rows ==='
SELECT s.tenant_id, s.id AS stream_id, s.name, s.amount,
       count(ri.id) AS matching_recurring_rows, array_agg(ri.id) AS recurring_ids
  FROM public.income_streams s
  JOIN public.recurring_items ri
    ON ri.tenant_id=s.tenant_id AND ri.name=s.name AND ri.amount=s.amount AND ri.type='income'
 GROUP BY s.tenant_id, s.id, s.name, s.amount
HAVING count(ri.id) > 1
 ORDER BY matching_recurring_rows DESC;

\echo '=== 3.2 one recurring row <- many streams ==='
SELECT ri.tenant_id, ri.id AS recurring_id, ri.name, ri.amount,
       count(s.id) AS matching_streams,
       (array_agg(s.id ORDER BY s.display_order, s.id))[1] AS stream_the_migration_picks
  FROM public.recurring_items ri
  JOIN public.income_streams s
    ON s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount
 WHERE ri.type='income'
 GROUP BY ri.tenant_id, ri.id, ri.name, ri.amount
HAVING count(s.id) > 1
 ORDER BY matching_streams DESC;

\echo '=== 4.1 manual-record signals ==='
SELECT ri.tenant_id, ri.id, ri.name, ri.amount, ri.category, ri.subtype,
       ri.frequency, ri.created_at, ri.last_generated_at, ri.is_active,
       EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id) AS has_reminder,
       EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id=ri.id)        AS has_generated_txn,
       EXISTS (SELECT 1 FROM public.income_streams s WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name)                       AS name_matches_a_stream,
       EXISTS (SELECT 1 FROM public.income_streams s WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount) AS name_amount_matches_a_stream,
       (SELECT min(abs(extract(epoch FROM (ri.created_at - s.created_at))))
          FROM public.income_streams s
         WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount) AS closest_stream_created_secs
  FROM public.recurring_items ri
 WHERE ri.type='income'
 ORDER BY ri.tenant_id, ri.created_at;

\echo '=== 5.1 EXACT step-3 delete set (DO NOT DELETE) ==='
SELECT ri.id AS recurring_item_id, ri.tenant_id, ri.name, ri.amount, ri.type,
       ri.frequency, ri.is_active, ri.created_at, ri.last_generated_at,
       EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id) AS has_reminder,
       EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id=ri.id)        AS has_generated_txn,
       'type=income; no income_streams row in tenant shares this name' AS delete_reason
  FROM public.recurring_items ri
 WHERE ri.type='income'
   AND NOT EXISTS (SELECT 1 FROM public.income_streams s
                    WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name)
 ORDER BY ri.tenant_id, ri.created_at;

\echo '=== 5.2 step-3 delete count per tenant ==='
SELECT ri.tenant_id, count(*) AS rows_step3_deletes,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id)
                            OR EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id=ri.id)) AS of_which_engaged
  FROM public.recurring_items ri
 WHERE ri.type='income'
   AND NOT EXISTS (SELECT 1 FROM public.income_streams s
                    WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name)
 GROUP BY ri.tenant_id
 ORDER BY rows_step3_deletes DESC;

\echo '=== 6.1 per-tenant summary (counts only) ==='
WITH inc AS (
  SELECT ri.tenant_id, ri.id,
         EXISTS (SELECT 1 FROM public.income_streams s WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount) AS nm_amt_match,
         EXISTS (SELECT 1 FROM public.income_streams s WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name)                        AS nm_match
    FROM public.recurring_items ri
   WHERE ri.type='income'
)
SELECT tenant_id,
       count(*)                                              AS recurring_income_total,
       count(*) FILTER (WHERE nm_amt_match)                  AS would_link_step2,
       count(*) FILTER (WHERE NOT nm_match)                  AS would_delete_step3,
       count(*) FILTER (WHERE nm_match AND NOT nm_amt_match) AS name_only_match_unchanged
  FROM inc
 GROUP BY tenant_id
 ORDER BY recurring_income_total DESC;

\echo '=== 6.2 context ==='
SELECT
  (SELECT count(*) FROM public.tenants)                                              AS tenants_total,
  (SELECT count(DISTINCT tenant_id) FROM public.income_streams)                      AS tenants_with_streams,
  (SELECT count(DISTINCT tenant_id) FROM public.recurring_items WHERE type='income') AS tenants_with_recurring_income;

\echo '=== 1.x snapshot-schema grant check (run AFTER the migration, if applied) ==='
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema='_backup' AND grantee IN ('anon','authenticated');   -- expect 0 rows
