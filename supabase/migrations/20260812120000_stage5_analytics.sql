-- Stage 5.8 — product analytics: activation, retention, conversion.
--
-- ⚠️ NOT YET APPLIED. Needs a SUPABASE_ACCESS_TOKEN; see
-- docs/runbooks/apply-a-migration.md. `/po/analytics` renders its growth and
-- conversion sections without it and says plainly that the rest is waiting.
--
-- WHY THERE IS NO EVENTS TABLE:
-- The obvious way to measure a product is to instrument it — a script, an
-- events table, a session id. This project shipped a privacy policy in 5.1
-- that says, truthfully, that there is no analytics or tracking script and no
-- advertising cookies. That sentence is worth more than a funnel chart.
--
-- Everything below is DERIVED from rows the database already holds for its own
-- reasons: when a workspace was created, when its first transaction was
-- entered, which months it wrote anything in, when its members last signed in.
-- Nothing new is collected, no new consent is needed, and there is nothing to
-- retain or to export because there is no new record.
--
-- The cost is honest and worth stating: this can see nothing an anonymous
-- visitor does. There is no landing-page → sign-up funnel here, and no
-- per-screen drop-off. It measures what people DID, not what they browsed.
--
-- WHY IT MUST BE SECURITY DEFINER:
-- The Product Owner has no RLS access to any finance table, by design. The
-- alternative to these functions is granting the PO a way to read the rows
-- themselves, which is exactly what the rule in CLAUDE.md forbids. So the
-- functions return AGGREGATES AND TIMESTAMPS ONLY — counts, first-write dates,
-- last-activity dates. No amount, no description, no category, no merchant.
-- A reviewer should be able to check that claim by reading the SELECT lists.

-- ---------------------------------------------------------------------------
-- Per-workspace engagement facts
-- ---------------------------------------------------------------------------
-- One row per non-deleted workspace. `first_*_at` uses created_at (when the
-- row was ENTERED), never the ledger date a transaction carries — a user
-- back-dating a January expense in August did not activate in January.
CREATE OR REPLACE FUNCTION public.po_tenant_engagement()
RETURNS TABLE (
  tenant_id             uuid,
  first_transaction_at  timestamptz,
  first_budget_at       timestamptz,
  first_goal_at         timestamptz,
  last_activity_at      timestamptz,
  last_sign_in_at       timestamptz,
  transaction_count     bigint,
  active_members        bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT
      t.id,
      tx.first_at,
      bg.first_at,
      gl.first_at,
      -- The most recent moment this workspace wrote anything at all. Reading
      -- leaves no trace, so a workspace someone checks daily without editing
      -- looks dormant here; `last_sign_in_at` is the counterweight.
      GREATEST(tx.last_at, bg.last_at, gl.last_at, ac.last_at),
      si.last_sign_in_at,
      COALESCE(tx.n, 0),
      (SELECT count(*) FROM public.tenant_members m
        WHERE m.tenant_id = t.id AND m.status = 'active')
    FROM public.tenants t
    LEFT JOIN LATERAL (
      SELECT min(x.created_at) AS first_at, max(x.created_at) AS last_at, count(*) AS n
      FROM public.transactions x WHERE x.tenant_id = t.id
    ) tx ON true
    LEFT JOIN LATERAL (
      SELECT min(x.created_at) AS first_at, max(x.created_at) AS last_at
      FROM public.budgets x WHERE x.tenant_id = t.id
    ) bg ON true
    LEFT JOIN LATERAL (
      SELECT min(x.created_at) AS first_at, max(x.created_at) AS last_at
      FROM public.goals x WHERE x.tenant_id = t.id
    ) gl ON true
    LEFT JOIN LATERAL (
      SELECT max(x.created_at) AS last_at
      FROM public.accounts x WHERE x.tenant_id = t.id
    ) ac ON true
    LEFT JOIN LATERAL (
      SELECT max(u.last_sign_in_at) AS last_sign_in_at
      FROM public.tenant_members m
      JOIN auth.users u ON u.id = m.user_id
      WHERE m.tenant_id = t.id AND m.status = 'active'
    ) si ON true
    WHERE t.status <> 'deleted';
END;
$$;

COMMENT ON FUNCTION public.po_tenant_engagement() IS
  'Stage 5.8. Per-workspace activation and liveness, as counts and timestamps only. Returns no financial value of any kind.';

REVOKE EXECUTE ON FUNCTION public.po_tenant_engagement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.po_tenant_engagement() TO authenticated;

-- ---------------------------------------------------------------------------
-- Which months each workspace was alive in
-- ---------------------------------------------------------------------------
-- This is what makes a REAL retention matrix possible rather than a survival
-- curve: for each workspace, the set of months in which it wrote something.
-- Cohort retention is then "of the workspaces created in month M, how many
-- appear again in month M+n" — computed in the client from these pairs.
--
-- `events` is a row count, not a value. It is here so a month with one edit can
-- be told apart from a month of real use.
CREATE OR REPLACE FUNCTION public.po_tenant_activity_months(p_months int DEFAULT 12)
RETURNS TABLE (
  tenant_id uuid,
  month     date,
  events    bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_since timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  -- Clamped: the window is a UI control, and a UI control must not be able to
  -- ask for a full-table scan of every finance row ever written.
  p_months := LEAST(GREATEST(COALESCE(p_months, 12), 1), 36);
  v_since := date_trunc('month', now()) - make_interval(months => p_months - 1);

  RETURN QUERY
    SELECT a.tenant_id, a.month, sum(a.n)::bigint
    FROM (
      SELECT x.tenant_id, date_trunc('month', x.created_at)::date AS month, count(*) AS n
        FROM public.transactions x
        WHERE x.created_at >= v_since GROUP BY 1, 2
      UNION ALL
      SELECT x.tenant_id, date_trunc('month', x.created_at)::date, count(*)
        FROM public.budgets x
        WHERE x.created_at >= v_since GROUP BY 1, 2
      UNION ALL
      SELECT x.tenant_id, date_trunc('month', x.created_at)::date, count(*)
        FROM public.goals x
        WHERE x.created_at >= v_since GROUP BY 1, 2
      UNION ALL
      SELECT x.tenant_id, date_trunc('month', x.created_at)::date, count(*)
        FROM public.accounts x
        WHERE x.created_at >= v_since GROUP BY 1, 2
    ) a
    -- Deleted workspaces are excluded so the denominator matches po_list_tenants().
    JOIN public.tenants t ON t.id = a.tenant_id AND t.status <> 'deleted'
    GROUP BY a.tenant_id, a.month;
END;
$$;

COMMENT ON FUNCTION public.po_tenant_activity_months(int) IS
  'Stage 5.8. Months in which each workspace wrote anything, with a row count. Feeds the cohort retention matrix. No financial values.';

REVOKE EXECUTE ON FUNCTION public.po_tenant_activity_months(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.po_tenant_activity_months(int) TO authenticated;
