-- ===========================================================================
-- Stage 3.3 follow-up — let the list query know a legacy document EXISTS
-- without downloading it.
--
-- Found by measuring the fix: dropping `document_data_url` from the list query
-- took the payload for one policy with a 200 KB inline scan from 200,588 bytes
-- to 389 (-99.8%). But the card decided whether to show "View Document" by
-- testing that same column, so pre-3.3 policies silently lost the button —
-- their document was still there, just unreachable from the UI.
--
-- A generated column answers "is there one?" in one byte, so the list stays
-- small and the button stays correct. STORED rather than a view because
-- PostgREST selects columns, and this keeps the change invisible to callers.
-- ===========================================================================

ALTER TABLE public.insurance
  ADD COLUMN IF NOT EXISTS has_legacy_document boolean
  GENERATED ALWAYS AS (document_data_url IS NOT NULL) STORED;

COMMENT ON COLUMN public.insurance.has_legacy_document IS
  'Stage 3.3. True when this row still carries a pre-Storage inline document. '
  'Lets the list query show the View button without fetching the blob; the '
  'document itself is loaded on demand by loadLegacyDocument().';

-- ===========================================================================
-- Verify:
--   SELECT has_legacy_document, document_path IS NOT NULL AS migrated
--     FROM public.insurance;
--   -- a legacy row -> true/false; a Storage-backed row -> false/true
-- ===========================================================================
