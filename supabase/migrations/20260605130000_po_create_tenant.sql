-- =============================================================================
-- PO can create a tenant (workspace) for an existing user account.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.po_create_tenant(p_name text, p_owner_email text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tid uuid;
  v_plan public.plans%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF COALESCE(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Workspace name is required'; END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(p_owner_email);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No account exists for %, ask them to sign up first', p_owner_email;
  END IF;

  INSERT INTO public.tenants (name, created_by) VALUES (p_name, v_uid) RETURNING id INTO v_tid;
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_tid, v_uid, 'owner', 'active');

  SELECT * INTO v_plan FROM public.plans WHERE name = 'Free' LIMIT 1;
  IF v_plan.id IS NOT NULL THEN
    INSERT INTO public.subscriptions (tenant_id, user_id, plan_id, plan_name, status, provider, currency)
    VALUES (v_tid, v_uid, v_plan.id, v_plan.name, 'active', 'manual', v_plan.currency);
  END IF;

  PERFORM public.log_audit(v_tid, 'tenant.create', 'tenant', v_tid::text,
    jsonb_build_object('name', p_name, 'owner', p_owner_email));
  RETURN v_tid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_create_tenant(text, text) TO authenticated;
