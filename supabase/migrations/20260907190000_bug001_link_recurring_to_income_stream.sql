-- ===========================================================================
-- SUPERSEDED — DO NOT APPLY THE ORIGINAL BODY OF THIS FILE.
--
-- This migration was written for BUG-001 (deleting an income stream orphaned
-- its paired recurring_items row) and then FAILED pre-migration review:
--
--   RISK: HIGH · STATUS: DO NOT APPLY   (qa/BUG-001-PRE-MIGRATION-IMPACT.md)
--
--   1. Its step 3 performed an irreversible hard DELETE on production rows
--      using an unsafe predicate ("type='income' AND no stream shares the
--      name") — which is exactly the shape of a deliberate recurring income
--      created on the Recurring Income tab. On a database with no backups that
--      is unrecoverable data loss.
--   2. Its step 2 auto-linked recurring items to streams on (name, amount)
--      alone — enough to bind a manual recurring income to an unrelated stream
--      and have it silently cascade-deleted later.
--   3. Its step-0 snapshot used `CREATE TABLE IF NOT EXISTS … AS` (a silent
--      no-op on any re-run) and never captured recurring_reminders, whose rows
--      cascade off recurring_items and would become unrecoverable.
--
-- REPLACED BY:
--   supabase/migrations/20260908120000_bug001_link_recurring_to_income_stream_v2.sql
--   review: qa/BUG-001-MIGRATION-REVIEW-V2.md
--
-- This file is intentionally kept (migration history is append-only) but its
-- body is now a no-op: applying it does nothing. The original SQL is preserved
-- verbatim in qa/BUG-001-MIGRATION-REVIEW-V2.md §"Superseded v1 — original body"
-- for the record.
-- ===========================================================================

DO $$
BEGIN
  RAISE NOTICE 'BUG-001 v1 (20260907190000) is superseded by v2 (20260908120000) and is a no-op. See qa/BUG-001-MIGRATION-REVIEW-V2.md';
END $$;
