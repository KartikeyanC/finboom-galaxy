-- =============================================================================
-- PO-018 follow-on — let the PO map a plan to a Paddle price id from the console.
--
-- `plans.paddle_price_id` has existed since Phase 7 (20260604240000) but nothing
-- ever wrote to it outside raw SQL — there is no RPC and no UI field. Without a
-- price id on at least one paid plan, `/po/coupons` refuses to render its editor
-- ("a coupon created here could be copied by a customer but never redeemed"),
-- which is the correct call, but it also means the PO can never clear that
-- precondition from the console itself. Same guard/audit shape as
-- po_set_plan_price and po_set_plan_menus.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.po_set_plan_paddle_price_id(
  p_plan_id uuid,
  p_paddle_price_id text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old public.plans%ROWTYPE;
  v_new text := NULLIF(trim(p_paddle_price_id), '');
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_old FROM public.plans WHERE id = p_plan_id;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'No such plan'; END IF;

  UPDATE public.plans SET paddle_price_id = v_new WHERE id = p_plan_id;

  PERFORM public.log_audit(NULL, 'plan.paddle_price_id', 'plan', p_plan_id::text,
    jsonb_build_object('from', v_old.paddle_price_id, 'to', v_new));
END;
$$;
REVOKE ALL ON FUNCTION public.po_set_plan_paddle_price_id(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.po_set_plan_paddle_price_id(uuid, text) TO authenticated;

-- =============================================================================
-- Post-apply verification (as a signed-in platform admin):
--   SELECT public.po_set_plan_paddle_price_id(
--     (SELECT id FROM public.plans WHERE name='Canopy'), 'pri_test_placeholder');
--   SELECT name, paddle_price_id FROM public.plans ORDER BY price_cents;
--   SELECT public.po_set_plan_paddle_price_id(
--     (SELECT id FROM public.plans WHERE name='Canopy'), NULL); -- clears it back
--   -- as a non-admin: expect "Not authorized"
-- =============================================================================
