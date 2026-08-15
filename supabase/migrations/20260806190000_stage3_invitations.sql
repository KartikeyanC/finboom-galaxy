-- ===========================================================================
-- Stage 3.8 / BUG-020 — invite people who have not signed up yet.
--
-- `invite_member` required an existing `auth.users` row and otherwise raised
-- "No account exists for <email>, ask them to sign up first". So inviting a
-- colleague meant telling them out-of-band to register, waiting, and then
-- inviting them — and if they signed up with a different address, starting over.
--
-- ---- Shape ----------------------------------------------------------------
--
-- A pending invitation is a row holding the email, the role, the menu overrides
-- and a token. On signup, `handle_new_user()` claims any invitation matching
-- the new user's email and turns it into a real membership. The inviter's
-- intent therefore survives the gap, and the new user lands already a member.
--
-- ---- The token is a secret, so it is stored hashed ------------------------
--
-- Anyone holding the token can join a workspace, which makes it a credential.
-- The table stores `token_hash` (SHA-256) and the raw token is returned to the
-- inviter EXACTLY ONCE, from the RPC that creates it. There is no way to read
-- it back afterwards — same reasoning as the PO secret in Phase 5.
--
-- ---- No email dependency --------------------------------------------------
--
-- `send-email` is deliberately NOT deployed (BUG-005: it was an authenticated
-- open mail relay). So the invite flow must be complete WITHOUT it: the RPC
-- returns a link the inviter can copy and send however they like. When email is
-- wired up later it becomes a convenience, not a prerequisite — which is the
-- right dependency direction anyway.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin', 'viewer')),
  menu_overrides jsonb,
  token_hash  text NOT NULL,
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Emails are matched case-insensitively everywhere, so store them folded.
  CONSTRAINT invitations_email_lower CHECK (email = lower(email))
);

-- One LIVE invitation per email per workspace. Partial, so a superseded or
-- accepted invitation does not block sending a fresh one.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_one_pending
  ON public.invitations (tenant_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS invitations_email_idx ON public.invitations (email);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

-- Owners manage their workspace's invitations. Note there is NO policy letting
-- an invitee read the row: they hold the token, and acceptance goes through a
-- SECURITY DEFINER function that checks it. Letting them SELECT would leak who
-- else has been invited.
DROP POLICY IF EXISTS invitations_select ON public.invitations;
CREATE POLICY invitations_select ON public.invitations FOR SELECT
  USING (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin());

DROP POLICY IF EXISTS invitations_write ON public.invitations;
CREATE POLICY invitations_write ON public.invitations FOR UPDATE
  USING (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin())
  WITH CHECK (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin());

DROP POLICY IF EXISTS invitations_delete ON public.invitations;
CREATE POLICY invitations_delete ON public.invitations FOR DELETE
  USING (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin());

-- No INSERT policy on purpose: invitations are only created through
-- create_invitation(), which hashes the token. A direct insert would have to
-- supply a hash, and nothing good comes of allowing that.

INSERT INTO public.retention_policy (key, days, description)
VALUES ('invitations', 14, 'Days a pending invitation stays valid before it expires.')
ON CONFLICT (key) DO NOTHING;

-- ---- create ---------------------------------------------------------------

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

  -- Already a member? Say so plainly instead of creating an invite that would
  -- do nothing when accepted.
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

  -- Supersede any live invitation for the same address rather than erroring on
  -- the unique index — re-inviting is a normal thing to do.
  UPDATE public.invitations
     SET revoked_at = now()
   WHERE tenant_id = p_tenant_id AND email = v_email
     AND accepted_at IS NULL AND revoked_at IS NULL;

  -- 32 random bytes, hex. gen_random_bytes is pgcrypto, which lives in the
  -- `extensions` schema on Supabase — hence the search_path above.
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.invitations
    (tenant_id, email, role, menu_overrides, token_hash, invited_by, expires_at)
  VALUES
    (p_tenant_id, v_email, p_role, p_menus,
     encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), v_exp)
  RETURNING id INTO v_id;

  PERFORM public.log_audit(p_tenant_id, 'member.invited', 'invitation', v_id::text,
    jsonb_build_object('email', v_email, 'role', p_role));

  -- The ONLY time the raw token is ever visible.
  RETURN QUERY SELECT v_id, v_token, v_exp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, text, text, jsonb) TO authenticated;

-- ---- accept ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_inv   public.invitations%ROWTYPE;
  v_uid   uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to accept an invitation';
  END IF;

  SELECT * INTO v_inv FROM public.invitations
   WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex');

  -- One message for every bad-token case: a distinct "expired" vs "not found"
  -- would let someone probe which tokens exist.
  IF v_inv.id IS NULL OR v_inv.revoked_at IS NOT NULL
     OR v_inv.accepted_at IS NOT NULL OR v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'That invitation link is not valid any more';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS DISTINCT FROM v_inv.email THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  INSERT INTO public.tenant_members
    (tenant_id, user_id, role, menu_overrides, status, invited_by)
  VALUES
    (v_inv.tenant_id, v_uid, v_inv.role, v_inv.menu_overrides, 'active', v_inv.invited_by)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
     SET role = EXCLUDED.role,
         menu_overrides = EXCLUDED.menu_overrides,
         status = 'active';

  UPDATE public.invitations
     SET accepted_at = now(), accepted_by = v_uid
   WHERE id = v_inv.id;

  PERFORM public.log_audit(v_inv.tenant_id, 'member.joined', 'invitation',
    v_inv.id::text, jsonb_build_object('email', v_inv.email, 'role', v_inv.role));

  RETURN jsonb_build_object('tenant_id', v_inv.tenant_id, 'role', v_inv.role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

-- ---- claim on signup ------------------------------------------------------
-- Someone invited before they had an account should not have to find the link
-- again after registering. `handle_new_user` claims every live invitation for
-- their address, so they sign up and are already in the right workspaces.

CREATE OR REPLACE FUNCTION public.claim_invitations_for_user(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_count integer := 0;
  r       record;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN RETURN 0; END IF;

  FOR r IN
    SELECT * FROM public.invitations
     WHERE email = v_email AND accepted_at IS NULL AND revoked_at IS NULL
       AND expires_at > now()
  LOOP
    INSERT INTO public.tenant_members
      (tenant_id, user_id, role, menu_overrides, status, invited_by)
    VALUES
      (r.tenant_id, p_user_id, r.role, r.menu_overrides, 'active', r.invited_by)
    ON CONFLICT (tenant_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, status = 'active';

    UPDATE public.invitations
       SET accepted_at = now(), accepted_by = p_user_id
     WHERE id = r.id;

    PERFORM public.log_audit(r.tenant_id, 'member.joined', 'invitation', r.id::text,
      jsonb_build_object('email', v_email, 'role', r.role, 'via', 'signup'));
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitations_for_user(uuid) FROM PUBLIC;

-- ---- list / revoke --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_invitations(p_tenant_id uuid)
RETURNS TABLE (
  id uuid, email text, role text, expires_at timestamptz,
  accepted_at timestamptz, created_at timestamptz, status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id, 'owner') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT i.id, i.email, i.role, i.expires_at, i.accepted_at, i.created_at,
           CASE
             WHEN i.accepted_at IS NOT NULL THEN 'accepted'
             WHEN i.revoked_at  IS NOT NULL THEN 'revoked'
             WHEN i.expires_at  < now()     THEN 'expired'
             ELSE 'pending'
           END
      FROM public.invitations i
     WHERE i.tenant_id = p_tenant_id
     ORDER BY i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.invitations WHERE id = p_invitation_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No such invitation';
  END IF;
  IF NOT (public.is_tenant_member(v_tenant, 'owner') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.invitations SET revoked_at = now()
   WHERE id = p_invitation_id AND accepted_at IS NULL;

  PERFORM public.log_audit(v_tenant, 'member.invite_revoked', 'invitation',
    p_invitation_id::text, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_invitations(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid)  TO authenticated;

-- ===========================================================================
-- Post-apply verification
--
--   SELECT * FROM public.create_invitation('<tenant>', 'New@Example.com', 'viewer');
--   -- returns the raw token exactly once; email is stored lower-cased
--   SELECT public.accept_invitation('<token>');   -- as the invited user
--   SELECT * FROM public.list_invitations('<tenant>');  -- status = accepted
--   SELECT public.accept_invitation('<token>');   -- 'not valid any more'
--   -- wrong-account acceptance is refused; a bogus token gives the same message
-- ===========================================================================

-- ---- wire the claim into signup ------------------------------------------
-- Verbatim copy of the current handle_new_user() with ONE addition at the end.
-- Copied rather than patched because there is no ALTER for a function body —
-- and the 2.15 lesson applies: diff this against the live definition before
-- editing it again, never rewrite it from memory.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_tenant_id uuid;
  v_plan public.plans%ROWTYPE;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, username, mobile, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username',
          COALESCE(NEW.phone, NEW.raw_user_meta_data->>'mobile'), v_name)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tenants (name, created_by)
  VALUES (v_name || '''s Workspace', NEW.id)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active');

  SELECT * INTO v_plan FROM public.default_plan();
  IF v_plan.id IS NOT NULL THEN
    INSERT INTO public.subscriptions (tenant_id, user_id, plan_id, plan_name, status, provider, currency)
    VALUES (v_tenant_id, NEW.id, v_plan.id, v_plan.name, 'active', 'manual', v_plan.currency);
  END IF;

  -- Stage 3.8: someone invited before they registered joins those workspaces
  -- now, in addition to getting their own. Wrapped so that a problem claiming
  -- an invitation can never block the signup itself — losing an invite is
  -- recoverable, a failed signup is not.
  BEGIN
    PERFORM public.claim_invitations_for_user(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'claim_invitations_for_user failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
