-- ===========================================================================
-- BUG-001 v2 — link a recurring-income "twin" to the income stream that
--              created it, so deleting the stream cleans up the reminder.
--
-- SUPERSEDES supabase/migrations/20260907190000_bug001_link_recurring_to_income_stream.sql
-- (that file has been neutralised to a no-op — do not resurrect it).
--
-- ---- Why v1 was rejected (qa/BUG-001-PRE-MIGRATION-IMPACT.md) ---------------
--   * v1 step 3 hard-DELETEd every type='income' recurring row whose NAME
--     matched no current stream. Deliberate rows created on the Recurring
--     Income tab (RecurringDialog, type='income') are exactly the rows with no
--     matching stream — v1 destroyed real user data, irreversibly, on a
--     database with no backups.
--   * v1 step 2 auto-linked on (name, amount) alone — enough for a manual
--     recurring income to be bound to an unrelated stream and then silently
--     cascade-deleted months later.
--   * v1's snapshot used CREATE TABLE IF NOT EXISTS … AS (silent no-op on a
--     re-run) and never snapshotted recurring_reminders (cascade children).
--
-- ---- What v2 does -----------------------------------------------------------
--   STEP 0  pre-flight assertions (fresh apply only; tables present)
--   STEP 1  versioned snapshots of recurring_items AND recurring_reminders,
--           with row-count assertions
--   STEP 2  add recurring_items.income_stream_id  →  ON DELETE CASCADE  + index
--   STEP 3  identify CONFIDENT twins only, into _backup.bug001_v2_confident
--   STEP 4  backfill income_stream_id for those confident twins ONLY
--   STEP 5  write _backup.bug001_v2_review — a classification of EVERY income
--           recurring row (A_linked / B_ambiguous_review / C_unmatched_review)
--           for a human to act on later. NOTHING is deleted or deactivated.
--   STEP 6  verification assertions — any anomaly raises and rolls the whole
--           migration back
--
-- ---- What v2 deliberately does NOT do --------------------------------------
--   * No DELETE. No UPDATE of is_active. No touch of any ambiguous or unmatched
--     row. Historical orphan clean-up is a separate, REVIEWED, manual step
--     (flip is_active on confirmed-dead orphans via the app or a follow-up
--     migration once qa/BUG-001-MIGRATION-REVIEW-V2.md is signed off).
--   * No application-code change. AddIncomeDialog / useIncomeStreams.remove()
--     are untouched until this schema is approved (see the review doc §10).
--
-- ---- Confident-twin definition (STEP 3) ------------------------------------
-- AddIncomeDialog.submit() fires two independent inserts in one handler:
-- useIncomeStreams.add() → income_streams, and useCreateRecurring() →
-- recurring_items, copying the SAME name, amount, currency, frequency, icon and
-- active/passive flag into both, under the same auth user. A row is treated as
-- a twin only when ALL of that agrees, the two rows were created within one
-- action (<= 180 s apart — two independent HTTP inserts, generous cover), the
-- match is strictly 1:1, and the recurring row carries no manual
-- recurring_reminders setting (AddIncomeDialog never creates one; RecurringDialog's
-- toggle does). Every weaker case is left for manual review — under-linking is
-- safe, a wrong link is not.
-- ===========================================================================


-- ── STEP 0 ── pre-flight ────────────────────────────────────────────────────
DO $$
DECLARE
  v_total   int;
  v_income  int;
  v_tables  int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'recurring_items'
       AND column_name = 'income_stream_id'
  ) THEN
    RAISE EXCEPTION 'BUG-001 v2: recurring_items.income_stream_id already exists. '
      'A prior BUG-001 migration ran. Stop and reconcile before applying v2.';
  END IF;

  SELECT count(*) INTO v_tables
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('income_streams', 'recurring_items', 'recurring_reminders');
  IF v_tables <> 3 THEN
    RAISE EXCEPTION 'BUG-001 v2: expected income_streams, recurring_items and '
      'recurring_reminders in public (found %).', v_tables;
  END IF;

  SELECT count(*)                                  INTO v_total  FROM public.recurring_items;
  SELECT count(*) FILTER (WHERE type = 'income')   INTO v_income FROM public.recurring_items;
  RAISE NOTICE 'BUG-001 v2 preflight: recurring_items total=%, income=%', v_total, v_income;
END $$;


-- ── STEP 1 ── snapshots (versioned, complete, asserted) ─────────────────────
CREATE SCHEMA IF NOT EXISTS _backup;

-- Plain CREATE TABLE (NOT "IF NOT EXISTS"): a re-run aborts here with
-- "relation already exists" rather than silently continuing on a stale copy.
-- The whole migration runs in one transaction, so this abort rolls everything
-- back and leaves the database untouched.
CREATE TABLE _backup.recurring_items_bug001_v2 AS
  SELECT * FROM public.recurring_items;

CREATE TABLE _backup.recurring_reminders_bug001_v2 AS
  SELECT * FROM public.recurring_reminders;

DO $$
DECLARE a int; b int; c int; d int;
BEGIN
  SELECT count(*) INTO a FROM public.recurring_items;
  SELECT count(*) INTO b FROM _backup.recurring_items_bug001_v2;
  SELECT count(*) INTO c FROM public.recurring_reminders;
  SELECT count(*) INTO d FROM _backup.recurring_reminders_bug001_v2;
  IF a <> b THEN RAISE EXCEPTION 'BUG-001 v2: recurring_items snapshot=% live=%', b, a; END IF;
  IF c <> d THEN RAISE EXCEPTION 'BUG-001 v2: recurring_reminders snapshot=% live=%', d, c; END IF;
  RAISE NOTICE 'BUG-001 v2 snapshot ok: recurring_items=%, recurring_reminders=%', b, d;
END $$;

COMMENT ON TABLE _backup.recurring_items_bug001_v2 IS
  'BUG-001 v2 pre-migration snapshot (2026-09-08). All columns, all tenants. '
  'Drop once the fix is verified and stable in production.';
COMMENT ON TABLE _backup.recurring_reminders_bug001_v2 IS
  'BUG-001 v2 pre-migration snapshot (2026-09-08). recurring_reminders cascade '
  'off recurring_items which will now cascade off income_streams — kept so a '
  'post-apply rollback can restore any reminder a later stream deletion removed.';


-- ── STEP 2 ── the link ─────────────────────────────────────────────────────
ALTER TABLE public.recurring_items
  ADD COLUMN IF NOT EXISTS income_stream_id uuid
  REFERENCES public.income_streams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_recurring_items_income_stream_id
  ON public.recurring_items(income_stream_id);

COMMENT ON COLUMN public.recurring_items.income_stream_id IS
  'BUG-001: set only for a recurring row auto-created by AddIncomeDialog as the '
  'twin of an income_streams row. NULL for every manually-created recurring '
  'item. ON DELETE CASCADE: deleting the stream removes its twin reminder.';


-- ── STEP 3 ── identify CONFIDENT twins only ────────────────────────────────
CREATE TABLE _backup.bug001_v2_confident AS
WITH pair AS (
  SELECT ri.id       AS recurring_id,
         s.id        AS stream_id,
         ri.tenant_id,
         abs(extract(epoch FROM (ri.created_at - s.created_at))) AS secs_apart
    FROM public.recurring_items ri
    JOIN public.income_streams s
      ON  s.tenant_id = ri.tenant_id
      AND s.name      = ri.name
      AND s.amount    = ri.amount            -- numeric value equality (scale-independent)
      AND s.currency  = ri.currency
      AND s.frequency = ri.frequency
      AND s.icon      = ri.icon
      AND s.type      = ri.subtype           -- stream active/passive == recurring subtype
      AND s.user_id   = ri.user_id
   WHERE ri.type = 'income'
     AND ri.income_stream_id IS NULL
     AND ri.user_id IS NOT NULL
     AND s.user_id  IS NOT NULL
     AND ri.icon    IS NOT NULL
     AND ri.subtype IS NOT NULL
     -- a twin never carries a manual reminder setting
     AND NOT EXISTS (
       SELECT 1 FROM public.recurring_reminders rr
        WHERE rr.recurring_item_id = ri.id
     )
     -- created together in one user action (necessary, not sufficient)
     AND abs(extract(epoch FROM (ri.created_at - s.created_at))) <= 180
),
counts AS (
  SELECT recurring_id, stream_id,
         count(*) OVER (PARTITION BY recurring_id) AS streams_for_recurring,
         count(*) OVER (PARTITION BY stream_id)    AS recurrings_for_stream
    FROM pair
)
SELECT p.recurring_id, p.stream_id, p.tenant_id, p.secs_apart
  FROM pair p
  JOIN counts c
    ON c.recurring_id = p.recurring_id AND c.stream_id = p.stream_id
 WHERE c.streams_for_recurring = 1     -- strictly 1:1 on both sides
   AND c.recurrings_for_stream = 1;

COMMENT ON TABLE _backup.bug001_v2_confident IS
  'BUG-001 v2: the exact (recurring_id, stream_id) pairs STEP 4 linked. Audit '
  'record; safe to drop with the other _backup tables after sign-off.';


-- ── STEP 4 ── backfill CONFIDENT twins ONLY ────────────────────────────────
UPDATE public.recurring_items ri
   SET income_stream_id = c.stream_id
  FROM _backup.bug001_v2_confident c
 WHERE ri.id = c.recurring_id;


-- ── STEP 5 ── classify every income recurring row for manual review ────────
--             (READ-ONLY w.r.t. public: this only writes a _backup table)
CREATE TABLE _backup.bug001_v2_review AS
SELECT ri.id                                     AS recurring_item_id,
       ri.tenant_id,
       ri.user_id,
       ri.is_active,
       ri.created_at,
       ri.last_generated_at,
       ri.income_stream_id,
       (ri.income_stream_id IS NOT NULL)          AS linked_by_migration,
       EXISTS (SELECT 1 FROM public.recurring_reminders rr
                WHERE rr.recurring_item_id = ri.id)              AS has_reminder_setting,
       EXISTS (SELECT 1 FROM public.transactions t
                WHERE t.source_recurring_id = ri.id)             AS has_generated_txn,
       EXISTS (SELECT 1 FROM public.income_streams s
                WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name)                    AS name_matches_a_stream,
       EXISTS (SELECT 1 FROM public.income_streams s
                WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name
                  AND s.amount = ri.amount)                                               AS name_amount_matches_a_stream,
       (SELECT count(*) FROM public.income_streams s
         WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name
           AND s.amount = ri.amount)                                                      AS streams_matching_name_amount,
       (SELECT min(abs(extract(epoch FROM (ri.created_at - s.created_at))))
          FROM public.income_streams s
         WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name
           AND s.amount = ri.amount)                                                      AS closest_stream_secs,
       CASE
         WHEN ri.income_stream_id IS NOT NULL
           THEN 'A_linked'
         WHEN NOT EXISTS (SELECT 1 FROM public.income_streams s
                           WHERE s.tenant_id = ri.tenant_id AND s.name = ri.name)
           THEN 'C_unmatched_review'
         ELSE 'B_ambiguous_review'
       END                                                                               AS classification
  FROM public.recurring_items ri
 WHERE ri.type = 'income';

COMMENT ON TABLE _backup.bug001_v2_review IS
  'BUG-001 v2: classification of every income recurring row at migration time. '
  'A_linked = auto-linked twin (STEP 4). B_ambiguous_review / C_unmatched_review '
  '= left completely untouched; a human decides per qa/BUG-001-MIGRATION-REVIEW-V2.md. '
  'Contains no name/amount/notes — counts and flags only.';


-- ── STEP 6 ── verification (any failure rolls the whole migration back) ────
DO $$
DECLARE
  v_confident            int;
  v_linked               int;
  v_expense_hit          int;
  v_linked_wo_stream     int;
  v_dup_stream           int;
  v_linked_with_reminder int;
  v_cross_tenant         int;
  v_review_total         int;
  v_income_total         int;
BEGIN
  SELECT count(*) INTO v_confident FROM _backup.bug001_v2_confident;
  SELECT count(*) INTO v_linked    FROM public.recurring_items WHERE income_stream_id IS NOT NULL;
  IF v_linked <> v_confident THEN
    RAISE EXCEPTION 'BUG-001 v2: % rows linked but % confident candidates', v_linked, v_confident;
  END IF;

  SELECT count(*) INTO v_expense_hit
    FROM public.recurring_items
   WHERE type <> 'income' AND income_stream_id IS NOT NULL;
  IF v_expense_hit > 0 THEN
    RAISE EXCEPTION 'BUG-001 v2: % non-income rows were linked', v_expense_hit;
  END IF;

  SELECT count(*) INTO v_linked_wo_stream
    FROM public.recurring_items ri
    LEFT JOIN public.income_streams s ON s.id = ri.income_stream_id
   WHERE ri.income_stream_id IS NOT NULL AND s.id IS NULL;
  IF v_linked_wo_stream > 0 THEN
    RAISE EXCEPTION 'BUG-001 v2: % linked rows point at a missing stream', v_linked_wo_stream;
  END IF;

  SELECT count(*) INTO v_dup_stream FROM (
    SELECT income_stream_id
      FROM public.recurring_items
     WHERE income_stream_id IS NOT NULL
     GROUP BY income_stream_id
    HAVING count(*) > 1
  ) q;
  IF v_dup_stream > 0 THEN
    RAISE EXCEPTION 'BUG-001 v2: % streams linked from more than one recurring row', v_dup_stream;
  END IF;

  SELECT count(*) INTO v_linked_with_reminder
    FROM public.recurring_items ri
    JOIN public.recurring_reminders rr ON rr.recurring_item_id = ri.id
   WHERE ri.income_stream_id IS NOT NULL;
  IF v_linked_with_reminder > 0 THEN
    RAISE EXCEPTION 'BUG-001 v2: % linked rows also carry a recurring_reminders row', v_linked_with_reminder;
  END IF;

  SELECT count(*) INTO v_cross_tenant
    FROM public.recurring_items ri
    JOIN public.income_streams s ON s.id = ri.income_stream_id
   WHERE ri.tenant_id <> s.tenant_id;
  IF v_cross_tenant > 0 THEN
    RAISE EXCEPTION 'BUG-001 v2: % cross-tenant links', v_cross_tenant;
  END IF;

  SELECT count(*) INTO v_review_total FROM _backup.bug001_v2_review;
  SELECT count(*) INTO v_income_total FROM public.recurring_items WHERE type = 'income';
  IF v_review_total <> v_income_total THEN
    RAISE EXCEPTION 'BUG-001 v2: review table has % rows, expected % income rows', v_review_total, v_income_total;
  END IF;

  RAISE NOTICE 'BUG-001 v2 verified: % rows linked, 0 anomalies. % income rows classified for review.',
    v_linked, v_review_total;
END $$;


-- ===========================================================================
-- ROLLBACK  (safe and complete — v2 deletes nothing and deactivates nothing)
--
--   BEGIN;
--   UPDATE public.recurring_items SET income_stream_id = NULL;        -- undo STEP 4
--   DROP INDEX  IF EXISTS public.idx_recurring_items_income_stream_id;
--   ALTER TABLE public.recurring_items DROP COLUMN IF EXISTS income_stream_id;
--   DROP TABLE  IF EXISTS _backup.bug001_v2_review;
--   DROP TABLE  IF EXISTS _backup.bug001_v2_confident;
--   DROP TABLE  IF EXISTS _backup.recurring_reminders_bug001_v2;
--   DROP TABLE  IF EXISTS _backup.recurring_items_bug001_v2;
--   COMMIT;
--
-- CAVEAT — the one-line UPDATE above is a full rollback ONLY while no
-- income_streams row has been deleted since this migration was applied. Once a
-- stream is deleted, its linked twin (and that twin's recurring_reminders row)
-- are cascade-removed. To roll back after that, first restore those rows by id
-- from _backup.recurring_items_bug001_v2 / _backup.recurring_reminders_bug001_v2,
-- THEN run the block above.
--
-- POST-APPLY, IN ORDER
--   1. Review _backup.bug001_v2_review — every B_ambiguous_review and
--      C_unmatched_review row. Decide per row (qa/BUG-001-MIGRATION-REVIEW-V2.md).
--      Orphans confirmed dead: set is_active = false (reversible; the dashboard
--      "Reminders" widget filters on is_active — ActionableReminders.tsx). Do
--      NOT hard-delete.
--   2. Regenerate src/integrations/supabase/types.ts from ludbntvhagefadfkhrjj
--      (Bash redirection, strip BOM/CRLF).
--   3. THEN the application-code follow-up (separate branch, separate review):
--      set income_stream_id on the AddIncomeDialog insert (needs the new stream
--      id back from useIncomeStreams.add), and drop the interim name+amount
--      twin-delete from useIncomeStreams.remove() — the CASCADE covers it.
--   4. Once stable: drop the four _backup tables (and _backup schema if empty).
-- ===========================================================================
