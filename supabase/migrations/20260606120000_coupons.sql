-- =============================================================================
-- Coupons — Product Owner creates promo codes; an active one shows in a
-- site-wide top banner so (new) users can grab it.
-- =============================================================================
CREATE TABLE public.coupons (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  description      text,
  discount_percent integer,
  active           boolean NOT NULL DEFAULT true,
  expires_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT ALL ON public.coupons TO service_role;

-- Anyone can read a currently-valid, active coupon (drives the public banner).
CREATE POLICY coupons_public_read ON public.coupons FOR SELECT
  USING (active AND (expires_at IS NULL OR expires_at > now()));
-- Product Owners can read everything (incl. inactive/expired) for management.
CREATE POLICY coupons_po_read ON public.coupons FOR SELECT
  USING (public.is_platform_admin());

-- ---- PO management RPCs (audited) ------------------------------------------
CREATE OR REPLACE FUNCTION public.po_create_coupon(
  p_code text, p_description text, p_discount_percent integer, p_expires_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF COALESCE(trim(p_code), '') = '' THEN RAISE EXCEPTION 'Code is required'; END IF;
  INSERT INTO public.coupons (code, description, discount_percent, expires_at)
  VALUES (upper(trim(p_code)), p_description, p_discount_percent, p_expires_at)
  RETURNING id INTO v_id;
  PERFORM public.log_audit(NULL, 'coupon.create', 'coupon', v_id::text,
    jsonb_build_object('code', upper(trim(p_code)), 'discount', p_discount_percent));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.po_list_coupons()
RETURNS SETOF public.coupons
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY SELECT * FROM public.coupons ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.po_set_coupon_active(p_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.coupons SET active = p_active WHERE id = p_id;
  PERFORM public.log_audit(NULL, 'coupon.active', 'coupon', p_id::text, jsonb_build_object('active', p_active));
END; $$;

CREATE OR REPLACE FUNCTION public.po_delete_coupon(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  PERFORM public.log_audit(NULL, 'coupon.delete', 'coupon', p_id::text, NULL);
  DELETE FROM public.coupons WHERE id = p_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.po_create_coupon(text, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_list_coupons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_set_coupon_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_delete_coupon(uuid) TO authenticated;
