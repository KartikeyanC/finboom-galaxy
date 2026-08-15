-- ===========================================================================
-- Stage 3.6 — retention and pruning for audit_log, notifications and
-- subscriptions.raw.
--
-- All three grow without limit and none of them is worth keeping forever:
--
--   * `audit_log` gains a row per privileged action, for every workspace, for
--     all time;
--   * `notifications` are transient by definition — a read one from last year
--     is dead weight in a table the bell polls every 60 seconds;
--   * `subscriptions.raw` stores the FULL provider webhook payload, which
--     contains customer and billing details we do not need once the columns
--     derived from it are set. Keeping it indefinitely is a data-minimisation
--     problem (DPDP/GDPR), not just a size one.
--
-- ---- Retention chosen -----------------------------------------------------
--
--   audit_log            400 days   — over a year, so an annual review can
--                                     always look back one full cycle.
--   notifications (read)  90 days   — long past useful; the user has seen it.
--   notifications (unread) 365 days — an unread one is still a message TO
--                                     someone, so it gets far longer.
--   subscriptions.raw     60 days   — past any realistic dispute or webhook
--                                     replay window. The row itself is kept;
--                                     only the payload is nulled.
--
-- ---- What is deliberately NOT pruned --------------------------------------
--
-- Audit rows with `tenant_id IS NULL` are the tombstones written by
-- `po_delete_tenant` (Stage 2, BUG-078) — the record that a workspace once
-- existed and was deleted. Ageing those out would re-create exactly the hole
-- that bug was about, so they are exempt regardless of age.
--
-- Nothing here touches financial records. Transactions, budgets, goals,
-- accounts and net-worth snapshots are the user's own data and are never
-- pruned on a timer.
-- ===========================================================================

-- ---- 1. the knobs ---------------------------------------------------------
-- Stored rather than hard-coded so a retention change is an UPDATE, not a
-- migration — and so the current policy is inspectable in one place.

CREATE TABLE IF NOT EXISTS public.retention_policy (
  key         text PRIMARY KEY,
  days        integer NOT NULL CHECK (days > 0),
  description text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.retention_policy (key, days, description) VALUES
  ('audit_log',            400, 'Audit rows are deleted after this many days. Tombstones for deleted workspaces (tenant_id IS NULL) are exempt.'),
  ('notifications_read',    90, 'Notifications the user has already read.'),
  ('notifications_unread', 365, 'Notifications never opened — kept far longer, they are still a message to someone.'),
  ('subscriptions_raw',     60, 'Provider webhook payload is nulled after this many days; the subscription row is kept.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.retention_policy ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.retention_policy TO authenticated;
GRANT ALL ON public.retention_policy TO service_role;

-- Only a platform admin needs to see the policy; it is operational, not tenant data.
DROP POLICY IF EXISTS retention_select ON public.retention_policy;
CREATE POLICY retention_select ON public.retention_policy FOR SELECT
  USING (public.is_platform_admin());

-- ---- 2. the pruner --------------------------------------------------------

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
  d_audit         integer;
  d_read          integer;
  d_unread        integer;
  d_raw           integer;
BEGIN
  SELECT days INTO d_audit  FROM public.retention_policy WHERE key = 'audit_log';
  SELECT days INTO d_read   FROM public.retention_policy WHERE key = 'notifications_read';
  SELECT days INTO d_unread FROM public.retention_policy WHERE key = 'notifications_unread';
  SELECT days INTO d_raw    FROM public.retention_policy WHERE key = 'subscriptions_raw';

  -- Missing policy row => do nothing, rather than fall back to a default that
  -- silently deletes on a schedule. Destructive work needs an explicit mandate.
  IF d_audit IS NULL OR d_read IS NULL OR d_unread IS NULL OR d_raw IS NULL THEN
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

  RETURN jsonb_build_object(
    'audit_deleted',             v_audit,
    'notifications_read_deleted',   v_notif_read,
    'notifications_unread_deleted', v_notif_unread,
    'subscription_payloads_cleared', v_raw,
    'ran_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.prune_expired_data() IS
  'Stage 3.6. Applies public.retention_policy. Returns per-table counts. '
  'Scheduled nightly by pg_cron; safe to run by hand.';

-- Maintenance only — never callable by an end user.
REVOKE ALL ON FUNCTION public.prune_expired_data() FROM PUBLIC;

-- ---- 3. schedule ----------------------------------------------------------
-- 03:10 UTC, after the subscription jobs at 02:15 / 02:30 so a row expired
-- overnight is already in its final state before anything is pruned.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finroot-prune-expired-data') THEN
    PERFORM cron.unschedule('finroot-prune-expired-data');
  END IF;
  PERFORM cron.schedule(
    'finroot-prune-expired-data',
    '10 3 * * *',
    $job$SELECT public.prune_expired_data();$job$
  );
END;
$$;

-- ===========================================================================
-- Post-apply verification
--
--   SELECT * FROM public.retention_policy ORDER BY key;
--   SELECT public.prune_expired_data();      -- expect all-zero counts on a
--                                            -- young database
--   -- an old, read notification is removed; an old tombstone is not:
--   INSERT INTO public.notifications (user_id, type, title, body, read_at, created_at)
--   VALUES (<uid>, 'test', 't', 'b', now(), now() - interval '200 days');
--   SELECT public.prune_expired_data();      -- notifications_read_deleted = 1
-- ===========================================================================
