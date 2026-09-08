-- ===========================================================================
-- BUG-001 v2 — pre-apply impact queries.  READ-ONLY.
--
-- Run in the Supabase SQL Editor for ludbntvhagefadfkhrjj, or psql via the
-- session pooler. EVERY statement is a plain SELECT. Do NOT run the migration.
-- Do NOT run any UPDATE / DELETE / INSERT / ALTER / DROP / TRUNCATE.
--
-- These queries reproduce, against the CURRENT (pre-migration) schema, exactly
-- what 20260908120000_bug001_link_recurring_to_income_stream_v2.sql would do:
--   Q1  confident twins  -> STEP 3/4 would LINK these (and only these)
--   Q2  ambiguous        -> left untouched, needs a human decision
--   Q3  unmatched        -> left untouched, needs a human decision
--   Q4  manual-record signals for Q2/Q3 rows
--   Q5  per-tenant summary (counts only)
--   Q6  totals + context
--   Q7  recurring_reminders exposure
--
-- Report COUNTS where a section says so. Do not paste name / amount / notes.
-- ===========================================================================

\echo '=== Q0  schema state (expect income_stream_id_exists = f) ==='
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='recurring_items'
     AND column_name='income_stream_id'
) AS income_stream_id_exists;

\echo '=== Q1  CONFIDENT twins — STEP 3/4 would set income_stream_id on exactly these rows ==='
-- HUMAN-REVIEW TABLE. One row per (recurring_item -> income_stream) link the
-- migration would make. The reviewer question for each row is:
--   "Is this DEFINITELY the same logical income stream?"
-- If any row is questionable, it must be re-classified as AMBIGUOUS and the
-- migration's 180 s / fingerprint gate tightened so it is NOT linked.
-- Under-linking is preferable to incorrect linking.
WITH pair AS (
  SELECT ri.id          AS recurring_item_id,
         s.id           AS income_stream_id,
         ri.tenant_id,
         ri.user_id     AS recurring_user_id,
         s.user_id      AS stream_user_id,
         ri.name,
         ri.amount      AS recurring_amount,
         s.amount       AS stream_amount,
         ri.currency,
         ri.frequency,
         ri.icon,
         ri.subtype     AS active_passive,
         ri.created_at  AS recurring_created_at,
         s.created_at   AS stream_created_at,
         round(abs(extract(epoch FROM (ri.created_at - s.created_at)))::numeric, 1) AS seconds_apart,
         ri.is_active   AS recurring_is_active,
         ri.last_generated_at,
         EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id = ri.id) AS has_reminders,
         EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id = ri.id)        AS has_generated_txn,
         (SELECT count(*) FROM public.income_streams s2
           WHERE s2.tenant_id = ri.tenant_id AND s2.name = ri.name)  AS other_streams_same_name
    FROM public.recurring_items ri
    JOIN public.income_streams s
      ON  s.tenant_id = ri.tenant_id
      AND s.name      = ri.name
      AND s.amount    = ri.amount
      AND s.currency  = ri.currency
      AND s.frequency = ri.frequency
      AND s.icon      = ri.icon
      AND s.type      = ri.subtype
      AND s.user_id   = ri.user_id
   WHERE ri.type='income'
     AND ri.user_id IS NOT NULL AND s.user_id IS NOT NULL
     AND ri.icon IS NOT NULL AND ri.subtype IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id = ri.id)
     AND abs(extract(epoch FROM (ri.created_at - s.created_at))) <= 180
),
counts AS (
  SELECT recurring_item_id, income_stream_id,
         count(*) OVER (PARTITION BY recurring_item_id) AS streams_for_recurring,
         count(*) OVER (PARTITION BY income_stream_id)  AS recurrings_for_stream
    FROM pair
)
SELECT p.recurring_item_id,
       p.income_stream_id,
       p.tenant_id,
       p.recurring_user_id AS user_id,
       p.name,
       p.recurring_amount,
       p.stream_amount,
       p.currency,
       p.frequency,
       p.icon,
       p.active_passive,
       p.recurring_created_at,
       p.stream_created_at,
       p.seconds_apart,
       p.has_reminders,
       p.has_generated_txn,
       p.other_streams_same_name,
       'name+amount+currency+frequency+icon+active/passive+user_id all equal; 1:1; created '
         || p.seconds_apart || 's apart; no reminder row'                       AS match_reason,
       CASE
         WHEN p.other_streams_same_name > 1        THEN 'REVIEW — another stream shares this name'
         WHEN p.seconds_apart <= 5                 THEN 'very-low'
         WHEN p.seconds_apart <= 30                THEN 'low'
         ELSE 'REVIEW — created >30s apart, confirm one action'
       END                                                                     AS risk
  FROM pair p
  JOIN counts c
    ON c.recurring_item_id = p.recurring_item_id AND c.income_stream_id = p.income_stream_id
 WHERE c.streams_for_recurring = 1 AND c.recurrings_for_stream = 1
 ORDER BY (p.other_streams_same_name > 1) DESC, p.seconds_apart DESC, p.tenant_id;

\echo '=== Q1b  count of confident twins ==='
WITH pair AS (
  SELECT ri.id AS recurring_id, s.id AS stream_id
    FROM public.recurring_items ri
    JOIN public.income_streams s
      ON  s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount
      AND s.currency=ri.currency AND s.frequency=ri.frequency AND s.icon=ri.icon
      AND s.type=ri.subtype AND s.user_id=ri.user_id
   WHERE ri.type='income' AND ri.user_id IS NOT NULL AND s.user_id IS NOT NULL
     AND ri.icon IS NOT NULL AND ri.subtype IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id)
     AND abs(extract(epoch FROM (ri.created_at - s.created_at))) <= 180
),
counts AS (
  SELECT recurring_id, stream_id,
         count(*) OVER (PARTITION BY recurring_id) AS a,
         count(*) OVER (PARTITION BY stream_id)    AS b
    FROM pair
)
SELECT count(*) AS confident_twins
  FROM pair p JOIN counts c ON c.recurring_id=p.recurring_id AND c.stream_id=p.stream_id
 WHERE c.a=1 AND c.b=1;

\echo '=== Q2  AMBIGUOUS — name matches a stream but NOT a confident twin (UNTOUCHED) ==='
WITH confident AS (
  SELECT p.recurring_id
    FROM (
      SELECT ri.id AS recurring_id, s.id AS stream_id
        FROM public.recurring_items ri
        JOIN public.income_streams s
          ON  s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount
          AND s.currency=ri.currency AND s.frequency=ri.frequency AND s.icon=ri.icon
          AND s.type=ri.subtype AND s.user_id=ri.user_id
       WHERE ri.type='income' AND ri.user_id IS NOT NULL AND s.user_id IS NOT NULL
         AND ri.icon IS NOT NULL AND ri.subtype IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id)
         AND abs(extract(epoch FROM (ri.created_at - s.created_at))) <= 180
    ) p
    JOIN (
      SELECT recurring_id, stream_id,
             count(*) OVER (PARTITION BY recurring_id) AS a,
             count(*) OVER (PARTITION BY stream_id)    AS b
        FROM (
          SELECT ri.id AS recurring_id, s.id AS stream_id
            FROM public.recurring_items ri
            JOIN public.income_streams s
              ON  s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount
              AND s.currency=ri.currency AND s.frequency=ri.frequency AND s.icon=ri.icon
              AND s.type=ri.subtype AND s.user_id=ri.user_id
           WHERE ri.type='income' AND ri.user_id IS NOT NULL AND s.user_id IS NOT NULL
             AND ri.icon IS NOT NULL AND ri.subtype IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id)
             AND abs(extract(epoch FROM (ri.created_at - s.created_at))) <= 180
        ) q
    ) c ON c.recurring_id=p.recurring_id AND c.stream_id=p.stream_id
   WHERE c.a=1 AND c.b=1
)
SELECT ri.tenant_id, ri.id AS recurring_id, ri.frequency, ri.subtype,
       ri.created_at, ri.is_active,
       EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id) AS has_reminder,
       EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id=ri.id)        AS has_generated_txn,
       (SELECT count(*) FROM public.income_streams s
         WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount)           AS streams_same_name_amount,
       (SELECT count(*) FROM public.income_streams s
         WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name)                                  AS streams_same_name,
       (SELECT min(abs(extract(epoch FROM (ri.created_at - s.created_at))))
          FROM public.income_streams s
         WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount)           AS closest_stream_secs
  FROM public.recurring_items ri
 WHERE ri.type='income'
   AND ri.id NOT IN (SELECT recurring_id FROM confident)
   AND EXISTS (SELECT 1 FROM public.income_streams s
                WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name)
 ORDER BY ri.tenant_id, ri.created_at;

\echo '=== Q3  UNMATCHED — no stream in the tenant shares the name (UNTOUCHED; possible orphan OR manual) ==='
SELECT ri.tenant_id, ri.id AS recurring_id, ri.frequency, ri.subtype,
       ri.is_active, ri.created_at, ri.last_generated_at,
       EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id) AS has_reminder,
       EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id=ri.id)        AS has_generated_txn,
       'no income_streams row in tenant shares this name' AS why_unmatched
  FROM public.recurring_items ri
 WHERE ri.type='income'
   AND NOT EXISTS (SELECT 1 FROM public.income_streams s
                    WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name)
 ORDER BY ri.tenant_id, ri.created_at;

\echo '=== Q4  manual-vs-orphan signal summary for Q2 + Q3 rows ==='
SELECT
  count(*) FILTER (WHERE NOT nm) AS unmatched_total,
  count(*) FILTER (WHERE NOT nm AND (rem OR txn OR lg IS NOT NULL)) AS unmatched_but_engaged_probably_manual,
  count(*) FILTER (WHERE NOT nm AND NOT rem AND NOT txn AND lg IS NULL) AS unmatched_and_inert_possible_orphan
FROM (
  SELECT
    EXISTS (SELECT 1 FROM public.income_streams s WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name) AS nm,
    EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id)            AS rem,
    EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_recurring_id=ri.id)                   AS txn,
    ri.last_generated_at AS lg
  FROM public.recurring_items ri
  WHERE ri.type='income'
) x;

\echo '=== Q5  per-tenant summary (counts only) ==='
WITH confident AS (
  SELECT p.recurring_id, p.stream_id
    FROM (
      SELECT ri.id AS recurring_id, s.id AS stream_id
        FROM public.recurring_items ri
        JOIN public.income_streams s
          ON  s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount
          AND s.currency=ri.currency AND s.frequency=ri.frequency AND s.icon=ri.icon
          AND s.type=ri.subtype AND s.user_id=ri.user_id
       WHERE ri.type='income' AND ri.user_id IS NOT NULL AND s.user_id IS NOT NULL
         AND ri.icon IS NOT NULL AND ri.subtype IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id)
         AND abs(extract(epoch FROM (ri.created_at - s.created_at))) <= 180
    ) p
    JOIN (
      SELECT recurring_id, stream_id,
             count(*) OVER (PARTITION BY recurring_id) AS a,
             count(*) OVER (PARTITION BY stream_id)    AS b
        FROM (
          SELECT ri.id AS recurring_id, s.id AS stream_id
            FROM public.recurring_items ri
            JOIN public.income_streams s
              ON  s.tenant_id=ri.tenant_id AND s.name=ri.name AND s.amount=ri.amount
              AND s.currency=ri.currency AND s.frequency=ri.frequency AND s.icon=ri.icon
              AND s.type=ri.subtype AND s.user_id=ri.user_id
           WHERE ri.type='income' AND ri.user_id IS NOT NULL AND s.user_id IS NOT NULL
             AND ri.icon IS NOT NULL AND ri.subtype IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.recurring_reminders rr WHERE rr.recurring_item_id=ri.id)
             AND abs(extract(epoch FROM (ri.created_at - s.created_at))) <= 180
        ) q
    ) c ON c.recurring_id=p.recurring_id AND c.stream_id=p.stream_id
   WHERE c.a=1 AND c.b=1
)
SELECT ri.tenant_id,
       count(*)                                                                    AS recurring_income_total,
       count(*) FILTER (WHERE ri.id IN (SELECT recurring_id FROM confident))        AS would_link_v2,
       count(*) FILTER (WHERE ri.id NOT IN (SELECT recurring_id FROM confident)
                          AND EXISTS (SELECT 1 FROM public.income_streams s
                                       WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name)) AS ambiguous_review,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.income_streams s
                                           WHERE s.tenant_id=ri.tenant_id AND s.name=ri.name)) AS unmatched_review,
       0                                                                           AS would_delete,   -- v2 deletes nothing
       0                                                                           AS would_deactivate -- v2 deactivates nothing
  FROM public.recurring_items ri
 WHERE ri.type='income'
 GROUP BY ri.tenant_id
 ORDER BY recurring_income_total DESC;

\echo '=== Q6  totals + context ==='
SELECT
  (SELECT count(*) FROM public.tenants)                                              AS tenants_total,
  (SELECT count(*) FROM public.recurring_items)                                      AS recurring_items_total,
  (SELECT count(*) FROM public.recurring_items WHERE type='income')                  AS recurring_income_total,
  (SELECT count(*) FROM public.income_streams)                                       AS income_streams_total,
  (SELECT count(DISTINCT tenant_id) FROM public.recurring_items WHERE type='income') AS tenants_with_recurring_income;

\echo '=== Q7  recurring_reminders exposure ==='
SELECT
  (SELECT count(*) FROM public.recurring_reminders)                                             AS reminders_total,
  (SELECT count(*) FROM public.recurring_reminders rr
     JOIN public.recurring_items ri ON ri.id = rr.recurring_item_id
    WHERE ri.type='income')                                                                    AS reminders_on_income_rows,
  (SELECT count(*) FROM public.recurring_reminders rr
     WHERE NOT EXISTS (SELECT 1 FROM public.recurring_items ri WHERE ri.id = rr.recurring_item_id)) AS orphaned_reminder_rows; -- expect 0 (FK)

\echo '=== Q8  post-apply only: snapshot-schema must expose nothing ==='
-- Run AFTER v2 is applied:
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema='_backup' AND grantee IN ('anon','authenticated');   -- expect 0 rows
