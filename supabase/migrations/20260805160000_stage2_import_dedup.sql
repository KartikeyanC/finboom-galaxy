-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 2.7 / BUG-017 — import de-duplication
--
-- The importer looped rows and inserted each one unconditionally. Re-uploading
-- the same statement — a habit when an import half-fails, or when a bank export
-- overlaps the previous month — silently doubled every transaction. Nothing in
-- the UI revealed it; totals just drifted.
--
-- ── Approach: content hash + partial unique index ──────────────────────────
-- Imported rows carry a hash of their meaningful content (see
-- src/lib/importDedup.ts). A UNIQUE index on (tenant_id, import_hash) lets the
-- database reject the second copy, so correctness does not depend on the client
-- remembering what it already sent.
--
-- The index is PARTIAL — `WHERE import_hash IS NOT NULL` — which matters:
-- manually entered transactions leave it NULL and are never de-duplicated.
-- Buying the same coffee twice on the same day is legitimate and must stay
-- possible; re-importing the same CSV row is not.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS import_hash text;

COMMENT ON COLUMN public.transactions.import_hash IS
  'SHA-256 of the source row content, set only by the importer. NULL for '
  'manually entered transactions, which are intentionally never de-duplicated.';

-- Scoped to tenant: two workspaces may legitimately import identical rows.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_import_hash_unique
  ON public.transactions (tenant_id, import_hash)
  WHERE import_hash IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification
--   -- the same hash twice in one tenant must fail
--   INSERT ... (import_hash) VALUES ('abc');   -- ok
--   INSERT ... (import_hash) VALUES ('abc');   -- expect: duplicate key
--
--   -- two NULLs must both be allowed (manual entries)
--   INSERT ... (import_hash) VALUES (NULL);    -- ok
--   INSERT ... (import_hash) VALUES (NULL);    -- ok
--
--   -- the same hash in a DIFFERENT tenant must be allowed
-- ═══════════════════════════════════════════════════════════════════════════
