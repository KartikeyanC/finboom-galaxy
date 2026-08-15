-- Stage 4.2 / BUG-045 · PERF-005 — pre-aggregated dashboard numbers.
--
-- The dashboard rendered a handful of totals by pulling EVERY row of the
-- transactions table into the browser and reducing it in JavaScript. That cost
-- grows without bound: at 5 000 transactions the dashboard downloads megabytes
-- to display eight numbers, and it does it again on every mount.
--
-- Two design decisions worth reading before changing this.
--
-- 1. TOTALS ARE RETURNED PER CURRENCY, NOT CONVERTED.
--    The client converts with a fixed FX table in `src/lib/finance.ts`. If this
--    function converted, that table would exist in two places and drift — and
--    SQL is the copy nobody would remember to update. Grouping by currency
--    collapses N rows to a few dozen while leaving exactly one source of truth
--    for the rates. A tenant typically has one or two currencies.
--
-- 2. THE MONTH BUCKET NEEDS A TIMEZONE.
--    `occurred_at` is timestamptz and the client buckets months in LOCAL time.
--    For an IST user, a transaction at 2026-08-01 00:30 IST is 2026-07-31 19:00
--    UTC — the server would file it under July and the client under August, so
--    "this month" would silently disagree with the ledger. The caller passes
--    its own zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and all
--    bucketing happens in it.
--
-- `transfer` is excluded throughout: it moves money between the user's own
-- accounts, so counting it inflates both earnings and spending and corrupts the
-- savings rate. This mirrors the client-side filters it replaces.

create or replace function public.dashboard_summary(
  p_tenant_id uuid,
  p_months    int  default 6,
  p_tz        text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months      int;
  v_month_start timestamptz;
  v_from        timestamptz;
  v_monthly     jsonb;
  v_categories  jsonb;
  v_totals      jsonb;
begin
  -- SECURITY DEFINER bypasses RLS, so membership is checked explicitly. Any
  -- member may read aggregates — this is the same data the dashboard already
  -- showed, just summed on the server.
  if not is_tenant_member(p_tenant_id, 'viewer') then
    raise exception 'Not authorized';
  end if;

  -- A bad zone name would otherwise raise deep inside the query with a useless
  -- message. Fall back rather than fail: a wrong-by-hours bucket beats a blank
  -- dashboard.
  begin
    perform now() at time zone p_tz;
  exception when others then
    p_tz := 'UTC';
  end;

  v_months      := least(greatest(coalesce(p_months, 6), 1), 24);
  v_month_start := (date_trunc('month', now() at time zone p_tz)) at time zone p_tz;
  v_from        := (date_trunc('month', now() at time zone p_tz)
                     - make_interval(months => v_months - 1)) at time zone p_tz;

  -- Monthly income/expense series, per currency. Drives both the metric strip
  -- and DashboardWealth's six-month sparkbars.
  select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb)
    into v_monthly
  from (
    select
      to_char(date_trunc('month', t.occurred_at at time zone p_tz), 'YYYY-MM') as month,
      t.type,
      t.currency,
      sum(t.amount) as total,
      count(*)      as count
    from transactions t
    where t.tenant_id = p_tenant_id
      and t.type in ('income', 'expense')
      and t.occurred_at >= v_from
    group by 1, 2, 3
    order by 1, 2, 3
  ) m;

  -- Current month's expenses by category, per currency (SpendingCategories).
  select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb)
    into v_categories
  from (
    select
      t.category,
      t.currency,
      sum(t.amount) as total,
      count(*)      as count
    from transactions t
    where t.tenant_id = p_tenant_id
      and t.type = 'expense'
      and t.occurred_at >= v_month_start
    group by 1, 2
    order by sum(t.amount) desc
  ) c;

  -- Lifetime counts, so the UI can say how much history exists without
  -- fetching any of it.
  select jsonb_build_object(
           'transactions', count(*),
           'earliest',     min(t.occurred_at),
           'latest',       max(t.occurred_at)
         )
    into v_totals
  from transactions t
  where t.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'tz',          p_tz,
    'months',      v_months,
    'month_start', v_month_start,
    'from',        v_from,
    'monthly',     v_monthly,
    'categories',  v_categories,
    'totals',      v_totals
  );
end;
$$;

comment on function public.dashboard_summary(uuid, int, text) is
  'Stage 4.2: pre-aggregated dashboard figures so the client stops downloading every transaction row. Totals are per currency (the FX table lives in src/lib/finance.ts and must stay the single source); months are bucketed in the caller-supplied timezone because occurred_at is timestamptz. Excludes transfers.';

revoke all on function public.dashboard_summary(uuid, int, text) from public, anon;
grant execute on function public.dashboard_summary(uuid, int, text) to authenticated;
