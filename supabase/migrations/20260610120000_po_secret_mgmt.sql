-- =============================================================================
-- PO Secret Access Code management helpers
-- po_has_secret()   → boolean  (does the current PO have a secret set?)
-- po_revoke_secret() → void    (clear the secret hash)
-- Both are callable by the authenticated PO (SECURITY DEFINER guards the table).
-- =============================================================================

-- 1. Check whether a secret is already configured
CREATE OR REPLACE FUNCTION public.po_has_secret()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT secret_hash IS NOT NULL
       FROM public.platform_admins
      WHERE user_id = auth.uid()),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION public.po_has_secret() TO authenticated;

-- 2. Clear the secret (revoke it)
CREATE OR REPLACE FUNCTION public.po_revoke_secret()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a platform admin';
  END IF;
  UPDATE public.platform_admins
     SET secret_hash = NULL
   WHERE user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_revoke_secret() TO authenticated;
