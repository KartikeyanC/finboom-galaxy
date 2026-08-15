-- Stage 4.2 follow-up — `categories` must carry income as well as expense.
--
-- `20260810130000` returned current-month categories for expenses only, which
-- covers SpendingCategories but not DashboardWealth: its cash-flow panel shows
-- top INFLOW categories beside top outflow categories. Without income rows the
-- inflow list would silently render empty, which reads as "you earned nothing
-- this month" rather than "this data was not requested".
--
-- Adding `type` to the grouping rather than a second array keeps one shape for
-- callers to filter. Migrations are append-only, hence a new file instead of an
-- edit to the one already applied.

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
  -- SECURITY DEFINER bypasses RLS, so membership is checked explicitly.
  if not is_tenant_member(p_tenant_id, 'viewer') then
    raise exception 'Not authorized';
  end if;

  -- A bad zone name would otherwise raise deep inside the query. Fall back
  -- rather than fail: a wrong-by-hours bucket beats a blank dashboard.
  begin
    perform now() at time zone p_tz;
  exception when others then
    p_tz := 'UTC';
  end;

  v_months      := least(greatest(coalesce(p_months, 6), 1), 24);
  v_month_start := (date_trunc('month', now() at time zone p_tz)) at time zone p_tz;
  v_from        := (date_trunc('month', now() at time zone p_tz)
                     - make_interval(months => v_months - 1)) at time zone p_tz;

  -- Monthly income/expense series, per currency.
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

  -- Current month by category, BOTH types (expense → SpendingCategories and
  -- DashboardWealth outflows; income → DashboardWealth inflows).
  select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb)
    into v_categories
  from (
    select
      t.category,
      t.type,
      t.currency,
      sum(t.amount) as total,
      count(*)      as count
    from transactions t
    where t.tenant_id = p_tenant_id
      and t.type in ('income', 'expense')
      and t.occurred_at >= v_month_start
    group by 1, 2, 3
    order by sum(t.amount) desc
  ) c;

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
  'Stage 4.2: pre-aggregated dashboard figures so the client stops downloading every transaction row. Totals are per currency (the FX table lives in src/lib/finance.ts and must stay the single source); months are bucketed in the caller-supplied timezone because occurred_at is timestamptz. Excludes transfers. `categories` covers the current month for both income and expense.';

revoke all on function public.dashboard_summary(uuid, int, text) from public, anon;
grant execute on function public.dashboard_summary(uuid, int, text) to authenticated;
