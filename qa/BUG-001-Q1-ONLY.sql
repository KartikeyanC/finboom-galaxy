-- ===========================================================================
-- BUG-001 v2 — Q1 ONLY (extracted verbatim from
-- qa/BUG-001-MIGRATION-IMPACT-V2-SUPABASE.sql).  READ-ONLY.
--
-- One SELECT. No Q0 / Q1b / Q2 / Q3 / Q4 / Q5 / Q6 / Q7 / Q8.
-- Run in the Supabase SQL Editor for ludbntvhagefadfkhrjj.
-- Do NOT run the migration. Do NOT run any UPDATE / DELETE / INSERT / ALTER /
-- DROP / TRUNCATE.
-- ===========================================================================


-- === Q1  CONFIDENT twins — STEP 3/4 would set income_stream_id on exactly these rows ===
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
