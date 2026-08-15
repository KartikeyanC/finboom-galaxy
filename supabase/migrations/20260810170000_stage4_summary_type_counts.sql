-- Stage 4.2 — lifetime counts per type.
--
-- The Expenses page metric strip ("This Month", "Daily Average", "Largest
-- Category", "Total Records — All time") was computed from a full unbounded
-- fetch of every expense row. Three of the four are already in
-- `dashboard_summary`; the fourth is a LIFETIME count of expense rows, and
-- `totals.transactions` counts all types, so reusing it would have quietly
-- changed what that card means.
--
-- Adding the breakdown is cheaper than a wrong number: `by_type` is at most
-- three rows and comes from the same scan that already produced `totals`.

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
  v_accounts    jsonb;
  v_totals      jsonb;
begin
  if not is_tenant_member(p_tenant_id, 'viewer') then
    raise exception 'Not authorized';
  end if;

  begin
    perform now() at time zone p_tz;
  exception when others then
    p_tz := 'UTC';
  end;

  v_months      := least(greatest(coalesce(p_months, 6), 1), 24);
  v_month_start := (date_trunc('month', now() at time zone p_tz)) at time zone p_tz;
  v_from        := (date_trunc('month', now() at time zone p_tz)
                     - make_interval(months => v_months - 1)) at time zone p_tz;

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

  select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
    into v_accounts
  from (
    select acct as account_id, sum(delta) as delta
    from (
      select
        coalesce(
          t.account_id::text,
          substring(t.description from '^\[[^|\]]+\|([^\]]+)\]')
        ) as acct,
        case t.type
          when 'income'   then  t.amount
          when 'expense'  then -t.amount
          when 'transfer' then -t.amount
          else 0
        end as delta
      from transactions t
      where t.tenant_id = p_tenant_id

      union all

      select t.transfer_to_account_id::text, t.amount
      from transactions t
      where t.tenant_id = p_tenant_id
        and t.type = 'transfer'
        and t.transfer_to_account_id is not null
    ) legs
    where acct is not null
    group by acct
  ) a;

  -- `by_type` carries lifetime rows per type, so a page can show an "all time"
  -- count without fetching all time. Built from a grouped scan and joined to
  -- the ungrouped totals, since the two aggregate at different levels.
  select jsonb_build_object(
           'transactions', coalesce(g.total, 0),
           'earliest',     g.earliest,
           'latest',       g.latest,
           'by_type',      coalesce(g.by_type, '{}'::jsonb)
         )
    into v_totals
  from (
    select
      sum(x.n)                          as total,
      min(x.earliest)                   as earliest,
      max(x.latest)                     as latest,
      jsonb_object_agg(x.type, x.n)     as by_type
    from (
      select t.type, count(*) as n, min(t.occurred_at) as earliest, max(t.occurred_at) as latest
      from transactions t
      where t.tenant_id = p_tenant_id
      group by t.type
    ) x
  ) g;

  return jsonb_build_object(
    'tz',             p_tz,
    'months',         v_months,
    'month_start',    v_month_start,
    'from',           v_from,
    'monthly',        v_monthly,
    'categories',     v_categories,
    'account_deltas', v_accounts,
    'totals',         v_totals
  );
end;
$$;

revoke all on function public.dashboard_summary(uuid, int, text) from public, anon;
grant execute on function public.dashboard_summary(uuid, int, text) to authenticated;
