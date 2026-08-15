-- =============================================================================
-- Stage 2 · 2.10 follow-on — let the PO price a plan from the console.
--
-- The landing pricing section now derives its numbers from `plans`, so without
-- this the price could only be changed with raw SQL. Same guard/audit shape as
-- po_set_plan_menus.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.po_set_plan_price(
  p_plan_id     uuid,
  p_price_cents integer,
  p_currency    text DEFAULT NULL,
  p_interval    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old public.plans%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_price_cents IS NULL OR p_price_cents < 0 THEN
    RAISE EXCEPTION 'Price must be zero or more';
  END IF;
  IF p_currency IS NOT NULL AND p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter code, e.g. INR';
  END IF;
  IF p_interval IS NOT NULL AND p_interval NOT IN ('month','year') THEN
    RAISE EXCEPTION 'Interval must be month or year';
  END IF;

  SELECT * INTO v_old FROM public.plans WHERE id = p_plan_id;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'No such plan'; END IF;

  UPDATE public.plans
     SET price_cents = p_price_cents,
         currency    = COALESCE(p_currency, currency),
         "interval"  = COALESCE(p_interval, "interval")
   WHERE id = p_plan_id;

  -- Manual subscriptions quote the plan's currency; Paddle rows keep theirs.
  UPDATE public.subscriptions s
     SET currency = p.currency
    FROM public.plans p
   WHERE p.id = s.plan_id AND s.plan_id = p_plan_id AND s.provider = 'manual'
     AND s.currency IS DISTINCT FROM p.currency;

  PERFORM public.log_audit(NULL, 'plan.price', 'plan', p_plan_id::text,
    jsonb_build_object(
      'from', jsonb_build_object('price_cents', v_old.price_cents, 'currency', v_old.currency, 'interval', v_old."interval"),
      'to',   jsonb_build_object('price_cents', p_price_cents, 'currency', COALESCE(p_currency, v_old.currency), 'interval', COALESCE(p_interval, v_old."interval"))
    ));
END;
$$;
REVOKE ALL ON FUNCTION public.po_set_plan_price(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.po_set_plan_price(uuid, integer, text, text) TO authenticated;

-- =============================================================================
-- Post-apply verification (as a signed-in platform admin):
--   SELECT public.po_set_plan_price(
--     (SELECT id FROM public.plans WHERE name='Canopy'), 29900, 'INR', 'month');
--   SELECT name, price_cents, currency FROM public.plans ORDER BY price_cents;
--   -- as a non-admin: expect "Not authorized"
-- =============================================================================
