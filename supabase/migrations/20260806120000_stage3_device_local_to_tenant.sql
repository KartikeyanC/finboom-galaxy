-- ===========================================================================
-- Stage 3.1 / BUG-026 / BUG-071 — device-local features become tenant data
--
-- Five features persisted only to localStorage, and none of them namespaced
-- the key by tenant OR by user. Consequences, all real:
--
--   * they vanish when the user switches device or clears site data;
--   * every account sharing a browser profile sees the SAME custom categories;
--   * a collaborator never sees categories their teammate created, while the
--     transactions labelled with them are shared — so the same row reads as a
--     known category for one member and an unknown string for another;
--   * nothing is backed up, because backups are of Postgres.
--
-- ---- Why these are tenant-scoped, not per-user ----------------------------
--
-- All five describe or label SHARED data. Custom categories and subcategories
-- name values stored in `transactions.category`; the budget planner apportions
-- the workspace's income; base currency is the reporting currency every
-- member's numbers are rendered in. Per-user copies would let two members
-- disagree about what the same row means, which is worse than losing the
-- setting. Genuinely personal preferences (theme, hidden balances, dashboard
-- layout, the app-lock PIN) deliberately STAY device-local — see 3.2.
--
-- ---- Shape: one key/value table, plus one real table ----------------------
--
-- `tenant_settings` holds the four small JSON blobs. They are read together,
-- written whole, and have no relational structure worth modelling — the same
-- reasoning that produced `site_settings` for the PO-editable landing copy.
--
-- Recurring reminders get a REAL table because they are keyed by
-- `recurring_item_id`: a jsonb map cannot express the foreign key, so deleting
-- a recurring item would leave its reminder behind forever. ON DELETE CASCADE
-- is the whole reason this one is not a settings blob.
--
-- ---- Menu gating (2.15 contract) ------------------------------------------
--
-- Neither table is menu-gated, deliberately:
--   * `tenant_settings` serves four different features, so it maps to no
--     single menu — the 2.15 contract only gates tables that map 1:1.
--   * `recurring_reminders` is the bell on a recurring item, rendered inside
--     Income and Expenses (NOT the Reminders page). Gating it behind the
--     `reminders` menu would break the Income page for a workspace that has
--     recurring items but no Reminders module. The separate `reminders` table
--     — which IS the Reminders feature — stays gated.
-- ===========================================================================

-- ---- 1. tenant_settings ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key        text        NOT NULL,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, key),
  -- A format rule rather than an enum of known keys: an enum would couple every
  -- new setting to a migration, while an open text column invites typos that
  -- silently create a second, empty setting. The authoritative list of keys
  -- lives in src/lib/tenantSettings.ts and is asserted by its test.
  CONSTRAINT tenant_settings_key_format CHECK (key ~ '^[a-z][a-z0-9_]*$')
);

COMMENT ON TABLE public.tenant_settings IS
  'Stage 3.1. Small per-workspace JSON settings that were localStorage. '
  'Known keys are registered in src/lib/tenantSettings.ts.';

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;

DROP POLICY IF EXISTS tset_select ON public.tenant_settings;
CREATE POLICY tset_select ON public.tenant_settings FOR SELECT
  USING (public.is_tenant_member(tenant_id, 'viewer'));

DROP POLICY IF EXISTS tset_insert ON public.tenant_settings;
CREATE POLICY tset_insert ON public.tenant_settings FOR INSERT
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

DROP POLICY IF EXISTS tset_update ON public.tenant_settings;
CREATE POLICY tset_update ON public.tenant_settings FOR UPDATE
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

DROP POLICY IF EXISTS tset_delete ON public.tenant_settings;
CREATE POLICY tset_delete ON public.tenant_settings FOR DELETE
  USING (public.is_tenant_member(tenant_id, 'admin'));

DROP TRIGGER IF EXISTS trg_tenant_settings_updated ON public.tenant_settings;
CREATE TRIGGER trg_tenant_settings_updated
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- 2. recurring_reminders ----------------------------------------------

CREATE TABLE IF NOT EXISTS public.recurring_reminders (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL DEFAULT public.current_tenant_id()
                                REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id           uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  recurring_item_id uuid        NOT NULL
                                REFERENCES public.recurring_items(id) ON DELETE CASCADE,
  enabled           boolean     NOT NULL DEFAULT true,
  -- 0 means "on the day". The upper bound is a sanity rail, not a rule:
  -- a reminder more than a year ahead of its due date is a typo.
  days_before       integer     NOT NULL DEFAULT 3
                                CHECK (days_before >= 0 AND days_before <= 365),
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- One reminder per item per workspace. Also the ON CONFLICT target the
  -- client upserts against, so it must be a plain unique constraint:
  -- PostgREST cannot name a partial index in `on_conflict=` (learned in 2.7).
  CONSTRAINT recurring_reminders_item_key UNIQUE (tenant_id, recurring_item_id)
);

COMMENT ON TABLE public.recurring_reminders IS
  'Stage 3.1. Per-recurring-item reminder settings, formerly localStorage key '
  'finroot.recurring.reminders.v1. Cascades with the item it belongs to.';

CREATE INDEX IF NOT EXISTS recurring_reminders_tenant_idx
  ON public.recurring_reminders (tenant_id);

ALTER TABLE public.recurring_reminders ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_reminders TO authenticated;
GRANT ALL ON public.recurring_reminders TO service_role;

DROP POLICY IF EXISTS rrem_select ON public.recurring_reminders;
CREATE POLICY rrem_select ON public.recurring_reminders FOR SELECT
  USING (public.is_tenant_member(tenant_id, 'viewer'));

DROP POLICY IF EXISTS rrem_insert ON public.recurring_reminders;
CREATE POLICY rrem_insert ON public.recurring_reminders FOR INSERT
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

DROP POLICY IF EXISTS rrem_update ON public.recurring_reminders;
CREATE POLICY rrem_update ON public.recurring_reminders FOR UPDATE
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

DROP POLICY IF EXISTS rrem_delete ON public.recurring_reminders;
CREATE POLICY rrem_delete ON public.recurring_reminders FOR DELETE
  USING (public.is_tenant_member(tenant_id, 'admin'));

DROP TRIGGER IF EXISTS trg_recurring_reminders_updated ON public.recurring_reminders;
CREATE TRIGGER trg_recurring_reminders_updated
  BEFORE UPDATE ON public.recurring_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================================
-- Post-apply verification (as a REAL USER over PostgREST; assert on row
-- counts, never HTTP status — an RLS-filtered SELECT returns 200 and []):
--
--   -- both tables exist with 4 policies each
--   SELECT tablename, count(*) FROM pg_policies
--    WHERE schemaname='public'
--      AND tablename IN ('tenant_settings','recurring_reminders')
--    GROUP BY 1;                                  -- expect 4 and 4
--
--   -- Stage 1b held: no TRUNCATE leaked to the new tables
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name IN ('tenant_settings','recurring_reminders')
--      AND grantee IN ('anon','authenticated')
--      AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES');   -- expect 0
--
--   -- the key format rule bites
--   INSERT INTO tenant_settings(tenant_id,key,value) VALUES (…,'Bad Key','{}');
--   -- expect 23514 tenant_settings_key_format
--
--   -- deleting a recurring item takes its reminder with it
--   DELETE FROM recurring_items WHERE id = …;      -- reminder row count -> 0
-- ===========================================================================
