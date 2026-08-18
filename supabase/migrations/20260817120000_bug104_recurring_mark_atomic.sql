-- BUG-104 — marking a recurring item paid/received was two independent
-- client-side writes (insert the transaction, then advance next_due_date)
-- with nothing tying them together. A retry of either call — a double
-- click before the button disabled, a network retry, React Query's own
-- default retry:1 — could insert a second, real transaction for the same
-- due date with zero errors.
--
-- Fixed two ways at once, same as BUG-040's goal_contribute()/
-- budget_set_allocation() pattern:
--   1. A UNIQUE constraint makes a second transaction for the same
--      recurring item + due date a hard conflict, not silently possible.
--   2. mark_recurring_generated() does the insert and the advance in one
--      transaction, row-locked, so a genuine concurrent retry queues
--      behind the first call instead of racing it.

-- Partial unique index: source_recurring_id is null for every ordinary,
-- non-generated transaction, so this only constrains the rows this feature
-- itself creates.
CREATE UNIQUE INDEX transactions_recurring_period_unique
  ON public.transactions (source_recurring_id, occurred_at)
  WHERE source_recurring_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_recurring_generated(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item public.recurring_items%ROWTYPE;
  v_next date;
  v_description text;
  v_y int; v_m int; v_d int;
  v_target_y int; v_target_m int; v_last_day int;
BEGIN
  -- FOR UPDATE is the whole point: a concurrent retry for the same item
  -- queues here instead of racing the insert below.
  SELECT * INTO v_item FROM public.recurring_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'No such recurring item';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so the membership check is explicit —
  -- 'admin', matching this table's own ri_insert/ri_update policies.
  IF NOT public.is_tenant_member(v_item.tenant_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT v_item.is_active THEN
    RAISE EXCEPTION 'This item is no longer active';
  END IF;

  v_description := v_item.name || CASE WHEN v_item.notes IS NOT NULL AND v_item.notes <> ''
                                        THEN ' — ' || v_item.notes ELSE '' END;

  -- The UNIQUE index is the real backstop: if two calls somehow both reach
  -- this point for the same (item, due date) — the lock above should
  -- already prevent it, but a lock is not a constraint — the second insert
  -- fails 23505 instead of creating a duplicate row.
  INSERT INTO public.transactions (
    user_id, tenant_id, type, amount, currency, category, description,
    occurred_at, source_recurring_id
  ) VALUES (
    auth.uid(), v_item.tenant_id, v_item.type, v_item.amount, v_item.currency,
    v_item.category, v_description, v_item.next_due_date::timestamptz, v_item.id
  );

  IF v_item.frequency = 'one-time' THEN
    UPDATE public.recurring_items
    SET is_active = false, last_generated_at = now()
    WHERE id = v_item.id;
  ELSIF v_item.frequency = 'weekly' THEN
    v_next := v_item.next_due_date + 7;
    UPDATE public.recurring_items SET next_due_date = v_next, last_generated_at = now() WHERE id = v_item.id;
  ELSE
    -- monthly/yearly: mirrors the client's own bumpDate() (BUG-038) exactly
    -- — step the calendar month/year, then clamp the day to the target
    -- month's real length, so Jan 31 + 1 month lands on Feb 28/29, not
    -- March 3, and a Feb-29 yearly item lands on Feb 28 in a non-leap year.
    v_y := EXTRACT(year FROM v_item.next_due_date)::int;
    v_m := EXTRACT(month FROM v_item.next_due_date)::int;
    v_d := EXTRACT(day FROM v_item.next_due_date)::int;
    IF v_item.frequency = 'yearly' THEN
      v_target_y := v_y + 1;
      v_target_m := v_m;
    ELSE -- monthly
      v_target_m := CASE WHEN v_m = 12 THEN 1 ELSE v_m + 1 END;
      v_target_y := CASE WHEN v_m = 12 THEN v_y + 1 ELSE v_y END;
    END IF;
    v_last_day := EXTRACT(day FROM (make_date(v_target_y, v_target_m, 1) + interval '1 month' - interval '1 day'))::int;
    v_next := make_date(v_target_y, v_target_m, LEAST(v_d, v_last_day));

    UPDATE public.recurring_items
    SET next_due_date = v_next, last_generated_at = now()
    WHERE id = v_item.id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_recurring_generated(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_recurring_generated(uuid) TO authenticated;
