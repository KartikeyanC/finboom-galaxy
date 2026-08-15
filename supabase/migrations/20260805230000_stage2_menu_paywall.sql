-- ===========================================================================
-- Stage 2.15 / BUG-021 / AZ-001 -- the menu-vs-paywall contract
--
-- DECISION (user, 2026-08-05): menus are a REAL permission and a REAL paywall
-- for every feature that owns its own table. They stay navigation-only for the
-- features that share `transactions`.
--
-- Before this migration `get_effective_menus()` was read by the client alone
-- (AccessContext -> MenuGuard / AppSidebar / dashboard widgets). RLS gated on
-- `is_tenant_member()` and never looked at menus, so:
--   * a Roots (free) tenant could GET /rest/v1/investments, /insurance,
--     /trips, /net_worth_entries directly -- the plan tiers were cosmetic;
--   * a member whose `investments` menu was revoked in Workspace could still
--     read and write every investment row.
--
-- ---- The contract, in full ------------------------------------------------
--
-- ENFORCED IN RLS (a menu owns exactly one feature's tables):
--
--   investments          -> investments, demat_accounts, demat_ledger
--   insurance            -> insurance
--   trips                -> trips
--   net-worth            -> net_worth_entries, net_worth_snapshots
--   reminders            -> reminders
--   goals                -> goals
--   budget               -> budgets
--   income               -> income_streams
--
-- NAVIGATION-ONLY (documented as such; NOT a security boundary):
--
--   dashboard, expenses, import, bill-scan, calculator, billing
--
--   These read and write the shared `transactions` table (plus accounts,
--   recurring_items, debts, tracked_subscriptions, which have no 1:1 menu).
--   A row there cannot be attributed to a single menu without inventing a
--   category->menu mapping, and getting that wrong would silently drop rows
--   out of the dashboard, budget-spend derivation and every aggregate. Those
--   menus therefore remove the link and block the route, and nothing more.
--   `accounts`, `settings`, `profile`, `notifications` are ALWAYS_ALLOWED on
--   the client and are likewise not gated here.
--
-- ---- Why has_menu() delegates rather than reimplements ---------------------
--
-- `has_menu()` is a one-line wrapper over `get_effective_menus()` -- the exact
-- function the sidebar calls. That is deliberate: the failure mode this whole
-- item exists to fix is the UI and the server disagreeing about what a menu
-- means. Two independent implementations WILL drift. One implementation
-- cannot.
--
-- Cost: `get_effective_menus()` is plpgsql and runs ~4 indexed lookups, and an
-- RLS predicate over a column argument is evaluated per candidate row. Every
-- table gated here holds a hand-entered list (tens to low hundreds of rows),
-- so this is not a hot path. If `demat_ledger` ever grows into the tens of
-- thousands, memoise per statement rather than duplicating the logic.
--
-- ---- Interactions checked before writing ----------------------------------
--
--   * Suspension (2.8) still works: `get_effective_menus()` does not call
--     `is_tenant_member()`, so a suspended tenant keeps its menus; the
--     `is_tenant_member(tenant,'admin')` half of each write policy is what
--     refuses the write. Read-only suspension is preserved exactly.
--   * Owners are NOT exempt. `get_effective_menus()` short-circuits an owner
--     to `plan_menus()`, so a Roots owner genuinely has no `investments`.
--     That is the paywall.
--   * `goal_contribute()` and `budget_set_allocation()` are SECURITY DEFINER
--     and bypass RLS entirely, so they get an explicit `has_menu()` check
--     below. Without it the goals/budgets gate would be half-applied. They are
--     the ONLY definer functions that write a gated table (verified by grep
--     over every migration).
--   * PO functions are `is_platform_admin()`-guarded and definer; unaffected.
--
-- ---- Known, accepted consequences -----------------------------------------
--
--   * `Export.tsx` now exports only the modules the caller can actually see.
--     That is the point, and it narrows AZ-004's ungated /app/export route.
--   * `NetWorth.tsx` derives assets from `useInvestments`. A member granted
--     `net-worth` but denied `investments` sees net worth excluding
--     investments. Both menus ship together on every current plan, so this
--     only arises from a deliberate per-member override.
-- ===========================================================================

-- ---- 1. the predicate -----------------------------------------------------

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

-- ---- 2. re-declare the policies of the gated tables -----------------------
-- Every one of these tables currently carries the identical four-policy shape
-- (viewer to read, admin to write). The loop rebuilds them with the menu
-- predicate ANDed on, and is idempotent.

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
      ('income_streams',      'income',       'istream')
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

-- ---- 3. close the SECURITY DEFINER bypasses -------------------------------
-- Both functions already check is_tenant_member() explicitly because definer
-- skips RLS. The menu gate needs the same treatment for the same reason.

-- Both bodies below are migration 20260805210000's VERBATIM, with only the
-- has_menu() block added. Do not "tidy" them here -- the numeric(14,2) cast,
-- the `IN ('active','completed')` guard and every key of the returned jsonb
-- are load-bearing (useGoals reads goal_id/target_amount/capped).

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

-- ===========================================================================
-- Post-apply verification (run as a REAL USER via PostgREST, not via the
-- Management API -- get_effective_menus() is auth.uid()-guarded and returns
-- an empty array for a superuser with no JWT, which would make every check
-- below look like a denial).
--
--   -- 1. all 44 policies carry the predicate (11 tables x 4)
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('investments','demat_accounts','demat_ledger',
--                        'insurance','trips','net_worth_entries',
--                        'net_worth_snapshots','reminders','goals',
--                        'budgets','income_streams')
--      AND (qual LIKE '%has_menu%' OR with_check LIKE '%has_menu%');
--   -- expect 44
--
--   -- 2. nothing else picked it up by accident
--   SELECT tablename, count(*) FROM pg_policies
--    WHERE schemaname = 'public' AND qual LIKE '%has_menu%'
--    GROUP BY 1 ORDER BY 1;
--
--   -- 3. as a Roots owner over REST, asserting on ROW COUNTS not HTTP status
--   --    (an RLS-filtered SELECT returns 200 with an empty array):
--   --      GET /rest/v1/investments  -> 0 rows
--   --      GET /rest/v1/goals        -> rows visible (goals is in Roots)
--   --      POST /rest/v1/insurance   -> 403
-- ===========================================================================
