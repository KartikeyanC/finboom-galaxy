-- =============================================================================
-- PO plan menu editor — let the Product Owner set which menus each plan exposes.
-- plans.menu_set is the ceiling used by plan_menus() / get_effective_menus().
-- =============================================================================
CREATE OR REPLACE FUNCTION public.po_set_plan_menus(p_plan_id uuid, p_menus jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.plans SET menu_set = COALESCE(p_menus, '[]'::jsonb) WHERE id = p_plan_id;
  PERFORM public.log_audit(NULL, 'plan.menus', 'plan', p_plan_id::text, p_menus);
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_set_plan_menus(uuid, jsonb) TO authenticated;
