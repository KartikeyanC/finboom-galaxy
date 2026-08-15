-- =============================================================================
-- Phase 3 — Server-enforced permissions
-- audit_log + get_effective_menus() + list_tenant_members() + member mgmt RPCs.
-- Replaces the localStorage AccessContext permissions with server truth.
-- =============================================================================

-- ---- audit_log -------------------------------------------------------------
CREATE TABLE public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id     uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  action        text NOT NULL,
  entity        text,
  entity_id     text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_tenant ON public.audit_log(tenant_id, created_at DESC);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

-- Tenant owners can read their own tenant's audit trail; PO can read all.
CREATE POLICY audit_select ON public.audit_log FOR SELECT
  USING (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin());

-- Internal writer (SECURITY DEFINER → bypasses RLS).
CREATE OR REPLACE FUNCTION public.log_audit(
  p_tenant_id uuid, p_action text, p_entity text, p_entity_id text, p_metadata jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_user_id, tenant_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(), p_tenant_id, p_action, p_entity, p_entity_id, p_metadata);
END;
$$;

-- ---- canonical feature menu list -------------------------------------------
CREATE OR REPLACE FUNCTION public.all_feature_menus()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'dashboard','income','expenses','investments','budget','goals','reminders',
    'calculator','bill-scan','import','insurance','budget-allocator','net-worth',
    'subscriptions','trips'
  ];
$$;

-- ---- get_effective_menus(tenant) for the CURRENT user ----------------------
-- Phase 3: base = all feature menus (plan layer comes in Phase 4).
-- Effective = base − tenant deny, then (for non-owners) ∩ member allow-list.
CREATE OR REPLACE FUNCTION public.get_effective_menus(p_tenant_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_member_overrides jsonb;
  v_tenant_overrides jsonb;
  v_base text[] := public.all_feature_menus();
  v_deny text[];
  v_allow text[];
  v_result text[];
BEGIN
  SELECT role, menu_overrides INTO v_role, v_member_overrides
  FROM public.tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = auth.uid() AND status = 'active';

  IF v_role IS NULL THEN
    RETURN ARRAY[]::text[];  -- not a member
  END IF;

  SELECT menu_overrides INTO v_tenant_overrides FROM public.tenants WHERE id = p_tenant_id;

  -- Owners get everything (ignore tenant/member restrictions).
  IF v_role = 'owner' THEN
    RETURN v_base;
  END IF;

  -- tenant-wide deny list
  v_result := v_base;
  IF v_tenant_overrides ? 'deny' THEN
    SELECT array_agg(x) INTO v_deny FROM jsonb_array_elements_text(v_tenant_overrides->'deny') AS x;
    IF v_deny IS NOT NULL THEN
      SELECT array_agg(m) INTO v_result FROM unnest(v_result) AS m WHERE m <> ALL (v_deny);
    END IF;
  END IF;

  -- member allow-list (if present, intersect)
  IF v_member_overrides ? 'allow' THEN
    SELECT array_agg(x) INTO v_allow FROM jsonb_array_elements_text(v_member_overrides->'allow') AS x;
    IF v_allow IS NULL THEN
      v_result := ARRAY[]::text[];
    ELSE
      SELECT array_agg(m) INTO v_result FROM unnest(v_result) AS m WHERE m = ANY (v_allow);
    END IF;
  END IF;

  RETURN COALESCE(v_result, ARRAY[]::text[]);
END;
$$;

-- ---- list_tenant_members(tenant) -------------------------------------------
-- Returns members + their profile info. Caller must be a member of the tenant.
CREATE OR REPLACE FUNCTION public.list_tenant_members(p_tenant_id uuid)
RETURNS TABLE (
  user_id uuid, role text, status text, menu_overrides jsonb,
  display_name text, email text, username text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id, 'viewer') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT m.user_id, m.role, m.status, m.menu_overrides,
           p.display_name, u.email::text, p.username
    FROM public.tenant_members m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.tenant_id = p_tenant_id
    ORDER BY (m.role = 'owner') DESC, m.created_at ASC;
END;
$$;

-- ---- member management RPCs (owner or PO) ----------------------------------
CREATE OR REPLACE FUNCTION public.invite_member(
  p_tenant_id uuid, p_email text, p_role text, p_menus jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid;
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id, 'owner') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_role NOT IN ('admin','viewer') THEN
    RAISE EXCEPTION 'Role must be admin or viewer';
  END IF;
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(p_email);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No account exists for %, ask them to sign up first', p_email;
  END IF;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, menu_overrides, status, invited_by)
  VALUES (p_tenant_id, v_uid, p_role, p_menus, 'active', auth.uid())
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, menu_overrides = EXCLUDED.menu_overrides, status = 'active';

  PERFORM public.log_audit(p_tenant_id, 'member.invite', 'tenant_member', v_uid::text,
    jsonb_build_object('email', p_email, 'role', p_role));
  RETURN v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_member_role(
  p_tenant_id uuid, p_user_id uuid, p_role text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id, 'owner') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_role NOT IN ('admin','viewer') THEN
    RAISE EXCEPTION 'Role must be admin or viewer';
  END IF;
  UPDATE public.tenant_members SET role = p_role
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND role <> 'owner';
  PERFORM public.log_audit(p_tenant_id, 'member.role', 'tenant_member', p_user_id::text,
    jsonb_build_object('role', p_role));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_menus(
  p_tenant_id uuid, p_user_id uuid, p_menus jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id, 'owner') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.tenant_members SET menu_overrides = p_menus
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND role <> 'owner';
  PERFORM public.log_audit(p_tenant_id, 'member.menus', 'tenant_member', p_user_id::text, p_menus);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_member(
  p_tenant_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id, 'owner') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND role <> 'owner';
  PERFORM public.log_audit(p_tenant_id, 'member.revoke', 'tenant_member', p_user_id::text, NULL);
END;
$$;

-- ---- execute grants --------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_effective_menus(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_members(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_member(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_menus(uuid, uuid, jsonb)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_member(uuid, uuid)            TO authenticated;
