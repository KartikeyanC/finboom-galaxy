-- =============================================================================
-- Phase 6 — Notifications (in-app) + PO audit viewer
-- notifications table + create_notification() helper; events wired into
-- invite_member and po_set_tenant_status. PO audit log RPC.
-- =============================================================================

CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Users see and update (mark read) only their own notifications. Inserts happen
-- via SECURITY DEFINER helpers / service role only.
CREATE POLICY notif_select ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notif_update ON public.notifications FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---- helper to create a notification ---------------------------------------
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid, p_tenant_id uuid, p_type text, p_title text, p_body text DEFAULT NULL, p_payload jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, tenant_id, type, title, body, payload)
  VALUES (p_user_id, p_tenant_id, p_type, p_title, p_body, p_payload);
END;
$$;

-- ---- mark all read RPC -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.notifications SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ---- wire invite_member to notify the invited user -------------------------
CREATE OR REPLACE FUNCTION public.invite_member(
  p_tenant_id uuid, p_email text, p_role text, p_menus jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_tname text;
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

  SELECT name INTO v_tname FROM public.tenants WHERE id = p_tenant_id;
  PERFORM public.log_audit(p_tenant_id, 'member.invite', 'tenant_member', v_uid::text,
    jsonb_build_object('email', p_email, 'role', p_role));
  PERFORM public.create_notification(v_uid, p_tenant_id, 'member.invited',
    'Added to ' || COALESCE(v_tname, 'a workspace'),
    'You now have ' || p_role || ' access.', jsonb_build_object('role', p_role));
  RETURN v_uid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.invite_member(uuid, text, text, jsonb) TO authenticated;

-- ---- wire po_set_tenant_status to notify the owner on suspend --------------
CREATE OR REPLACE FUNCTION public.po_set_tenant_status(p_tenant_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_tname text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_status NOT IN ('active','suspended','deleted') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.tenants SET status = p_status WHERE id = p_tenant_id;
  PERFORM public.log_audit(p_tenant_id, 'tenant.status', 'tenant', p_tenant_id::text, jsonb_build_object('status', p_status));

  SELECT name INTO v_tname FROM public.tenants WHERE id = p_tenant_id;
  IF p_status IN ('suspended','active') THEN
    FOR r IN SELECT user_id FROM public.tenant_members WHERE tenant_id = p_tenant_id AND status = 'active'
    LOOP
      PERFORM public.create_notification(r.user_id, p_tenant_id, 'tenant.' || p_status,
        CASE WHEN p_status = 'suspended' THEN 'Workspace suspended' ELSE 'Workspace reactivated' END,
        COALESCE(v_tname, 'Your workspace') ||
        CASE WHEN p_status = 'suspended' THEN ' has been suspended by the administrator.' ELSE ' is active again.' END,
        NULL);
    END LOOP;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.po_set_tenant_status(uuid, text) TO authenticated;

-- ---- future: notify expiring subscriptions (call from cron when desired) ---
CREATE OR REPLACE FUNCTION public.notify_expiring_subscriptions(p_days int DEFAULT 7)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.tenant_id, m.user_id, s.plan_name, s.current_period_end
    FROM public.subscriptions s
    JOIN public.tenant_members m ON m.tenant_id = s.tenant_id AND m.role = 'owner'
    WHERE s.status IN ('active','trialing')
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end BETWEEN now() AND now() + make_interval(days => p_days)
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = m.user_id AND n.type = 'subscription.expiring'
          AND n.created_at > now() - interval '7 days'
      )
  LOOP
    PERFORM public.create_notification(r.user_id, r.tenant_id, 'subscription.expiring',
      'Subscription expiring soon',
      'Your ' || COALESCE(r.plan_name,'plan') || ' renews/expires on ' || to_char(r.current_period_end, 'YYYY-MM-DD') || '.',
      NULL);
  END LOOP;
END;
$$;

-- ---- PO audit log viewer ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.po_audit_log(p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, actor_email text, tenant_name text, action text, entity text,
  entity_id text, metadata jsonb, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT a.id, u.email::text, t.name, a.action, a.entity, a.entity_id, a.metadata, a.created_at
    FROM public.audit_log a
    LEFT JOIN auth.users u ON u.id = a.actor_user_id
    LEFT JOIN public.tenants t ON t.id = a.tenant_id
    ORDER BY a.created_at DESC
    LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_audit_log(int) TO authenticated;
