-- ===========================================================================
-- trackers.reviewed_at — the column 20260827120000 described but never created.
--
-- WHAT HAPPENED: the previous migration's comments discuss `reviewed_at` and
-- the Phase 4 client code reads and writes it, but the CREATE TABLE never
-- listed it. The temporary type shim (src/hooks/trackersClient.ts) widened
-- past the generated types, so TypeScript could not see the mismatch;
-- regenerating types.ts against the real schema surfaced it immediately.
--
-- Appended rather than edited: 20260827120000 is already applied, and the
-- hard rule is that a migration in the wild is never rewritten.
--
-- WHAT IT IS: when the user answered the "shall we look through your older
-- transactions?" prompt — by assigning, or by skipping. It records that the
-- question was ASKED AND ANSWERED, not that anything was assigned, so a skip
-- is not re-nagged on the next visit. The button stays reachable in the
-- workspace afterwards; this closes the prompt, not the door.
--
-- A column rather than a localStorage key: which transactions belong to a
-- project is a fact about the WORKSPACE, not about one browser (ADR-0003).
-- A device-local flag would re-nag the same person on their laptop.
--
-- Nullable with no default and no backfill. NULL means "not yet answered",
-- which is exactly true of every tracker that exists right now.
-- ===========================================================================

ALTER TABLE public.trackers
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

COMMENT ON COLUMN public.trackers.reviewed_at IS
  'When the historical-review prompt was answered, by assigning OR skipping. '
  'NULL = not yet answered. Records that the question was asked and answered, '
  'not that anything was assigned.';

-- ---- Post-apply verification ----------------------------------------------
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'trackers' AND column_name = 'reviewed_at';   -- 1
-- ===========================================================================
