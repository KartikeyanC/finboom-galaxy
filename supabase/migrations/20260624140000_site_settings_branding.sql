-- =============================================================================
-- Branding (white-label) — Product-Owner-editable app name + logo.
-- Reuses the existing site_settings table + po_set_site_setting() RPC + public
-- read policy (key LIKE 'landing_%'), so the marketing site and the app can
-- read it anonymously and the PO edits it from /po/branding.
-- No new table, policy, or function required.
-- =============================================================================

INSERT INTO public.site_settings (key, value) VALUES (
  'landing_branding',
  '{
    "appName": "FinRoot",
    "tagline": "The calm, intelligent wealth OS for modern households.",
    "logoUrl": null
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
