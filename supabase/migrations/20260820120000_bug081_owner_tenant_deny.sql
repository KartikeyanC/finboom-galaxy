-- BUG-081 — a PO's tenant-level module deny-list did not bind the workspace
-- owner. get_effective_menus() returned plan_menus() immediately for
-- role = 'owner', before the tenant.menu_overrides->'deny' list was even
-- read, so po_set_tenant_menus(tenant, {"deny": [...]}) restricted every
-- collaborator but left the owner with full plan access — and, since Stage
-- 2.15 made menu gating a real data boundary (not just navigation), full
-- data access on the denied tables too. PoTenants.tsx already advertises
-- "N / 14 modules enabled" as if the figure binds the whole workspace; this
-- makes that true.
--
-- Fix: apply the tenant-level deny list before the owner short-circuit, not
-- after. Member-level overrides (menu_overrides on tenant_members — allow-
-- lists aimed at an individual collaborator) still never apply to the
-- owner: those are a narrower grant/restriction on one person's membership,
-- not the PO's workspace-wide control, and an owner must never be lockable
-- out of their own workspace by a member-level override, only by the PO's
-- own tenant-level one.
CREATE OR REPLACE FUNCTION public.get_effective_menus(p_tenant_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_member_overrides jsonb;
  v_tenant_overrides jsonb;
  v_base text[];
  v_deny text[];
  v_allow text[];
  v_result text[];
BEGIN
  SELECT role, menu_overrides INTO v_role, v_member_overrides
  FROM public.tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = auth.uid() AND status = 'active';

  IF v_role IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  -- Plan defines the ceiling.
  v_base := public.plan_menus(p_tenant_id);

  SELECT menu_overrides INTO v_tenant_overrides FROM public.tenants WHERE id = p_tenant_id;

  v_result := v_base;
  IF v_tenant_overrides ? 'deny' THEN
    SELECT array_agg(x) INTO v_deny FROM jsonb_array_elements_text(v_tenant_overrides->'deny') AS x;
    IF v_deny IS NOT NULL THEN
      SELECT array_agg(m) INTO v_result FROM unnest(v_result) AS m WHERE m <> ALL (v_deny);
    END IF;
  END IF;

  -- The tenant-level deny now applies to the owner too. Member-level
  -- overrides remain collaborator-only: an owner is never narrowed by a
  -- per-member allow-list.
  IF v_role = 'owner' THEN
    RETURN COALESCE(v_result, ARRAY[]::text[]);
  END IF;

  IF v_member_overrides ? 'allow' THEN
    SELECT array_agg(x) INTO v_allow FROM jsonb_array_elements_text(v_member_overrides->'allow') AS x;
    IF v_allow IS NULL THEN
      v_result := ARRAY[]::text[];
    ELSE
      SELECT array_agg(m) INTO v_result FROM unnest(COALESCE(v_result, ARRAY[]::text[])) AS m WHERE m = ANY (v_allow);
    END IF;
  END IF;

  RETURN COALESCE(v_result, ARRAY[]::text[]);
END;
$$;
