-- =============================================================================
-- Phase 5 — Product Owner console (backend)
-- 16-digit secret support + PO aggregate RPCs + PO management RPCs (audited).
-- PO data access is aggregates-only via SECURITY DEFINER RPCs; PO never reads
-- raw finance rows directly.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.platform_admins ADD COLUMN IF NOT EXISTS secret_hash text;

-- ---- PO sets/rotates their own 16-digit secret ------------------------------
CREATE OR REPLACE FUNCTION public.po_set_secret(p_secret text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_secret !~ '^[0-9]{16}$' THEN
    RAISE EXCEPTION 'Secret must be exactly 16 digits';
  END IF;
  UPDATE public.platform_admins
  SET secret_hash = crypt(p_secret, gen_salt('bf'))
  WHERE user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_set_secret(text) TO authenticated;

-- ---- identifier resolution + secret verify (called by po-auth edge fn) ------
-- Resolve email/username/mobile → a PLATFORM ADMIN account.
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
    WHERE lower(u.email) = lower(p_identifier)
       OR lower(p.username) = lower(p_identifier)
       OR p.mobile = p_identifier
    LIMIT 1;
END;
$$;

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
    WHERE (lower(u.email) = lower(p_identifier)
           OR lower(p.username) = lower(p_identifier)
           OR p.mobile = p_identifier)
      AND pa.secret_hash IS NOT NULL
      AND pa.secret_hash = crypt(p_secret, pa.secret_hash)
    LIMIT 1;
END;
$$;

-- These two are only for the trusted edge function (service_role).
REVOKE EXECUTE ON FUNCTION public.po_resolve_identifier(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.po_verify_secret(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.po_resolve_identifier(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.po_verify_secret(text, text) TO service_role;

-- ---- PO aggregate dashboard (aggregates only) ------------------------------
CREATE OR REPLACE FUNCTION public.po_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'total_tenants',        (SELECT count(*) FROM public.tenants WHERE status <> 'deleted'),
    'active_tenants',       (SELECT count(*) FROM public.tenants WHERE status = 'active'),
    'suspended_tenants',    (SELECT count(*) FROM public.tenants WHERE status = 'suspended'),
    'total_users',          (SELECT count(*) FROM auth.users),
    'total_collaborators',  (SELECT count(*) FROM public.tenant_members WHERE role <> 'owner' AND status = 'active'),
    'active_subscriptions',  (SELECT count(*) FROM public.subscriptions
                              WHERE status IN ('active','trialing')
                                AND (current_period_end IS NULL OR current_period_end > now())),
    'expired_subscriptions', (SELECT count(*) FROM public.subscriptions
                              WHERE current_period_end IS NOT NULL AND current_period_end < now()),
    'plan_breakdown',       (SELECT COALESCE(jsonb_object_agg(plan_name, c), '{}'::jsonb)
                              FROM (SELECT COALESCE(plan_name,'Unknown') plan_name, count(*) c
                                    FROM public.subscriptions GROUP BY 1) z),
    'new_tenants_30d',      (SELECT count(*) FROM public.tenants WHERE created_at > now() - interval '30 days'),
    'finance_totals',       (SELECT jsonb_build_object(
                               'income',  COALESCE(sum(amount) FILTER (WHERE type='income'),0),
                               'expense', COALESCE(sum(amount) FILTER (WHERE type='expense'),0))
                              FROM public.transactions)
  ) INTO v;
  RETURN v;
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_dashboard_stats() TO authenticated;

-- ---- PO recent activity (from audit_log) -----------------------------------
CREATE OR REPLACE FUNCTION public.po_recent_activity(p_limit int DEFAULT 25)
RETURNS TABLE (id uuid, actor_email text, tenant_name text, action text, entity text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT a.id, u.email::text, t.name, a.action, a.entity, a.created_at
    FROM public.audit_log a
    LEFT JOIN auth.users u ON u.id = a.actor_user_id
    LEFT JOIN public.tenants t ON t.id = a.tenant_id
    ORDER BY a.created_at DESC
    LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_recent_activity(int) TO authenticated;

-- ---- PO tenant list --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.po_list_tenants()
RETURNS TABLE (
  id uuid, name text, status text, owner_email text, member_count bigint,
  plan_name text, sub_status text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT t.id, t.name, t.status,
           ou.email::text AS owner_email,
           (SELECT count(*) FROM public.tenant_members m WHERE m.tenant_id = t.id AND m.status='active'),
           s.plan_name,
           CASE WHEN s.current_period_end IS NOT NULL AND s.current_period_end < now()
                     AND s.status IN ('active','trialing') THEN 'expired' ELSE s.status END,
           t.created_at
    FROM public.tenants t
    LEFT JOIN public.tenant_members om ON om.tenant_id = t.id AND om.role = 'owner'
    LEFT JOIN auth.users ou ON ou.id = om.user_id
    LEFT JOIN LATERAL (
      SELECT plan_name, status, current_period_end FROM public.subscriptions s2
      WHERE s2.tenant_id = t.id ORDER BY current_period_end DESC NULLS LAST LIMIT 1
    ) s ON true
    WHERE t.status <> 'deleted'
    ORDER BY t.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_list_tenants() TO authenticated;

-- ---- PO management RPCs (audited) ------------------------------------------
CREATE OR REPLACE FUNCTION public.po_set_tenant_status(p_tenant_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_status NOT IN ('active','suspended','deleted') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.tenants SET status = p_status WHERE id = p_tenant_id;
  PERFORM public.log_audit(p_tenant_id, 'tenant.status', 'tenant', p_tenant_id::text, jsonb_build_object('status', p_status));
END; $$;

CREATE OR REPLACE FUNCTION public.po_assign_plan(p_tenant_id uuid, p_plan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan public.plans%ROWTYPE; v_owner uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Plan not found'; END IF;
  SELECT user_id INTO v_owner FROM public.tenant_members WHERE tenant_id = p_tenant_id AND role='owner' LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE tenant_id = p_tenant_id) THEN
    UPDATE public.subscriptions
    SET plan_id = v_plan.id, plan_name = v_plan.name, status = 'active', provider = 'manual'
    WHERE tenant_id = p_tenant_id;
  ELSE
    INSERT INTO public.subscriptions (tenant_id, user_id, plan_id, plan_name, status, provider, currency)
    VALUES (p_tenant_id, v_owner, v_plan.id, v_plan.name, 'active', 'manual', v_plan.currency);
  END IF;
  PERFORM public.log_audit(p_tenant_id, 'tenant.plan', 'subscription', p_tenant_id::text, jsonb_build_object('plan', v_plan.name));
END; $$;

CREATE OR REPLACE FUNCTION public.po_set_tenant_menus(p_tenant_id uuid, p_menus jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.tenants SET menu_overrides = p_menus WHERE id = p_tenant_id;
  PERFORM public.log_audit(p_tenant_id, 'tenant.menus', 'tenant', p_tenant_id::text, p_menus);
END; $$;

CREATE OR REPLACE FUNCTION public.po_delete_tenant(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  PERFORM public.log_audit(p_tenant_id, 'tenant.delete', 'tenant', p_tenant_id::text, NULL);
  DELETE FROM public.tenants WHERE id = p_tenant_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.po_set_tenant_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_assign_plan(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_set_tenant_menus(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_delete_tenant(uuid) TO authenticated;
