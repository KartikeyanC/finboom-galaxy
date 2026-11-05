-- ===========================================================================
-- Stage 5.9 — cost monitoring and alerting on edge-function invocations.
--
-- Production_Readiness said "Cost monitoring: none — unthrottled public edge
-- functions", and 5.7 said the rest: "nothing alerts anyone — the operator has
-- to know before they can declare." Several functions are public by design
-- (webhooks, po-auth, live-price), so a loop in a client, a scraper or a
-- vendor retry storm would run up invocations and third-party API calls
-- (OCR, quote providers) with nobody looking.
--
-- ---- Shape ----------------------------------------------------------------
--
-- Every function records each call through `_shared/usage.ts`, which calls
-- `record_edge_call(fn, status)` with the service role. That bumps one row
-- per function per hour, and in the same statement checks the function's
-- limits. Crossing one writes an `edge_usage_alerts` row — at most one per
-- function, window and kind, enforced by its primary key — and notifies every
-- platform admin through the existing notifications table. No cron, no email
-- (send-email is undeployed, BUG-005), no new secret: the alert lands in the
-- bell of the people who can act on it, the moment the limit is crossed.
--
-- ---- What it costs ----------------------------------------------------------
--
-- One upsert per invocation on a (fn, hour) primary key, plus a sum over at
-- most 24 rows. Recording is fire-and-forget in the function and can never
-- fail or slow the caller's response (see usage.ts).
--
-- ---- What it cannot see -----------------------------------------------------
--
-- Calls rejected before the function's code runs (the platform's own JWT
-- check, a cold-start crash) are not counted — that is Supabase's dashboard.
-- This counts what reached our code, which is what turns into OCR calls,
-- quote-provider calls and database work.
--
-- ---- Limits -----------------------------------------------------------------
--
-- In `site_settings` under `edge_usage_limits`, edited from /po (the existing
-- audited po_set_site_setting). Shape:
--   { "default":     { "hour": 2000, "day": 20000, "error_rate": 0.2 },
--     "live-price":  { "hour": 5000 } }
-- A function's own entry overrides the default field by field. The values
-- below apply until anyone saves one.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.edge_usage (
  fn     text        NOT NULL,
  hour   timestamptz NOT NULL,
  calls  integer     NOT NULL DEFAULT 0,
  errors integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (fn, hour)
);

CREATE TABLE IF NOT EXISTS public.edge_usage_alerts (
  fn           text        NOT NULL,
  period       text        NOT NULL CHECK (period IN ('hour', 'day')),
  period_start timestamptz NOT NULL,
  kind         text        NOT NULL CHECK (kind IN ('calls', 'errors')),
  limit_value  numeric     NOT NULL,
  observed     numeric     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fn, period, period_start, kind)
);

ALTER TABLE public.edge_usage        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_usage_alerts ENABLE ROW LEVEL SECURITY;

-- Read-only for platform admins; nobody writes except record_edge_call.
GRANT SELECT ON public.edge_usage, public.edge_usage_alerts TO authenticated;
GRANT ALL    ON public.edge_usage, public.edge_usage_alerts TO service_role;

DROP POLICY IF EXISTS edge_usage_select ON public.edge_usage;
CREATE POLICY edge_usage_select ON public.edge_usage FOR SELECT
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS edge_usage_alerts_select ON public.edge_usage_alerts;
CREATE POLICY edge_usage_alerts_select ON public.edge_usage_alerts FOR SELECT
  USING (public.is_platform_admin());

-- ---- record one call --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_edge_call(p_fn text, p_status integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour    timestamptz := date_trunc('hour', now());
  v_day     timestamptz := date_trunc('day', now());
  v_err     integer     := CASE WHEN p_status >= 500 THEN 1 ELSE 0 END;
  v_calls   integer;
  v_errors  integer;
  v_new     boolean;
  v_today   integer;
  v_all     jsonb;
  v_lim     jsonb;
  v_hour_l  integer;
  v_day_l   integer;
  v_rate_l  numeric;
BEGIN
  -- Names come from our own code, but this is the one write path into the
  -- table: keep it to what a function name can be.
  IF p_fn IS NULL OR p_fn !~ '^[a-z0-9-]{1,40}$' THEN
    RAISE EXCEPTION 'Bad function name';
  END IF;

  INSERT INTO public.edge_usage AS u (fn, hour, calls, errors)
  VALUES (p_fn, v_hour, 1, v_err)
  ON CONFLICT (fn, hour) DO UPDATE
     SET calls = u.calls + 1, errors = u.errors + EXCLUDED.errors
  RETURNING u.calls, u.errors, (xmax = 0) INTO v_calls, v_errors, v_new;

  -- First call of a new hour: drop this function's rows past 35 days, so the
  -- table stays a few thousand rows without a cron.
  IF v_new THEN
    DELETE FROM public.edge_usage
     WHERE fn = p_fn AND hour < now() - interval '35 days';
  END IF;

  SELECT value INTO v_all FROM public.site_settings WHERE key = 'edge_usage_limits';
  v_lim := jsonb_build_object('hour', 2000, 'day', 20000, 'error_rate', 0.2)
           || COALESCE(v_all -> 'default', '{}'::jsonb)
           || COALESCE(v_all -> p_fn, '{}'::jsonb);
  v_hour_l := NULLIF(v_lim ->> 'hour', '')::integer;
  v_day_l  := NULLIF(v_lim ->> 'day', '')::integer;
  v_rate_l := NULLIF(v_lim ->> 'error_rate', '')::numeric;

  IF v_hour_l IS NOT NULL AND v_calls > v_hour_l THEN
    PERFORM public._edge_usage_alert(p_fn, 'hour', v_hour, 'calls', v_hour_l, v_calls);
  END IF;

  IF v_day_l IS NOT NULL THEN
    SELECT COALESCE(sum(calls), 0) INTO v_today
      FROM public.edge_usage WHERE fn = p_fn AND hour >= v_day;
    IF v_today > v_day_l THEN
      PERFORM public._edge_usage_alert(p_fn, 'day', v_day, 'calls', v_day_l, v_today);
    END IF;
  END IF;

  -- A rate needs a sample: 10 failures in an hour before it counts, so one
  -- 500 out of three calls at 4 a.m. pages nobody.
  IF v_rate_l IS NOT NULL AND v_errors >= 10
     AND v_errors::numeric / v_calls >= v_rate_l THEN
    PERFORM public._edge_usage_alert(p_fn, 'hour', v_hour, 'errors', v_rate_l,
      round(v_errors::numeric / v_calls, 3));
  END IF;
END;
$$;

-- Once per function / period / kind (the primary key); only a newly written
-- alert notifies.
CREATE OR REPLACE FUNCTION public._edge_usage_alert(
  p_fn text, p_period text, p_start timestamptz, p_kind text,
  p_limit numeric, p_observed numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body  text;
  r       record;
BEGIN
  INSERT INTO public.edge_usage_alerts (fn, period, period_start, kind, limit_value, observed)
  VALUES (p_fn, p_period, p_start, p_kind, p_limit, p_observed)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_kind = 'calls' THEN
    v_title := p_fn || ' is over its ' || CASE p_period WHEN 'hour' THEN 'hourly' ELSE 'daily' END || ' limit';
    v_body  := 'More than ' || p_limit::bigint || ' calls this ' || p_period
               || '. Check Edge usage on the PO dashboard.';
  ELSE
    v_title := p_fn || ' is failing';
    v_body  := round(p_observed * 100) || '% of calls this hour returned a server error (limit '
               || round(p_limit * 100) || '%).';
  END IF;

  FOR r IN SELECT user_id FROM public.platform_admins LOOP
    PERFORM public.create_notification(r.user_id, NULL, 'ops.edge_usage', v_title, v_body,
      jsonb_build_object('fn', p_fn, 'period', p_period, 'kind', p_kind,
                         'limit', p_limit, 'observed', p_observed));
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_edge_call(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._edge_usage_alert(text, text, timestamptz, text, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_edge_call(text, integer) TO service_role;

-- ===========================================================================
-- Post-apply verification (as service_role, e.g. the SQL editor):
--
--   SELECT public.record_edge_call('smoke-test', 200);
--   SELECT * FROM public.edge_usage WHERE fn = 'smoke-test';     -- calls = 1
--   SELECT public.po_set_site_setting('edge_usage_limits',
--     '{"smoke-test": {"hour": 1}}');                            -- as a PO
--   SELECT public.record_edge_call('smoke-test', 200);
--   SELECT * FROM public.edge_usage_alerts WHERE fn = 'smoke-test';  -- one row
--   -- each platform admin has an 'ops.edge_usage' notification; a third call
--   -- adds no second alert. As a normal user, both tables read as empty and
--   -- record_edge_call is "permission denied". Then clean up:
--   DELETE FROM public.edge_usage        WHERE fn = 'smoke-test';
--   DELETE FROM public.edge_usage_alerts WHERE fn = 'smoke-test';
-- ===========================================================================
