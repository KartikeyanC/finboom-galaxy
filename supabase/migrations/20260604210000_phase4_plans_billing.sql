-- =============================================================================
-- Phase 4 — Plans & subscription monitoring
-- plans (seed Free/Pro) + tenant billing on the existing Paddle `subscriptions`
-- table + plan-aware get_effective_menus + expiry handling.
-- =============================================================================

-- ---- plans -----------------------------------------------------------------
CREATE TABLE public.plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  price_cents integer NOT NULL DEFAULT 0,
  currency    text NOT NULL DEFAULT 'USD',
  interval    text NOT NULL DEFAULT 'month' CHECK (interval IN ('month','year')),
  -- menu_set: jsonb array of menu ids, or ["*"] meaning all feature menus.
  menu_set    jsonb NOT NULL DEFAULT '["*"]'::jsonb,
  limits      jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.plans TO authenticated, anon;
GRANT ALL ON public.plans TO service_role;
-- Plans are public catalog data (read-only to clients).
CREATE POLICY plans_select ON public.plans FOR SELECT USING (true);

INSERT INTO public.plans (name, price_cents, currency, interval, menu_set) VALUES
  ('Free', 0, 'USD', 'month',
    '["dashboard","income","expenses","budget","goals","calculator","reminders","accounts"]'::jsonb),
  ('Pro', 900, 'USD', 'month', '["*"]'::jsonb);

-- ---- tenant billing on existing subscriptions table ------------------------
ALTER TABLE public.subscriptions ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD COLUMN plan_id   uuid REFERENCES public.plans(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD COLUMN provider  text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','paddle'));

-- Backfill tenant_id from each row's owner personal tenant (dev: none yet).
UPDATE public.subscriptions s SET tenant_id = m.tenant_id
  FROM public.tenant_members m
  WHERE m.user_id = s.user_id AND m.role = 'owner' AND m.status = 'active'
    AND s.tenant_id IS NULL;

CREATE INDEX idx_subscriptions_tenant ON public.subscriptions(tenant_id);

-- Swap per-user RLS for tenant-membership RLS (billing-api uses service_role).
DROP POLICY IF EXISTS sub_select_own ON public.subscriptions;
DROP POLICY IF EXISTS sub_insert_own ON public.subscriptions;
DROP POLICY IF EXISTS sub_update_own ON public.subscriptions;
DROP POLICY IF EXISTS sub_delete_own ON public.subscriptions;
CREATE POLICY sub_select ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, 'viewer') OR public.is_platform_admin());
CREATE POLICY sub_update ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin())
  WITH CHECK (public.is_tenant_member(tenant_id, 'owner') OR public.is_platform_admin());

-- ---- plan_menus(tenant): the menu ceiling from the active plan -------------
-- Active = status active/trialing AND not past current_period_end.
-- Fallback (no active sub) = Free plan menus.
CREATE OR REPLACE FUNCTION public.plan_menus(p_tenant_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_set jsonb;
BEGIN
  SELECT p.menu_set INTO v_set
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.tenant_id = p_tenant_id
    AND s.status IN ('active','trialing')
    AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ORDER BY s.current_period_end DESC NULLS LAST
  LIMIT 1;

  IF v_set IS NULL THEN
    SELECT menu_set INTO v_set FROM public.plans WHERE name = 'Free' LIMIT 1;
  END IF;

  IF v_set IS NULL OR v_set @> '["*"]'::jsonb THEN
    RETURN public.all_feature_menus();
  END IF;

  RETURN ARRAY(SELECT jsonb_array_elements_text(v_set));
END;
$$;

-- ---- get_effective_menus: now layered plan ⊕ tenant ⊕ member ----------------
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

  IF v_role = 'owner' THEN
    RETURN v_base;
  END IF;

  SELECT menu_overrides INTO v_tenant_overrides FROM public.tenants WHERE id = p_tenant_id;

  v_result := v_base;
  IF v_tenant_overrides ? 'deny' THEN
    SELECT array_agg(x) INTO v_deny FROM jsonb_array_elements_text(v_tenant_overrides->'deny') AS x;
    IF v_deny IS NOT NULL THEN
      SELECT array_agg(m) INTO v_result FROM unnest(v_result) AS m WHERE m <> ALL (v_deny);
    END IF;
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

-- ---- tenant_subscription_status(tenant): date-aware status -----------------
CREATE OR REPLACE FUNCTION public.tenant_subscription_status(p_tenant_id uuid)
RETURNS TABLE (plan_name text, status text, current_period_end timestamptz, provider text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_tenant_member(p_tenant_id, 'viewer') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT COALESCE(p.name, s.plan_name) AS plan_name,
           CASE
             WHEN s.current_period_end IS NOT NULL AND s.current_period_end < now()
                  AND s.status IN ('active','trialing') THEN 'expired'
             ELSE s.status
           END AS status,
           s.current_period_end,
           s.provider
    FROM public.subscriptions s
    LEFT JOIN public.plans p ON p.id = s.plan_id
    WHERE s.tenant_id = p_tenant_id
    ORDER BY s.current_period_end DESC NULLS LAST
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.plan_menus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_subscription_status(uuid) TO authenticated;

-- ---- expiry housekeeping ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE status IN ('active','trialing')
    AND current_period_end IS NOT NULL
    AND current_period_end < now();
$$;

-- ---- signup trigger now attaches a default Free subscription ---------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  SELECT * INTO v_plan FROM public.plans WHERE name = 'Free' LIMIT 1;
  IF v_plan.id IS NOT NULL THEN
    INSERT INTO public.subscriptions (tenant_id, user_id, plan_id, plan_name, status, provider, currency)
    VALUES (v_tenant_id, NEW.id, v_plan.id, v_plan.name, 'active', 'manual', v_plan.currency);
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: any existing tenant without a subscription gets Free.
INSERT INTO public.subscriptions (tenant_id, user_id, plan_id, plan_name, status, provider, currency)
SELECT t.id, t.created_by, p.id, p.name, 'active', 'manual', p.currency
FROM public.tenants t
CROSS JOIN LATERAL (SELECT * FROM public.plans WHERE name = 'Free' LIMIT 1) p
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id);
