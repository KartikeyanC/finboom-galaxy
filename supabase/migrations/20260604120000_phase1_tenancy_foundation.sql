-- =============================================================================
-- Phase 1 — Tenancy foundation
-- Tables: profiles, tenants, tenant_members, platform_admins
-- Helpers: is_tenant_member(), is_platform_admin(), current_tenant_id()
-- Signup trigger + backfill of existing auth.users into personal tenants.
-- NOTE: does NOT modify the existing finance tables (that is Phase 2).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles  (extends auth.users with login-lookup fields)
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    text UNIQUE,
  mobile      text UNIQUE,
  display_name text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- tenants  (one workspace; tenant = individual, may have collaborators)
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  menu_overrides jsonb,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- tenant_members  (maps auth users to tenants with a role) — replaces the old
-- localStorage AccessContext permissions.
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenant_members (
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role           text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','viewer')),
  menu_overrides jsonb,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','revoked')),
  invited_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tenant_members_user ON public.tenant_members(user_id);

-- -----------------------------------------------------------------------------
-- platform_admins  (Product Owner master admins). Not tenant members.
-- -----------------------------------------------------------------------------
CREATE TABLE public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Helper functions (SECURITY DEFINER → run as owner, bypass RLS, no recursion)
-- =============================================================================

-- Is the current user a Product Owner / platform admin?
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

-- Is the current user an active member of p_tenant_id with role >= p_min_role?
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid, p_min_role text DEFAULT 'viewer')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members m
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND (CASE m.role     WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END)
       >= (CASE p_min_role WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END)
  );
$$;

-- The current user's primary (first active) tenant.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.tenant_id
  FROM public.tenant_members m
  WHERE m.user_id = auth.uid() AND m.status = 'active'
  ORDER BY m.created_at ASC
  LIMIT 1;
$$;

-- =============================================================================
-- RLS policies
-- =============================================================================

-- profiles: a user manages only their own row (PO can read all).
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_platform_admin());
CREATE POLICY profiles_insert ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- tenants: members can read; owners can update; PO can do all.
CREATE POLICY tenants_select ON public.tenants FOR SELECT
  USING (public.is_tenant_member(id, 'viewer') OR public.is_platform_admin());
CREATE POLICY tenants_insert ON public.tenants FOR INSERT
  WITH CHECK (created_by = auth.uid());
CREATE POLICY tenants_update ON public.tenants FOR UPDATE
  USING (public.is_tenant_member(id, 'owner') OR public.is_platform_admin())
  WITH CHECK (public.is_tenant_member(id, 'owner') OR public.is_platform_admin());
CREATE POLICY tenants_delete ON public.tenants FOR DELETE
  USING (public.is_tenant_member(id, 'owner') OR public.is_platform_admin());

-- tenant_members: a user sees their own rows + co-members of their tenants;
-- only owners (or PO) mutate membership.
CREATE POLICY tm_select ON public.tenant_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_tenant_member(tenant_id, 'viewer') OR public.is_platform_admin());
CREATE POLICY tm_insert ON public.tenant_members FOR INSERT
  WITH CHECK (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin());
CREATE POLICY tm_update ON public.tenant_members FOR UPDATE
  USING (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin())
  WITH CHECK (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin());
CREATE POLICY tm_delete ON public.tenant_members FOR DELETE
  USING (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin());

-- platform_admins: a user can see whether they are one; PO sees all.
CREATE POLICY pa_select ON public.platform_admins FOR SELECT
  USING (user_id = auth.uid() OR public.is_platform_admin());

-- =============================================================================
-- Grants (RLS still gates row access)
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members  TO authenticated;
GRANT SELECT                         ON public.platform_admins TO authenticated;
GRANT ALL ON public.profiles, public.tenants, public.tenant_members, public.platform_admins TO service_role;

-- =============================================================================
-- updated_at triggers (reuse existing public.update_updated_at_column())
-- =============================================================================
CREATE TRIGGER trg_profiles_updated       BEFORE UPDATE ON public.profiles       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tenants_updated        BEFORE UPDATE ON public.tenants        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tenant_members_updated BEFORE UPDATE ON public.tenant_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Signup trigger: every new auth user gets a profile + personal tenant + owner
-- membership.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
  v_tenant_id uuid;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, username, mobile, display_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'mobile'),
    v_name
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tenants (name, created_by)
  VALUES (v_name || '''s Workspace', NEW.id)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- Backfill existing users → personal tenant + owner membership + profile.
-- =============================================================================
INSERT INTO public.profiles (id, display_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  r record;
  v_tid uuid;
BEGIN
  FOR r IN
    SELECT u.id,
           COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)) AS nm
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_members m WHERE m.user_id = u.id
    )
  LOOP
    INSERT INTO public.tenants (name, created_by)
    VALUES (r.nm || '''s Workspace', r.id)
    RETURNING id INTO v_tid;

    INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
    VALUES (v_tid, r.id, 'owner', 'active');
  END LOOP;
END $$;
