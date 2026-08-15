-- =============================================================================
-- BUG-008 — payments-webhook hardening: dedup table + retention wiring.
--
-- The other two BUG-008 gaps (no `ts` freshness window, `hex === h1` instead
-- of a constant-time compare) are fixed in `payments-webhook/index.ts` itself
-- and need no schema change. This migration provides the piece the edge
-- function's fix actually depends on: somewhere to record which Paddle
-- `event_id`s have already been processed, so a redelivered — or replayed —
-- event is recognized and skipped rather than re-applied.
--
-- `event_id` is the primary key rather than a separate unique column: the
-- table exists for exactly one lookup (has this id been seen before?) and
-- carries no other identity.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  event_id     text PRIMARY KEY,
  received_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.processed_webhooks IS
  'Stage 1.3 / BUG-008. Paddle event_ids already applied by payments-webhook, '
  'so a redelivery or replay within the ts tolerance window is a no-op.';

ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;
-- service_role only — the edge function is the only writer or reader; no
-- policy is granted to anon/authenticated because none should ever need one.
GRANT ALL ON public.processed_webhooks TO service_role;
REVOKE ALL ON public.processed_webhooks FROM PUBLIC, anon, authenticated;

-- ---- retention: same 60-day window as subscriptions.raw --------------------
-- Long past any realistic Paddle redelivery window (their own retry schedule
-- gives up well within days, not weeks) or dispute window, so keeping these
-- rows around is a data-minimisation cost with no corresponding benefit past
-- that point.
INSERT INTO public.retention_policy (key, days, description) VALUES
  ('processed_webhooks', 60, 'Paddle event_ids kept for replay/redelivery detection. Past this many days, an id this old is not going to be redelivered.')
ON CONFLICT (key) DO NOTHING;

-- ---- wire the purge in -----------------------------------------------------
-- Verbatim copy of prune_expired_data() from 20260806170000_stage3_retention.sql
-- with ONE addition (the processed_webhooks block + its count in the return).
-- Copied rather than patched for the same reason handle_new_user() has been
-- copied before it: there is no ALTER for a function body, and diffing
-- against the live definition matters more than a terse diff here.
CREATE OR REPLACE FUNCTION public.prune_expired_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit         integer := 0;
  v_notif_read    integer := 0;
  v_notif_unread  integer := 0;
  v_raw           integer := 0;
  v_webhooks      integer := 0;
  d_audit         integer;
  d_read          integer;
  d_unread        integer;
  d_raw           integer;
  d_webhooks      integer;
BEGIN
  SELECT days INTO d_audit    FROM public.retention_policy WHERE key = 'audit_log';
  SELECT days INTO d_read     FROM public.retention_policy WHERE key = 'notifications_read';
  SELECT days INTO d_unread   FROM public.retention_policy WHERE key = 'notifications_unread';
  SELECT days INTO d_raw      FROM public.retention_policy WHERE key = 'subscriptions_raw';
  SELECT days INTO d_webhooks FROM public.retention_policy WHERE key = 'processed_webhooks';

  -- Missing policy row => do nothing, rather than fall back to a default that
  -- silently deletes on a schedule. Destructive work needs an explicit mandate.
  IF d_audit IS NULL OR d_read IS NULL OR d_unread IS NULL OR d_raw IS NULL OR d_webhooks IS NULL THEN
    RAISE EXCEPTION 'retention_policy is incomplete — refusing to prune';
  END IF;

  DELETE FROM public.audit_log
   WHERE created_at < now() - make_interval(days => d_audit)
     -- Tombstones for deleted workspaces are permanent (BUG-078).
     AND tenant_id IS NOT NULL;
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  DELETE FROM public.notifications
   WHERE read_at IS NOT NULL
     AND created_at < now() - make_interval(days => d_read);
  GET DIAGNOSTICS v_notif_read = ROW_COUNT;

  DELETE FROM public.notifications
   WHERE read_at IS NULL
     AND created_at < now() - make_interval(days => d_unread);
  GET DIAGNOSTICS v_notif_unread = ROW_COUNT;

  -- Null the payload, keep the subscription. The derived columns
  -- (plan_id, status, current_period_end) are what the app actually reads.
  UPDATE public.subscriptions
     SET raw = NULL
   WHERE raw IS NOT NULL
     AND updated_at < now() - make_interval(days => d_raw);
  GET DIAGNOSTICS v_raw = ROW_COUNT;

  DELETE FROM public.processed_webhooks
   WHERE received_at < now() - make_interval(days => d_webhooks);
  GET DIAGNOSTICS v_webhooks = ROW_COUNT;

  RETURN jsonb_build_object(
    'audit_deleted',             v_audit,
    'notifications_read_deleted',   v_notif_read,
    'notifications_unread_deleted', v_notif_unread,
    'subscription_payloads_cleared', v_raw,
    'processed_webhooks_deleted', v_webhooks,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_expired_data() FROM PUBLIC;
