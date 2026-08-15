-- =============================================================================
-- Site settings — Product-Owner-editable public site content (CMS-style).
-- First use: the Landing pricing section, so the PO can customize plan cards
-- (names, prices, features, CTAs, badge) without a code change.
-- Key/value JSONB so future editable sections reuse the same table.
-- =============================================================================
CREATE TABLE public.site_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL    ON public.site_settings TO service_role;

-- Public (anon) may read landing_* keys → drives the marketing site.
-- Product Owners may read everything for management.
CREATE POLICY site_settings_public_read ON public.site_settings FOR SELECT
  USING (key LIKE 'landing_%' OR public.is_platform_admin());

-- ---- PO writer (audited) ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.po_set_site_setting(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF COALESCE(trim(p_key), '') = '' THEN RAISE EXCEPTION 'Key is required'; END IF;
  INSERT INTO public.site_settings (key, value, updated_at, updated_by)
  VALUES (p_key, p_value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  PERFORM public.log_audit(NULL, 'site.setting.update', 'site_setting', p_key, p_value);
END;
$$;
GRANT EXECUTE ON FUNCTION public.po_set_site_setting(text, jsonb) TO authenticated;

-- ---- Seed the current pricing so the page is unchanged until edited ---------
INSERT INTO public.site_settings (key, value) VALUES (
  'landing_pricing',
  '{
    "eyebrow": "Pricing",
    "title": "Quietly priced. Loudly worth it.",
    "cards": [
      {
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
) ON CONFLICT (key) DO NOTHING;
