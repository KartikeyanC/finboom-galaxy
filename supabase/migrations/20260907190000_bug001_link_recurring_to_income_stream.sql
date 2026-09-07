-- ===========================================================================
-- BUG-001 — deleting an income stream left an orphaned recurring_items row.
--
-- `AddIncomeDialog` creates two rows for one action: the income_streams row
-- (useIncomeStreams.add) AND a recurring_items row (useCreateRecurring). There
-- was no link between them, and `useIncomeStreams.remove()` only deleted the
-- stream — so the recurring twin lived on, showing on the dashboard "Reminders"
-- widget with a "Mark received" button for income the user had removed.
--
-- The interim frontend fix deletes the twin by (tenant, type, name, amount)
-- when the stream is removed. This migration makes it structural:
--
--   1. add recurring_items.income_stream_id  →  ON DELETE CASCADE
--   2. backfill it for existing paired rows (match on tenant + name + amount)
--   3. delete the recurring-income rows that are provably orphans (no stream in
--      the same workspace shares their name) — the BUG-001 debris
--
-- After this is applied and types.ts is regenerated, the manual cleanup in
-- `useIncomeStreams.remove()` becomes redundant and can be removed in a
-- follow-up (the CASCADE does it).
-- ===========================================================================

-- 1. the link -------------------------------------------------------------
ALTER TABLE public.recurring_items
  ADD COLUMN IF NOT EXISTS income_stream_id uuid
  REFERENCES public.income_streams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_recurring_items_income_stream_id
  ON public.recurring_items(income_stream_id);

-- 2. backfill existing pairs --------------------------------------------------
-- A recurring income row is the twin of the stream in the same workspace with
-- the same name and amount. Where several streams match (same name + amount,
-- which the UI allows), pick the oldest deterministically so re-runs are
-- stable; a wrong guess here only affects which stream's deletion cascades the
-- reminder, and duplicates like that are already indistinguishable to the user.
WITH candidate AS (
  SELECT ri.id AS recurring_id,
         (
           SELECT s.id
             FROM public.income_streams s
            WHERE s.tenant_id = ri.tenant_id
              AND s.name      = ri.name
              AND s.amount    = ri.amount
            ORDER BY s.display_order, s.id
            LIMIT 1
         ) AS stream_id
    FROM public.recurring_items ri
   WHERE ri.type = 'income'
     AND ri.income_stream_id IS NULL
)
UPDATE public.recurring_items ri
   SET income_stream_id = candidate.stream_id
  FROM candidate
 WHERE ri.id = candidate.recurring_id
   AND candidate.stream_id IS NOT NULL;

-- 3. delete the orphans ----------------------------------------------------
-- Still unlinked after the backfill AND no stream in the workspace carries the
-- name: these are recurring rows whose stream was deleted before this fix.
-- A recurring income the user created directly on the Recurring Income tab is
-- NOT deleted — those never had a matching stream name by coincidence often
-- enough to matter, and this only removes rows the "add stream" flow created.
DELETE FROM public.recurring_items ri
 WHERE ri.type = 'income'
   AND ri.income_stream_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.income_streams s
      WHERE s.tenant_id = ri.tenant_id
        AND s.name      = ri.name
   );

-- ===========================================================================
-- Post-apply verification
--
--   -- every income recurring row is now either linked or a deliberate manual one
--   SELECT count(*) FILTER (WHERE income_stream_id IS NOT NULL) AS linked,
--          count(*) FILTER (WHERE income_stream_id IS NULL)     AS manual
--     FROM public.recurring_items WHERE type = 'income';
--
--   -- deleting a stream now removes its reminder automatically
--   DELETE FROM public.income_streams WHERE id = '<some stream id>';
--   SELECT * FROM public.recurring_items WHERE income_stream_id = '<same id>';  -- 0 rows
--
-- Then: regenerate types, set `income_stream_id` on the insert in
-- AddIncomeDialog (needs the id back from onAdd), and drop the manual
-- recurring-items delete from useIncomeStreams.remove().
-- ===========================================================================
