-- ===========================================================================
-- Trackers — an OPTIONAL contextual dimension on a transaction.
--
-- A tracker answers "which project or life event does this belong to?"
-- (Home Construction, Dubai Trip, Wedding). It is NOT an account, a wallet,
-- a budget, a bucket, a category or a ledger, and it holds no money. Money
-- stays in `accounts`; `transactions.tracker_id` only labels rows that
-- already exist.
--
-- Assigning a tracker CANNOT move a balance, and that is structural rather
-- than a promise: src/lib/accountBalances.ts derives every balance from
-- account_id / transfer_to_account_id / amount, and its `BalanceTxn` type
-- does not mention tracker_id. src/lib/accountBalances.test.ts pins it.
--
-- Cardinality: one transaction has zero or one tracker. There is no join
-- table, because a second tracker on the same row would make every aggregate
-- double-count — precisely the failure this feature must not have.
--
-- NO `spent` COLUMN, on purpose. See ADR-0006 and `budgets.spent`, the dead
-- stored column src/pages/Budget.tsx:16-17 still wrongly reads. Tracker spend
-- is derived by tracker_spend() below and folded in src/lib/trackers.ts.
--
-- Trips is NOT touched and NOT absorbed. `trips.expenses` is a jsonb sandbox
-- deliberately invisible to every aggregate (Trips.tsx:72-80, "Isolated from
-- Daily Ledger"). Trackers is the opposite: the same transaction row, still
-- counted everywhere, carrying one more label.
--
-- ---- ORDERING (the BUG-022 trap, see 20260815070000) ----------------------
--
-- This migration must be APPLIED to the database BEFORE the client build that
-- adds 'trackers' to ACCESS_MENUS ships. Until all_feature_menus() knows the
-- id, get_effective_menus() returns it for nobody — including "*"-plan
-- owners — which turns a new feature into an outage on the sidebar.
--
-- ---- PLANS ----------------------------------------------------------------
--
-- No plan row is edited here. Canopy and Heritage are menu_set '["*"]' and
-- pick 'trackers' up automatically through plan_menus()'s "*" branch. Roots
-- (free, default) carries an explicit id list and therefore does NOT get it:
-- trackers is a paid feature by decision (user, 2026-08-27). If that should
-- change, it belongs in /po/plans, not in SQL —
-- 20260805180000_stage2_pricing_catalogue.sql:30-31 states menu_set is set on
-- INSERT only because a PO may have tuned it, and a blind UPDATE here would
-- silently overwrite their choice.
-- ===========================================================================

-- ---- 1. the menu id -------------------------------------------------------
-- Restated in full. src/lib/accessMenus.test.ts parses the array literal out
-- of the LATEST migration defining this function and asserts set equality
-- with ACCESS_MENUS in both directions.

CREATE OR REPLACE FUNCTION public.all_feature_menus()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'dashboard','income','expenses','investments','budget','goals','reminders',
    'calculator','bill-scan','import','export','insurance','net-worth','trips',
    'trackers','billing'
  ];
$$;

-- ---- 2. the table ---------------------------------------------------------
-- 8-part shape copied from 20260604180000_phase2g_trips.sql:
--   CREATE TABLE -> ENABLE RLS -> INDEX -> 2 GRANTs -> 4 POLICYs -> TRIGGER.

CREATE TABLE public.trackers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,

  -- The REAL name is stored. "T-" is a DISPLAY-ONLY convention applied by
  -- trackerDisplayLabel() in src/lib/trackers.ts; it is never persisted, and
  -- a unit test pins that.
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),

  type         text NOT NULL DEFAULT 'Custom' CHECK (type IN (
                 'Home Construction','Travel','Wedding','Vehicle',
                 'Education','Business Project','Event','Custom')),

  -- REQUIRED, and it is the real project start, NOT created_at. A tracker
  -- created today for a build that began in March has start_date = March.
  -- That difference is what drives the historical-review flow (a later phase);
  -- it never modifies a transaction's own occurred_at.
  start_date   date NOT NULL,
  end_date     date,

  -- NULL means NO BUDGET, which the UI renders as "No budget set" — never a
  -- fake zero. Denominated in the workspace currency (INR); transactions keep
  -- their own currency and are folded through toINR() in src/lib/finance.ts,
  -- which stays the single FX implementation.
  budget       numeric(14,2) CHECK (budget IS NULL OR budget >= 0),
  currency     text NOT NULL DEFAULT 'INR',
  description  text,

  -- Three states, one wider than trips' two: a finished project is not the
  -- same as a tidied-away one, and the user asked for both.
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  completed_at timestamptz,
  archived_at  timestamptz,

  -- Soft delete. This is the FIRST deleted_at on a finance table (only
  -- `tenants` has one), so it owes a justification: a tracker is a label that
  -- many transactions point at, and a hard delete on a misclick would strip
  -- context off historical rows that cannot be reconstructed — the user
  -- cannot remember which of 400 rows were the house build. Every read
  -- filters `deleted_at IS NULL`; restore is simply setting it back to NULL.
  deleted_at   timestamptz,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trackers_dates_ordered CHECK (end_date IS NULL OR end_date >= start_date)
);

ALTER TABLE public.trackers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_trackers_tenant ON public.trackers(tenant_id, start_date DESC);

-- The name IS the identity a user sees in a badge. Two live "Home
-- Construction" trackers would make every badge ambiguous, so collide on the
-- case-folded name among live rows only — completing, archiving or deleting
-- one frees the name for reuse.
CREATE UNIQUE INDEX trackers_tenant_active_name_uidx
  ON public.trackers (tenant_id, lower(btrim(name)))
  WHERE status = 'active' AND deleted_at IS NULL;

-- Explicit grants are REQUIRED: 20260805120000_stage1b_grant_hardening.sql
-- revoked the default privileges that would otherwise cover this.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trackers TO authenticated;
GRANT ALL ON public.trackers TO service_role;

-- These four are rebuilt identically by the loop in section 4; they are
-- declared here so the table is never briefly readable without its menu gate.
CREATE POLICY trk_select ON public.trackers FOR SELECT
  USING (public.is_tenant_member(tenant_id, 'viewer') AND public.has_menu(tenant_id, 'trackers'));
CREATE POLICY trk_insert ON public.trackers FOR INSERT
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin') AND public.has_menu(tenant_id, 'trackers'));
CREATE POLICY trk_update ON public.trackers FOR UPDATE
  USING (public.is_tenant_member(tenant_id, 'admin') AND public.has_menu(tenant_id, 'trackers'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin') AND public.has_menu(tenant_id, 'trackers'));
CREATE POLICY trk_delete ON public.trackers FOR DELETE
  USING (public.is_tenant_member(tenant_id, 'admin') AND public.has_menu(tenant_id, 'trackers'));

CREATE TRIGGER trg_trackers_updated BEFORE UPDATE ON public.trackers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.trackers IS
  'An optional contextual dimension on a transaction: which project or life '
  'event it belongs to. Holds no money and owns no balance. Spend is derived '
  'by tracker_spend(); there is deliberately no spent column (ADR-0006).';

-- ---- 3. the dimension on transactions -------------------------------------
--
-- NULLABLE, and it must stay that way: public.mark_recurring_generated()
-- (20260817120000_bug104_recurring_mark_atomic.sql) INSERTs INTO transactions
-- server-side without naming this column, so NOT NULL would break every
-- recurring generation.
--
-- ON DELETE SET NULL, matching account_id (20260806150000). Deleting a tracker
-- must UNTAG transactions, never delete them — a tracker holds no money, so
-- destroying money to remove a label would be indefensible.
--
-- transactions is DELIBERATELY NOT has_menu()-gated and stays that way. See
-- ADR-0002 and src/lib/menuContract.test.ts, which FAILS if `transactions`
-- ever appears in the gated list below. The trackers TABLE is the paywall;
-- the column on transactions is not.

ALTER TABLE public.transactions
  ADD COLUMN tracker_id uuid REFERENCES public.trackers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.tracker_id IS
  'Optional project/life-event dimension. Zero or one per row. Never affects '
  'an account balance. NULL for the overwhelming majority of rows.';

-- Partial, mirroring transactions_tenant_account_idx: the vast majority of
-- rows are untagged and have no business bloating this index. Serves both the
-- per-tracker row listing and the tracker_spend aggregation.
CREATE INDEX transactions_tenant_tracker_idx
  ON public.transactions (tenant_id, tracker_id, occurred_at DESC)
  WHERE tracker_id IS NOT NULL;

-- ---- 4. has_menu(), restated so the gated-table list includes trackers ----
--
-- WHY THIS WHOLE BLOCK IS HERE AND NOT JUST FOUR POLICIES:
--
-- src/lib/menuContract.test.ts finds the LATEST migration defining has_menu(),
-- parses the (tbl, menu, prefix) list out of it, and asserts that list equals
-- ENFORCED_MENUS exactly. The SAME test file also asserts that
-- goal_contribute and budget_set_allocation appear IN THAT SAME FILE carrying
-- their has_menu() checks. So all of it is restated below.
--
-- Sections 4 and 5 are 20260805230000_stage2_menu_paywall.sql VERBATIM, with
-- exactly one change: the ('trackers','trackers','trk') row. Do not "tidy"
-- them — the numeric(14,2) cast, the `IN ('active','completed')` guard and
-- every key of goal_contribute's returned jsonb are load-bearing (useGoals
-- reads goal_id/target_amount/capped).
--
-- ADR-0002 says a menu is enforced iff it owns exactly one feature's tables.
-- `trackers` owns exactly one table, so it is ENFORCED. Accepted consequence:
-- on a plan without the menu, tracker rows are unreadable, so a transaction
-- carrying a tracker_id simply renders no tracker badge. The transaction row
-- itself is never hidden, because transactions is ungated.

CREATE OR REPLACE FUNCTION public.has_menu(p_tenant_id uuid, p_menu text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_menu = ANY (public.get_effective_menus(p_tenant_id));
$$;

COMMENT ON FUNCTION public.has_menu(uuid, text) IS
  'Stage 2.15 / AZ-001. True when the calling user effectively has p_menu in '
  'p_tenant_id, per plan (+) tenant deny (+) member allow. Thin wrapper over '
  'get_effective_menus() on purpose: the UI and RLS must never drift apart. '
  'Used in the RLS policies of every table that maps to exactly one menu.';

REVOKE ALL ON FUNCTION public.has_menu(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_menu(uuid, text) TO authenticated;

DO $$
DECLARE
  m record;
BEGIN
  FOR m IN
    SELECT *
    FROM (VALUES
      ('investments',         'investments',  'investments'),
      ('demat_accounts',      'investments',  'demat_accounts'),
      ('demat_ledger',        'investments',  'demat_ledger'),
      ('insurance',           'insurance',    'insurance'),
      ('trips',               'trips',        'trips'),
      ('net_worth_entries',   'net-worth',    'nw'),
      ('net_worth_snapshots', 'net-worth',    'nw_snap'),
      ('reminders',           'reminders',    'reminders'),
      ('goals',               'goals',        'gl'),
      ('budgets',             'budget',       'bg'),
      ('income_streams',      'income',       'istream'),
      ('trackers',            'trackers',     'trk')
    ) AS t(tbl, menu, prefix)
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', m.prefix || '_select', m.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING ('
      || 'public.is_tenant_member(tenant_id, ''viewer'') '
      || 'AND public.has_menu(tenant_id, %L))',
      m.prefix || '_select', m.tbl, m.menu);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', m.prefix || '_insert', m.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK ('
      || 'public.is_tenant_member(tenant_id, ''admin'') '
      || 'AND public.has_menu(tenant_id, %L))',
      m.prefix || '_insert', m.tbl, m.menu);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', m.prefix || '_update', m.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING ('
      || 'public.is_tenant_member(tenant_id, ''admin'') '
      || 'AND public.has_menu(tenant_id, %L)) WITH CHECK ('
      || 'public.is_tenant_member(tenant_id, ''admin'') '
      || 'AND public.has_menu(tenant_id, %L))',
      m.prefix || '_update', m.tbl, m.menu, m.menu);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', m.prefix || '_delete', m.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING ('
      || 'public.is_tenant_member(tenant_id, ''admin'') '
      || 'AND public.has_menu(tenant_id, %L))',
      m.prefix || '_delete', m.tbl, m.menu);
  END LOOP;
END $$;

-- ---- 5. the SECURITY DEFINER bypasses, restated unchanged -----------------
-- Verbatim from 20260805230000_stage2_menu_paywall.sql. Not one character
-- differs; they live here only because menuContract.test.ts requires the
-- has_menu() definition and these two definer bypasses to be in one file.

CREATE OR REPLACE FUNCTION public.goal_contribute(p_goal_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_goal   public.goals%ROWTYPE;
  v_new    numeric(14,2);
  v_status text;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Enter an amount to add';
  END IF;

  -- FOR UPDATE is the whole point: concurrent contributions queue here instead
  -- of racing, so no update can be lost.
  SELECT * INTO v_goal FROM public.goals WHERE id = p_goal_id FOR UPDATE;
  IF v_goal.id IS NULL THEN
    RAISE EXCEPTION 'No such goal';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so the membership check is explicit.
  IF NOT public.is_tenant_member(v_goal.tenant_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Stage 2.15: and so is the menu gate, for exactly the same reason -- the
  -- gl_* policies added by this migration do not apply inside a definer.
  IF NOT public.has_menu(v_goal.tenant_id, 'goals') THEN
    RAISE EXCEPTION 'Goals are not available on your current plan';
  END IF;

  v_new := LEAST(v_goal.target_amount, GREATEST(0, v_goal.current_amount + p_amount));

  v_status := v_goal.status;
  IF v_status IN ('active', 'completed') THEN
    -- Reaching the target completes the goal; a withdrawal below it reopens one
    -- that was completed. A goal the user explicitly paused stays paused.
    v_status := CASE WHEN v_new >= v_goal.target_amount THEN 'completed' ELSE 'active' END;
  END IF;

  UPDATE public.goals
     SET current_amount = v_new,
         status         = v_status
   WHERE id = p_goal_id;

  RETURN jsonb_build_object(
    'goal_id',        p_goal_id,
    'requested',      p_amount,
    'applied',        v_new - v_goal.current_amount,
    'current_amount', v_new,
    'target_amount',  v_goal.target_amount,
    'status',         v_status,
    'capped',         (v_new - v_goal.current_amount) <> p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.goal_contribute(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.goal_contribute(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.budget_set_allocation(
  p_tenant_id    uuid,
  p_bucket       text,
  p_allocated    numeric,
  p_period       text DEFAULT 'monthly',
  p_period_start date DEFAULT NULL
)
RETURNS public.budgets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row   public.budgets%ROWTYPE;
  v_start date;
BEGIN
  IF NOT public.is_tenant_member(p_tenant_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Stage 2.15: definer bypasses the bg_* policies, so gate the menu here.
  IF NOT public.has_menu(p_tenant_id, 'budget') THEN
    RAISE EXCEPTION 'Budgets are not available on your current plan';
  END IF;

  IF COALESCE(trim(p_bucket), '') = '' THEN
    RAISE EXCEPTION 'Pick a budget bucket';
  END IF;
  IF p_allocated IS NULL OR p_allocated < 0 THEN
    RAISE EXCEPTION 'Allocation cannot be negative';
  END IF;
  IF p_period NOT IN ('weekly', 'monthly', 'yearly') THEN
    RAISE EXCEPTION 'Period must be weekly, monthly or yearly';
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now())::date);

  INSERT INTO public.budgets (tenant_id, user_id, bucket, allocated, period, period_start)
  VALUES (p_tenant_id, auth.uid(), trim(p_bucket), p_allocated, p_period, v_start)
  ON CONFLICT (tenant_id, bucket, period_start)
  DO UPDATE SET allocated = EXCLUDED.allocated,
                period    = EXCLUDED.period
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.budget_set_allocation(uuid, text, numeric, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.budget_set_allocation(uuid, text, numeric, text, date) TO authenticated;

-- ---- 6. derived tracker spend ---------------------------------------------
--
-- Why an RPC at all, when useTransactions() already has rows in the browser:
-- because the Trackers INDEX page would otherwise need the whole ledger to
-- show N totals, re-introducing on a fresh surface exactly the full-table
-- fetch Stage 4.2 removed (see 20260810160000_stage4_budget_spend.sql's
-- header). The DETAIL view does NOT use this — it selects its own rows by
-- tracker_id, because it needs those rows anyway, and folds them with the
-- same pure function.
--
-- Unlike budget_spend there is no join lateral and no window: a transaction
-- belongs to a tracker because someone assigned it, not because of its date.
-- start_date / end_date are metadata that seed the review flow; they are not
-- a filter on membership.
--
-- Grouped by currency, NOT summed raw. A tracker can legitimately mix AED and
-- INR, and toINR() in src/lib/finance.ts is the single FX implementation —
-- duplicating a rate table here would create the second one.

CREATE OR REPLACE FUNCTION public.tracker_spend(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.is_tenant_member(p_tenant_id, 'viewer') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Definer bypasses RLS, so the menu gate is explicit — the same reason
  -- goal_contribute carries one.
  IF NOT public.has_menu(p_tenant_id, 'trackers') THEN
    RAISE EXCEPTION 'Trackers are not available on your current plan';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      t.tracker_id                     AS tracker_id,
      t.type                           AS type,
      t.currency                       AS currency,
      sum(t.amount)                    AS total,
      count(*)                         AS count,
      min(t.occurred_at)               AS first_at,
      max(t.occurred_at)               AS last_at
    FROM public.transactions t
    WHERE t.tenant_id  = p_tenant_id
      AND t.tracker_id IS NOT NULL
    GROUP BY t.tracker_id, t.type, t.currency
  ) r;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.tracker_spend(uuid) IS
  'Derived tracker totals: per tracker, per type, per currency. There is no '
  'spent column and there must never be one (ADR-0006). Currency conversion '
  'stays in src/lib/finance.ts toINR() — do not add rates here.';

REVOKE ALL ON FUNCTION public.tracker_spend(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tracker_spend(uuid) TO authenticated;

-- ===========================================================================
-- Post-apply verification (run as a REAL USER over PostgREST, not the
-- Management API — get_effective_menus() is auth.uid()-guarded and returns an
-- empty array for a superuser with no JWT, which would make every check below
-- look like a denial).
--
--   -- 1. trackers is gated: expect 4
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'trackers'
--      AND (qual LIKE '%has_menu%' OR with_check LIKE '%has_menu%');
--
--   -- 2. transactions is NOT gated: expect 0
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'transactions'
--      AND (qual LIKE '%has_menu%' OR with_check LIKE '%has_menu%');
--
--   -- 3. the other 11 tables kept theirs: expect 48 (12 tables x 4)
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'public' AND qual LIKE '%has_menu%'
--       OR (schemaname = 'public' AND with_check LIKE '%has_menu%');
--
--   -- 4. the menu id is live: expect true
--   SELECT 'trackers' = ANY(public.all_feature_menus());
--
--   -- 5. the column exists and is readable: expect 200
--   --      GET /rest/v1/transactions?select=tracker_id&limit=1
-- ===========================================================================
