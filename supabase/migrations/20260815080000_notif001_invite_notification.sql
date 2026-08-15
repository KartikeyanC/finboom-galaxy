-- =============================================================================
-- NOTIF-001 — inviting an existing user creates no notification for them.
--
-- Stage 3.8's `create_invitation()` (20260806190000_stage3_invitations.sql)
-- replaced the old `invite_member()` with a token-based invite/accept flow,
-- but never carried over the `create_notification()` call that
-- 20260604230000_phase6_notifications_audit.sql had added to the OLD
-- `invite_member()`. The result: nobody invited through the app's real,
-- current invite path (WorkspaceManage.tsx -> create_invitation) is ever
-- notified — confirmed live 2026-08-15 (Stage 0.10 NOTIF suite run): a real
-- invite + accept round-trip produced zero rows in `notifications` for the
-- invitee, while the same test against the superseded `invite_member()`
-- (still present, unused by the app) DID notify, which is what made the gap
-- visible rather than assumed.
--
-- Notifying at invite-time (not at accept-time) matches phase6's original
-- intent and needs no lookup of whether the invitee already has an account:
-- if they do, `accept_invitation()`'s own auth.uid() check already scopes
-- acceptance to the exact invited address, so notifying eagerly cannot reach
-- the wrong person. If they don't have an account yet, the notification
-- simply has no reader until they sign up and accept — same as an email
-- would.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_tenant_id uuid,
  p_email     text,
  p_role      text,
  p_menus     jsonb DEFAULT NULL
)
RETURNS TABLE (invitation_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_token text;
  v_days  integer;
  v_id    uuid;
  v_exp   timestamptz;
  v_existing uuid;
  v_invitee  uuid;
  v_tname    text;
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id, 'owner') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_role NOT IN ('admin', 'viewer') THEN
    RAISE EXCEPTION 'Role must be admin or viewer';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'That does not look like an email address';
  END IF;

  SELECT tm.user_id INTO v_existing
    FROM public.tenant_members tm
    JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = p_tenant_id AND lower(u.email) = v_email
     AND tm.status = 'active';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'They are already a member of this workspace';
  END IF;

  SELECT days INTO v_days FROM public.retention_policy WHERE key = 'invitations';
  v_exp := now() + make_interval(days => COALESCE(v_days, 14));

  UPDATE public.invitations
     SET revoked_at = now()
   WHERE tenant_id = p_tenant_id AND email = v_email
     AND accepted_at IS NULL AND revoked_at IS NULL;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.invitations
    (tenant_id, email, role, menu_overrides, token_hash, invited_by, expires_at)
  VALUES
    (p_tenant_id, v_email, p_role, p_menus,
     encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), v_exp)
  RETURNING id INTO v_id;

  PERFORM public.log_audit(p_tenant_id, 'member.invited', 'invitation', v_id::text,
    jsonb_build_object('email', v_email, 'role', p_role));

  -- Notify now, only if the address already belongs to a real account —
  -- create_notification needs a user_id, and there is nobody to notify yet
  -- for an unregistered address (they will see the invite once they sign up
  -- and it is claimed, same as claim_invitations_for_user's own audit trail).
  SELECT id INTO v_invitee FROM auth.users WHERE lower(email) = v_email;
  IF v_invitee IS NOT NULL THEN
    SELECT name INTO v_tname FROM public.tenants WHERE id = p_tenant_id;
    PERFORM public.create_notification(v_invitee, p_tenant_id, 'member.invited',
      'Added to ' || COALESCE(v_tname, 'a workspace'),
      'You now have ' || p_role || ' access.',
      jsonb_build_object('role', p_role));
  END IF;

  RETURN QUERY SELECT v_id, v_token, v_exp;
END;
$$;
