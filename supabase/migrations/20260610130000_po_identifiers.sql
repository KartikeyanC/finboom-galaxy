-- =============================================================================
-- PO custom login identifiers
--   po_user_id   — custom alphanumeric username (3-30 chars, a-z 0-9 _ -)
--   po_number_id — numeric-only ID (6-20 digits)
-- Both are unique across platform_admins and used as alternative login
-- identifiers alongside email / profile username / mobile.
-- =============================================================================

ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS po_user_id   text,
  ADD COLUMN IF NOT EXISTS po_number_id text;

-- Unique & format constraints
ALTER TABLE public.platform_admins
  DROP CONSTRAINT IF EXISTS pa_po_user_id_unique,
  DROP CONSTRAINT IF EXISTS pa_po_number_id_unique,
  DROP CONSTRAINT IF EXISTS pa_po_user_id_fmt,
  DROP CONSTRAINT IF EXISTS pa_po_number_id_fmt;

ALTER TABLE public.platform_admins
  ADD CONSTRAINT pa_po_user_id_unique   UNIQUE (po_user_id),
  ADD CONSTRAINT pa_po_number_id_unique UNIQUE (po_number_id),
  ADD CONSTRAINT pa_po_user_id_fmt      CHECK  (po_user_id   IS NULL OR (po_user_id   ~ '^[a-zA-Z0-9_\-]{3,30}$')),
  ADD CONSTRAINT pa_po_number_id_fmt    CHECK  (po_number_id IS NULL OR (po_number_id ~ '^[0-9]{6,20}$'));

-- Index for fast lookup at login
CREATE INDEX IF NOT EXISTS idx_platform_admins_po_user_id   ON public.platform_admins (po_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_po_number_id ON public.platform_admins (po_number_id);

-- =============================================================================
-- RPC: po_get_identifiers()   → returns current custom identifiers
-- =============================================================================
CREATE OR REPLACE FUNCTION public.po_get_identifiers()
RETURNS TABLE (po_user_id text, po_number_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT po_user_id, po_number_id
    FROM public.platform_admins
   WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.po_get_identifiers() TO authenticated;

-- =============================================================================
-- RPC: po_set_identifiers(p_user_id, p_number_id)
--   Pass NULL to leave a field unchanged, '' to clear it.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.po_set_identifiers(
  p_user_id   text DEFAULT NULL,
  p_number_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid  text := NULLIF(trim(p_user_id),   '');
  v_nid  text := NULLIF(trim(p_number_id), '');
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Validate format if value provided
  IF v_uid IS NOT NULL AND v_uid !~ '^[a-zA-Z0-9_\-]{3,30}$' THEN
    RAISE EXCEPTION 'User ID must be 3-30 chars (letters, numbers, _ or -)';
  END IF;
  IF v_nid IS NOT NULL AND v_nid !~ '^[0-9]{6,20}$' THEN
    RAISE EXCEPTION 'Number ID must be 6-20 digits';
  END IF;

  UPDATE public.platform_admins
     SET po_user_id   = CASE WHEN p_user_id   IS NULL THEN po_user_id   ELSE v_uid END,
         po_number_id = CASE WHEN p_number_id IS NULL THEN po_number_id ELSE v_nid END
   WHERE user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_set_identifiers(text, text) TO authenticated;

-- =============================================================================
-- Replace po_resolve_identifier — now also matches po_user_id / po_number_id
-- (service_role only — called by po-auth edge function)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.po_resolve_identifier(p_identifier text)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT pa.user_id, u.email::text
      FROM public.platform_admins pa
      JOIN auth.users u ON u.id = pa.user_id
      LEFT JOIN public.profiles p ON p.id = pa.user_id
     WHERE lower(u.email)        = lower(p_identifier)
        OR lower(p.username)     = lower(p_identifier)
        OR p.mobile              = p_identifier
        OR lower(pa.po_user_id)  = lower(p_identifier)
        OR pa.po_number_id       = p_identifier
     LIMIT 1;
END;
$$;
-- Keep restricted to service_role only
REVOKE EXECUTE ON FUNCTION public.po_resolve_identifier(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.po_resolve_identifier(text) TO service_role;

-- =============================================================================
-- Replace po_verify_secret — also matches po_user_id / po_number_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.po_verify_secret(p_identifier text, p_secret text)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
    SELECT pa.user_id, u.email::text
      FROM public.platform_admins pa
      JOIN auth.users u ON u.id = pa.user_id
      LEFT JOIN public.profiles p ON p.id = pa.user_id
     WHERE (lower(u.email)       = lower(p_identifier)
         OR lower(p.username)    = lower(p_identifier)
         OR p.mobile             = p_identifier
         OR lower(pa.po_user_id) = lower(p_identifier)
         OR pa.po_number_id      = p_identifier)
       AND pa.secret_hash IS NOT NULL
       AND pa.secret_hash = crypt(p_secret, pa.secret_hash)
     LIMIT 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.po_verify_secret(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.po_verify_secret(text, text) TO service_role;
