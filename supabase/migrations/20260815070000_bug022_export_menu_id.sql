-- =============================================================================
-- BUG-022 — /app/export borrows MenuGuard menuId="import" because there is no
-- 'export' menu id in all_feature_menus(). Adds one, navigation-only (same
-- family as dashboard/expenses/import/bill-scan/calculator/billing — see
-- 20260805230000_stage2_menu_paywall.sql's contract comment): Export.tsx
-- already narrows what it exports to whatever the caller's OWN per-menu RLS
-- lets it read, so this id gates the route, not any table.
--
-- Confirmed live (2026-08-15, anon key, read-only) before writing this:
--   all_feature_menus() = the 14 ids below, no 'export' — matches this repo's
--   last migration of it (20260605140000).
--   plans.menu_set: Heritage=["*"], Canopy=["*"], Roots=[8 explicit ids, no
--   "import"]. Only the two "*" plans currently reach /export via the
--   borrowed "import" id, and only "*" plans resolve through
--   all_feature_menus() (plan_menus()'s `v_set @> '["*"]'` branch) — so
--   adding 'export' here, with no plan row edited, reproduces the exact
--   current access exactly once App.tsx's MenuGuard is switched from
--   menuId="import" to menuId="export" in the same deploy as this migration.
--
-- Do NOT flip App.tsx before this migration is live — until all_feature_menus()
-- includes 'export', get_effective_menus() would return it for nobody
-- (including Heritage/Canopy owners), turning a proxy gate into an outage.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.all_feature_menus()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'dashboard','income','expenses','investments','budget','goals','reminders',
    'calculator','bill-scan','import','export','insurance','net-worth','trips','billing'
  ];
$$;
