-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 2.7 fix — make the import de-dup key usable as an ON CONFLICT target
--
-- The previous migration used a PARTIAL unique index:
--   CREATE UNIQUE INDEX ... (tenant_id, import_hash) WHERE import_hash IS NOT NULL
--
-- It enforced the right thing, but the importer could not actually use it.
-- Postgres can only infer a partial index for ON CONFLICT when the statement
-- repeats the index predicate (`ON CONFLICT (cols) WHERE import_hash IS NOT
-- NULL`), and PostgREST's `on_conflict=` parameter has no way to express a
-- WHERE clause. Every upsert therefore failed with 400 rather than skipping
-- duplicates — caught by an end-to-end test, not by the unit tests.
--
-- The predicate turns out to be unnecessary anyway. Postgres unique constraints
-- default to NULLS DISTINCT, so a plain UNIQUE (tenant_id, import_hash) already
-- permits unlimited NULL rows — verified: three (1, NULL) rows plus one
-- (1, 'x') all insert fine. Manual entries keep import_hash NULL and stay
-- exempt from de-duplication, exactly as intended.
-- ═══════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.transactions_import_hash_unique;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_import_hash_key;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_import_hash_key UNIQUE (tenant_id, import_hash);

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='public.transactions'::regclass AND conname='transactions_import_hash_key';
--   -- expect: UNIQUE (tenant_id, import_hash)
--
-- Then, through PostgREST with
--   ?on_conflict=tenant_id,import_hash
--   Prefer: resolution=ignore-duplicates,return=representation
--   * first POST of a batch  -> returns the inserted rows
--   * identical POST again   -> returns [] (all skipped)
--   * rows with a NULL hash  -> always insert, never de-duplicated
-- ═══════════════════════════════════════════════════════════════════════════
