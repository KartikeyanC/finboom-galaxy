-- Stage 5.1 — record which version of the terms an account accepted.
--
-- The notice at sign-up is the consent; this is the EVIDENCE of it. India's
-- DPDP Act expects a demonstrable record of notice-and-consent, and "the button
-- said so at the time" is not demonstrable once the wording changes.
--
-- Deliberately two plain columns on `profiles` rather than a new table: there
-- is exactly one current version, and the only questions ever asked are "did
-- this account accept?" and "which text?". A history table would be the right
-- shape if we ever need to prove acceptance of SUPERSEDED versions — at that
-- point, add `legal_acceptances` and backfill from these columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_version     text,
  ADD COLUMN IF NOT EXISTS legal_accepted_at timestamptz;

COMMENT ON COLUMN public.profiles.legal_version IS
  'LEGAL_VERSION (src/lib/legal.ts) the user accepted at sign-up, or last re-accepted. NULL for accounts created before Stage 5.1.';
COMMENT ON COLUMN public.profiles.legal_accepted_at IS
  'When that acceptance was recorded. Set server-side, never from the client clock.';

-- The client may only say "I accepted version X"; it may not choose the
-- timestamp, and it may not write for anybody else. SECURITY DEFINER so the
-- write is possible without opening profiles up to arbitrary updates.
CREATE OR REPLACE FUNCTION public.record_legal_acceptance(p_version text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_version IS NULL OR btrim(p_version) = '' THEN
    RAISE EXCEPTION 'A version is required';
  END IF;

  -- Bounded so a client cannot store an essay in this column.
  IF length(p_version) > 32 THEN
    RAISE EXCEPTION 'Version too long';
  END IF;

  UPDATE public.profiles
     SET legal_version     = p_version,
         legal_accepted_at = now(),
         updated_at        = now()
   WHERE id = auth.uid();

  -- handle_new_user() creates the profile row, but sign-up and this call race:
  -- if the row is not there yet, do nothing rather than fail the caller. The
  -- client re-records on the next sign-in, and the notice was still shown.
END;
$$;

REVOKE ALL ON FUNCTION public.record_legal_acceptance(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(text) TO authenticated;
