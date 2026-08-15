-- =============================================================================
-- Stage 2 · 2.6 (BUG-040) — goal contributions and budget allocations become
-- server-side operations with invariants.
--
-- Before: "Add funds" read current_amount in the browser, added to it, and
-- wrote the sum back. Two people (or two tabs) contributing at once both read
-- the same starting figure and the second write silently erased the first —
-- money that a user believes they saved simply disappears. Budgets had the
-- same shape of problem plus a tenancy bug in their uniqueness constraint.
--
-- After: one statement per change, under a row lock, with the rules enforced
-- where they cannot be bypassed.
-- =============================================================================

-- ---- 1. hard floor on goal progress ----------------------------------------
-- Every path (RPC, the edit form, an import) must respect this.
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_current_amount_nonneg;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_current_amount_nonneg CHECK (current_amount >= 0);

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_target_amount_positive;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_target_amount_positive CHECK (target_amount > 0);

-- ---- 2. goal_contribute ----------------------------------------------------
-- Returns what was ACTUALLY applied. A contribution larger than the remaining
-- gap is capped rather than rejected, and the caller is told (`capped`), so the
-- user finds out immediately instead of discovering a silent overshoot later.
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

-- ---- 3. budgets: uniqueness belongs to the WORKSPACE, not the user ---------
-- UNIQUE (user_id, bucket, period_start) was wrong twice over: two members of
-- one workspace could each create a "Needs" budget for the same month (double
-- counting), while one user in two workspaces could not have the same bucket
-- in both. Collapse any duplicates first, keeping the most recently updated.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, bucket, period_start
           ORDER BY updated_at DESC, created_at DESC, id
         ) AS rn
  FROM public.budgets
)
DELETE FROM public.budgets b USING ranked r WHERE b.id = r.id AND r.rn > 1;

ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_user_id_bucket_period_start_key;
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_tenant_bucket_period_key;
ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_tenant_bucket_period_key UNIQUE (tenant_id, bucket, period_start);

ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_allocated_nonneg;
ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_allocated_nonneg CHECK (allocated >= 0);

-- ---- 4. budget_set_allocation ----------------------------------------------
-- One upsert on the workspace-scoped key: creating and editing are the same
-- operation, so two people setting the same bucket cannot produce duplicates.
-- `spent` is never written here — it has been derived from transactions since
-- roadmap 2.4 (lib/budgetBuckets.ts).
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

-- =============================================================================
-- Post-apply verification (as a signed-in member of the workspace):
--   SELECT public.goal_contribute('<goal>', 500);      -- applied 500
--   SELECT public.goal_contribute('<goal>', 999999);   -- capped: true
--   SELECT public.goal_contribute('<goal>', -1e9);     -- floors at 0, reopens
--   SELECT public.goal_contribute('<goal>', 0);        -- ERROR
--   -- as a non-member: ERROR "Not authorized"
--
--   SELECT public.budget_set_allocation('<tenant>', 'Needs', 10000);
--   SELECT public.budget_set_allocation('<tenant>', 'Needs', 12000);  -- 1 row
--   SELECT count(*) FROM budgets WHERE bucket = 'Needs';              -- 1
--   SELECT public.budget_set_allocation('<tenant>', 'Needs', -5);     -- ERROR
-- =============================================================================
