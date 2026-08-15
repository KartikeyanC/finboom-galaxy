-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 1a — security hardening
--
-- Closes five findings from the 2026-08-04 production-readiness audit:
--   BUG-001 / SEC-001  CRITICAL  tenant owners can self-upgrade their plan
--   BUG-003 / SEC-014  HIGH      audit_log forgery via public log_audit()
--   BUG-004 / SEC-014  HIGH      notification spoofing via public create_notification()
--   BUG-041            MEDIUM    any user can create orphan tenants
--   BUG-009            LOW       trips.kind rejects the 'other' type the UI offers
--
-- Every statement is idempotent so this can be re-applied safely.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── BUG-001 · plan self-upgrade ─────────────────────────────────────────────
-- `sub_update` let anyone with the owner role UPDATE their own subscriptions
-- row. Combined with the never-revoked table GRANT from the pre-tenancy
-- migration (20260601063818) and a world-readable `plans` table, an owner could
-- simply PATCH plan_id to the Pro plan's id and unlock every paid menu.
--
-- Billing rows must only ever be written by the payment provider path, which
-- runs as service_role (billing-api / payments-webhook) and is unaffected by
-- both the policy drop and the GRANT revoke below.
DROP POLICY IF EXISTS sub_update ON public.subscriptions;

-- Defense in depth: RLS already denies writes with no policy present, but the
-- table-level privilege should not be sitting there either.
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;

-- SELECT stays: `sub_select` (viewer-or-PO) backs the billing page and
-- useSubscription(). Only the write paths are removed.

-- ── BUG-003 / BUG-004 · default PUBLIC EXECUTE never revoked ────────────────
-- Postgres grants EXECUTE to PUBLIC on new functions by default. These four are
-- SECURITY DEFINER, so any signed-in user could call them with the definer's
-- authority: forging audit_log entries (destroying the audit trail's value) and
-- pushing arbitrary notifications to any user_id.
--
-- Internal callers are unaffected: these are only ever invoked from other
-- SECURITY DEFINER functions, which execute as the definer, not the caller.
REVOKE EXECUTE ON FUNCTION public.log_audit(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

-- Scheduled/maintenance routines — service_role or pg_cron only.
REVOKE EXECUTE ON FUNCTION public.expire_subscriptions()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_expiring_subscriptions(int)
  FROM PUBLIC, anon, authenticated;

-- ── BUG-041 · orphan tenant creation ────────────────────────────────────────
-- `tenants_insert` allowed any authenticated user to INSERT a tenant as long as
-- created_by = auth.uid(). No membership row is created by that path, so the
-- result is an unreachable tenant that still counts in PO tenant listings.
--
-- Legitimate tenant creation goes through SECURITY DEFINER functions
-- (handle_new_user on signup, po_create_tenant for the PO console), both of
-- which bypass RLS entirely.
DROP POLICY IF EXISTS tenants_insert ON public.tenants;

-- ── BUG-009 · the "other" trip type ─────────────────────────────────────────
-- TripKind in src/lib/tripsStore.ts includes 'other' and the Trips UI offers it,
-- but the CHECK constraint predates it, so saving such a trip fails at insert.
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_kind_check;
ALTER TABLE public.trips ADD  CONSTRAINT trips_kind_check
  CHECK (kind IN ('solo', 'friends', 'family', 'other'));

-- ═══════════════════════════════════════════════════════════════════════════
-- Post-apply verification (run manually; all four should hold)
--
--   -- 1. no write policies remain on subscriptions
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname='public' AND tablename='subscriptions';
--   -- expect: only sub_select / SELECT
--
--   -- 2. authenticated has no write privilege on subscriptions
--   SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE table_name='subscriptions' AND grantee='authenticated';
--   -- expect: SELECT only
--
--   -- 3. the four functions are no longer executable by authenticated
--   SELECT p.proname,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS can_exec
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public'
--      AND p.proname IN ('log_audit','create_notification',
--                        'expire_subscriptions','notify_expiring_subscriptions');
--   -- expect: can_exec = false for all four
--
--   -- 4. trips accepts 'other'
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname='trips_kind_check';
-- ═══════════════════════════════════════════════════════════════════════════
