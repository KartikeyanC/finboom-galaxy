-- Stage 4.2 — derived budget spend, the last thing keeping the dashboard on a
-- full table scan.
--
-- `BudgetAllocation` → `useBudgetSpend` → `useTransactions()`. Like
-- `useLiveAccountBalances` before it, this meant the dashboard still downloaded
-- every transaction row no matter what the other widgets did. Three widgets had
-- been moved off the fetch while the fetch itself stayed.
--
-- Why this is its own function rather than another key on `dashboard_summary`:
-- the window is PER BUDGET ROW. A budget carries its own `period_start` and a
-- `period` of weekly/monthly/yearly, so there is no single date range to group
-- by — `deriveSpent` in `src/lib/budgetBuckets.ts` recomputes a half-open
-- [start, end) window for each row. The server can do that exactly, because
-- `budgets` is a tenant table it can join to.
--
-- WHAT STAYS ON THE CLIENT, DELIBERATELY: the category → bucket map. Budgets
-- use a 7-jar vocabulary (Needs, Play, Giving, …) while transactions use
-- everyday categories (Rent, Transport, …), and `CATEGORY_TO_BUCKET` is the one
-- place that relationship is defined. Its comment says it is meant to become a
-- per-tenant table later; copying it into SQL now would create the second
-- definition that comment exists to prevent. So this returns spend grouped by
-- CATEGORY per budget row, and the client folds categories into jars. That is
-- at most `budgets × categories` rows — a hundred or so — instead of the whole
-- ledger.
--
-- Currency is summed raw, matching `deriveSpent`. See the note in
-- `20260810150000` about not changing displayed money inside a perf change.

create or replace function public.budget_spend(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not is_tenant_member(p_tenant_id, 'viewer') then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    into v_rows
  from (
    select
      b.id       as budget_id,
      t.category as category,
      sum(t.amount) as total,
      count(*)      as count
    from budgets b
    join lateral (
      -- The same half-open window periodWindow() builds, on UTC date parts so
      -- it cannot shift by timezone. Month-end clamping is inherent in using
      -- day-of-month on the following month.
      select
        b.period_start::timestamptz as w_start,
        (b.period_start + case coalesce(b.period, 'monthly')
                            when 'weekly' then interval '7 days'
                            when 'yearly' then interval '1 year'
                            else interval '1 month'
                          end)::timestamptz as w_end
    ) w on true
    join transactions t
      on t.tenant_id = b.tenant_id
     and t.type = 'expense'
     and t.occurred_at >= w.w_start
     and t.occurred_at <  w.w_end
    where b.tenant_id = p_tenant_id
    group by b.id, t.category
  ) r;

  return v_rows;
end;
$$;

comment on function public.budget_spend(uuid) is
  'Stage 4.2: expense totals per budget row per category, using each row''s own period window, so useBudgetSpend stops downloading the whole ledger. The category-to-bucket map stays in src/lib/budgetBuckets.ts on purpose — do not duplicate it here.';

revoke all on function public.budget_spend(uuid) from public, anon;
grant execute on function public.budget_spend(uuid) to authenticated;
