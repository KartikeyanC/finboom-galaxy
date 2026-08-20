-- Found while enabling TypeScript strict mode (BUG-055). `coupons.description`
-- and `coupons.discount_percent` are both nullable columns (20260606120000),
-- and po_create_coupon already inserts them as-is with no COALESCE/NULLIF —
-- NULL was always a valid, intended value (a coupon with no blurb, or no
-- percentage set yet). Only `p_expires_at` was ever declared `DEFAULT NULL`
-- in that same function; the other two nullable params were not, which is
-- what made Supabase's generated arg types mark them required, non-null
-- `text`/`integer` — out of step with what the function actually accepts.
-- No behavior change: this only makes the declared signature match what the
-- function body already does.
CREATE OR REPLACE FUNCTION public.po_create_coupon(
  p_code text, p_description text DEFAULT NULL, p_discount_percent integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
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
