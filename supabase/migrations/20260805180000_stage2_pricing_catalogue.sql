-- =============================================================================
-- Stage 2 · 2.10 (BUG-019) — reconcile the landing pricing with the catalogue
--
-- The landing sold Roots ₹0 / Canopy ₹299 / Heritage ₹899 while `plans` held
-- Free $0 / Pro $9. Two prices, no link between them. After this migration
-- `plans` is the single source of truth and the landing cards reference a plan
-- BY NAME (`plan` on each card); the client derives price/period from the row.
--
-- Names change here (Free→Roots, Pro→Canopy) so three functions that looked the
-- fallback plan up by the literal 'Free' are rewritten to use a new
-- `is_default` flag instead. Nothing may reference a plan by name again.
--
-- NOTE: this overwrites site_settings.landing_pricing. That row had only ever
-- held its seeded value; if a PO has since edited the copy, re-apply their
-- wording from the PO console after this runs.
-- =============================================================================

-- ---- 1. mark the fallback plan ---------------------------------------------
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- At most one default plan.
CREATE UNIQUE INDEX IF NOT EXISTS plans_one_default
  ON public.plans ((is_default)) WHERE is_default;

-- ---- 2. rename to the marketing names (idempotent) -------------------------
UPDATE public.plans SET name = 'Roots'  WHERE name = 'Free';
UPDATE public.plans SET name = 'Canopy' WHERE name = 'Pro';

-- ---- 3. the catalogue ------------------------------------------------------
-- Prices are INR paise. menu_set is set on INSERT only: a PO may have tuned it
-- from /po/plans and this migration has no business overwriting that.
INSERT INTO public.plans (name, price_cents, currency, "interval", menu_set, is_active) VALUES
  ('Roots',        0, 'INR', 'month',
    '["dashboard","income","expenses","budget","goals","calculator","reminders","accounts"]'::jsonb, true),
  ('Canopy',   29900, 'INR', 'month', '["*"]'::jsonb, true),
  ('Heritage', 89900, 'INR', 'month', '["*"]'::jsonb, true)
ON CONFLICT (name) DO UPDATE SET
  price_cents = EXCLUDED.price_cents,
  currency    = EXCLUDED.currency,
  "interval"  = EXCLUDED."interval",
  is_active   = EXCLUDED.is_active;

UPDATE public.plans SET is_default = (name = 'Roots');

-- Keep the denormalised copies on subscriptions in step with the rename.
UPDATE public.subscriptions s
   SET plan_name = p.name
  FROM public.plans p
 WHERE p.id = s.plan_id AND s.plan_name IS DISTINCT FROM p.name;

-- Manual (PO-assigned) subscriptions carry the plan's currency; Paddle rows
-- carry whatever Paddle charged, so they are left alone.
UPDATE public.subscriptions s
   SET currency = p.currency
  FROM public.plans p
 WHERE p.id = s.plan_id AND s.provider = 'manual' AND s.currency IS DISTINCT FROM p.currency;

-- ---- 4. default_plan(): the one place that resolves the fallback plan ------
-- Internal helper. Not granted to anon/authenticated — it is only ever called
-- from SECURITY DEFINER functions below. Falls back to the cheapest active
-- plan if no row is flagged, so signup can never end up with no subscription.
CREATE OR REPLACE FUNCTION public.default_plan()
RETURNS public.plans
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.* FROM public.plans p
  WHERE p.is_active
  ORDER BY p.is_default DESC, p.price_cents ASC, p.created_at ASC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.default_plan() FROM PUBLIC;

-- ---- 5. rewrite the three functions that hardcoded name = 'Free' -----------

-- plan_menus(tenant): unchanged except for the fallback lookup.
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
    SELECT menu_set INTO v_set FROM public.default_plan();
  END IF;

  IF v_set IS NULL OR v_set @> '["*"]'::jsonb THEN
    RETURN public.all_feature_menus();
  END IF;

  RETURN ARRAY(SELECT jsonb_array_elements_text(v_set));
END;
$$;

-- Signup trigger: same body, default plan resolved by flag.
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

  SELECT * INTO v_plan FROM public.default_plan();
  IF v_plan.id IS NOT NULL THEN
    INSERT INTO public.subscriptions (tenant_id, user_id, plan_id, plan_name, status, provider, currency)
    VALUES (v_tenant_id, NEW.id, v_plan.id, v_plan.name, 'active', 'manual', v_plan.currency);
  END IF;

  RETURN NEW;
END;
$$;

-- PO-created workspaces: same.
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

  SELECT * INTO v_plan FROM public.default_plan();
  IF v_plan.id IS NOT NULL THEN
    INSERT INTO public.subscriptions (tenant_id, user_id, plan_id, plan_name, status, provider, currency)
    VALUES (v_tid, v_uid, v_plan.id, v_plan.name, 'active', 'manual', v_plan.currency);
  END IF;

  PERFORM public.log_audit(v_tid, 'tenant.create', 'tenant', v_tid::text,
    jsonb_build_object('name', p_name, 'owner', p_owner_email));
  RETURN v_tid;
END;
$$;

-- ---- 6. landing copy, linked to the catalogue ------------------------------
-- `plan` is the link. `price`/`period` stay in the JSON only as an offline
-- fallback for when the plans query has not resolved yet; the client prefers
-- the plan row whenever the name matches.
INSERT INTO public.site_settings (key, value) VALUES (
  'landing_pricing',
  '{
    "eyebrow": "Pricing",
    "title": "Quietly priced. Loudly worth it.",
    "cards": [
      {
        "plan": "Roots",
        "name": "Roots",
        "price": "Free",
        "period": "",
        "blurb": "For anyone starting the habit.",
        "features": ["Unlimited transactions", "1 budget cycle", "3 active goals", "Email digests"],
        "cta": "Start free",
        "ctaHref": "/auth",
        "highlight": false,
        "badge": ""
      },
      {
        "plan": "Canopy",
        "name": "Canopy",
        "price": "₹299",
        "period": "/mo",
        "blurb": "For households serious about wealth.",
        "features": ["Everything in Roots", "Unlimited budgets & goals", "Multi-currency portfolio", "Screenshot → transaction AI", "Insurance carryover engine"],
        "cta": "Start 14-day trial",
        "ctaHref": "/auth",
        "highlight": true,
        "badge": "Most chosen"
      },
      {
        "plan": "Heritage",
        "name": "Heritage",
        "price": "₹899",
        "period": "/mo",
        "blurb": "For families and advisors.",
        "features": ["Everything in Canopy", "Up to 5 linked profiles", "Advisor seat", "Priority support"],
        "cta": "Talk to us",
        "ctaHref": "/auth",
        "highlight": false,
        "badge": ""
      }
    ]
  }'::jsonb
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- =============================================================================
-- Post-apply verification
--
--   SELECT name, price_cents, currency, "interval", is_default, is_active
--     FROM public.plans ORDER BY price_cents;
--   -- expect Roots 0 / Canopy 29900 / Heritage 89900, all INR, Roots default
--
--   SELECT (SELECT name FROM public.default_plan());          -- Roots
--   SELECT jsonb_array_length(value->'cards')
--     FROM public.site_settings WHERE key = 'landing_pricing'; -- 3
--
--   -- every landing card resolves to a live plan
--   SELECT c->>'plan' AS card_plan, p.name IS NOT NULL AS linked
--     FROM public.site_settings s,
--          LATERAL jsonb_array_elements(s.value->'cards') c
--     LEFT JOIN public.plans p ON p.name = c->>'plan' AND p.is_active
--    WHERE s.key = 'landing_pricing';
-- =============================================================================
