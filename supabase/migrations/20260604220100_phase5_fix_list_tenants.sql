-- Fix: qualify columns in po_list_tenants LATERAL subquery to avoid collision
-- with the function's OUT column names (plan_name/status).
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
                     AND s.sub_status IN ('active','trialing') THEN 'expired' ELSE s.sub_status END,
           t.created_at
    FROM public.tenants t
    LEFT JOIN public.tenant_members om ON om.tenant_id = t.id AND om.role = 'owner'
    LEFT JOIN auth.users ou ON ou.id = om.user_id
    LEFT JOIN LATERAL (
      SELECT s2.plan_name AS plan_name, s2.status AS sub_status, s2.current_period_end AS current_period_end
      FROM public.subscriptions s2
      WHERE s2.tenant_id = t.id
      ORDER BY s2.current_period_end DESC NULLS LAST
      LIMIT 1
    ) s ON true
    WHERE t.status <> 'deleted'
    ORDER BY t.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_list_tenants() TO authenticated;
