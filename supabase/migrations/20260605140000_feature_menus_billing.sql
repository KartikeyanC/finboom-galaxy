-- =============================================================================
-- Align all_feature_menus() with the app's real menus and make `billing`
-- plan-controlled (so Free can exclude it). Drops the retired budget-allocator
-- and subscriptions ids; adds billing.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.all_feature_menus()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'dashboard','income','expenses','investments','budget','goals','reminders',
    'calculator','bill-scan','import','insurance','net-worth','trips','billing'
  ];
$$;
