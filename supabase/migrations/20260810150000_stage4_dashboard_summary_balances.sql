-- Stage 4.2 follow-up — per-account deltas, so the dashboard stops fetching
-- every transaction row after all.
--
-- Moving the month totals to `dashboard_summary` was not enough on its own:
-- both dashboards also call `useLiveAccountBalances`, which called
-- `useTransactions()` and reduced the FULL table to get each account's balance.
-- The expensive fetch was still happening; three reducers had simply moved off
-- it. This adds the one aggregate that was still missing.
--
-- The rules mirror `src/lib/accountBalances.ts` exactly:
--   balance = openingBalance
--           + income linked to the account
--           − expenses linked to the account
--           − transfers OUT of it        (account_id)
--           + transfers INTO it          (transfer_to_account_id)
-- Amounts are always positive; direction comes from which leg the account sits
-- on. The opening balance is added by the client, which is the only side that
-- knows it — accounts are still a client-side store.
--
-- TWO FAITHFULNESS NOTES, both deliberate:
--
-- 1. The legacy `[Mode|accountId]` description prefix is still honoured. Stage
--    3.4 introduced the real `account_id` column and backfilled it, but a row
--    written by an old client between migration and deploy has only the prefix,
--    and dropping it would silently move an account's balance. The POSIX regex
--    below was checked against the JS one in `extractAccountId` on all six
--    cases that matter, including the two that must NOT match: `[urgent] pay
--    rent` (no pipe) and `[UPI|]` (empty id).
--
-- 2. CURRENCY IS IGNORED, because the client ignores it here too. Every other
--    aggregate in this function is grouped by currency, but `computeLiveBalances`
--    sums raw amounts regardless of currency, so a USD expense reduces an INR
--    account by its face value. That is arguably wrong — but it is the balance
--    users see today, and quietly changing displayed money inside a performance
--    change is how you lose someone's trust in the numbers. Fix it as its own
--    piece of work, on both sides at once.

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

  -- Net movement per account over ALL history (a balance is not a window).
  select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
    into v_accounts
  from (
    select acct as account_id, sum(delta) as delta
    from (
      -- The account the money left from, or landed in for plain income.
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

      -- The receiving leg of a transfer. Kept separate so a transfer between
      -- two live accounts moves both, and one whose other side was deleted
      -- still moves the survivor.
      select t.transfer_to_account_id::text, t.amount
      from transactions t
      where t.tenant_id = p_tenant_id
        and t.type = 'transfer'
        and t.transfer_to_account_id is not null
    ) legs
    where acct is not null
    group by acct
  ) a;

  select jsonb_build_object(
           'transactions', count(*),
           'earliest',     min(t.occurred_at),
           'latest',       max(t.occurred_at)
         )
    into v_totals
  from transactions t
  where t.tenant_id = p_tenant_id;

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

comment on function public.dashboard_summary(uuid, int, text) is
  'Stage 4.2: pre-aggregated dashboard figures so the client stops downloading every transaction row. Month/category totals are per currency (the FX table lives in src/lib/finance.ts and must stay the single source); months bucket in the caller-supplied timezone because occurred_at is timestamptz. account_deltas mirrors src/lib/accountBalances.ts, including the legacy [Mode|accountId] prefix and its currency-agnostic sum — change both sides together.';

revoke all on function public.dashboard_summary(uuid, int, text) from public, anon;
grant execute on function public.dashboard_summary(uuid, int, text) to authenticated;
