-- ===========================================================================
-- Stage 3.7 / BUG-057 — actually schedule the maintenance functions.
--
-- `expire_subscriptions()` and `notify_expiring_subscriptions(days)` have
-- existed since Phase 4 and Phase 6 and have never once run on a schedule.
--
-- Expiry was "lazy" — `tenant_subscription_status()` computes an expired status
-- on the fly, so the UI was right — but the `subscriptions.status` COLUMN kept
-- saying 'active' forever. Anything reading the column rather than calling the
-- function (a report, an export, a future webhook) saw a lapsed workspace as a
-- paying one. And the renewal warning simply never reached anybody.
--
-- ---- Why pg_cron and not an external scheduler ----------------------------
--
-- Both functions are plain SQL already running as SECURITY DEFINER inside this
-- database. An external cron would mean an edge function, a service-role key in
-- one more place, and a network hop, to call something Postgres can call
-- itself. pg_cron is available on this project (1.6.4).
--
-- ---- Scheduling notes -----------------------------------------------------
--
-- * Times are UTC. 02:15 UTC is ~07:45 IST — after midnight rollovers, before
--   the working day, and deliberately not on the hour where every other
--   scheduled job in the world piles up.
-- * The jobs are idempotent by nature: expiry only moves rows whose period has
--   already ended, and the notifier is guarded by its own dedupe. Re-running is
--   harmless, which is what makes a missed run a non-event.
-- * `cron.schedule` upserts by job name, but unscheduling first keeps the
--   migration replayable even if a name's SQL changed.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_cron lives in its own schema and only the postgres role should touch it.
REVOKE ALL ON SCHEMA cron FROM PUBLIC;

DO $$
DECLARE
  j text;
BEGIN
  -- Replayable: drop ours by name before (re)creating them.
  FOREACH j IN ARRAY ARRAY[
    'finroot-expire-subscriptions',
    'finroot-notify-expiring-subscriptions'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;

  -- Daily 02:15 UTC — flip lapsed subscriptions to 'expired'.
  PERFORM cron.schedule(
    'finroot-expire-subscriptions',
    '15 2 * * *',
    $job$SELECT public.expire_subscriptions();$job$
  );

  -- Daily 02:30 UTC — warn owners 7 days out. Runs AFTER expiry so a
  -- subscription that lapsed overnight is not also told it is "expiring soon".
  PERFORM cron.schedule(
    'finroot-notify-expiring-subscriptions',
    '30 2 * * *',
    $job$SELECT public.notify_expiring_subscriptions(7);$job$
  );
END;
$$;

-- ===========================================================================
-- Post-apply verification
--
--   SELECT jobname, schedule, active, command FROM cron.job ORDER BY jobname;
--   -- expect the two finroot-* jobs, active = true
--
--   -- run one by hand and confirm it does something sane:
--   SELECT public.expire_subscriptions();
--
--   -- after the first scheduled fire:
--   SELECT jobname, status, return_message, start_time
--     FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- ===========================================================================
