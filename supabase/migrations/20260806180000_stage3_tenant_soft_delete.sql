-- ===========================================================================
-- Stage 3.5 / UX-044 — soft-delete for workspaces: a 30-day window, then purge.
--
-- `po_delete_tenant` was an immediate, irreversible `DELETE FROM tenants`, and
-- every tenant-scoped table cascades from it. One mis-click in the PO console
-- destroyed a customer's entire financial history with no confirmation step
-- that could be taken back and no way to get it out first.
--
-- ---- The model ------------------------------------------------------------
--
--   active ──po_delete_tenant──▶ deleted (deleted_at = now())
--      ▲                              │
--      └──── po_restore_tenant ───────┘   (any time inside the window)
--                                     │
--                                     └── purge_expired_tenants() after 30 days
--                                         → the real DELETE
--
-- `tenants.status` already allowed 'deleted' (the CHECK has carried it since
-- Phase 1) and Stage 2.8 already made `is_tenant_member()` refuse everything
-- for a deleted workspace — so the access consequences of this state are
-- already built and tested. All that was missing was the clock and the way back.
--
-- ---- Deleted means unreachable, not merely hidden --------------------------
--
-- Verified in 2.8: with status='deleted' a member reads 0 rows and every write
-- is refused. So during the window the data is inert — it exists for restore
-- and for export by a platform admin, and for nobody else.
--
-- ---- 🔴 Storage does NOT cascade (BUG-086) ---------------------------------
--
-- `storage.objects` has no foreign key to `tenants`. Measured during Stage 3.3:
-- after deleting a workspace, its uploaded policy documents were still sitting
-- in the bucket. So the purge deletes the tenant's storage rows explicitly.
--
-- Deleting from `storage.objects` removes the row and Supabase's own cleanup
-- reclaims the backing file. This is the one place in the codebase allowed to
-- delete storage rows in bulk, and it is scoped to a single tenant's prefix.
-- ===========================================================================

-- ---- 1. the clock ---------------------------------------------------------

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.tenants.deleted_at IS
  'Stage 3.5. When the workspace was soft-deleted. Purged 30 days later by '
  'purge_expired_tenants(). NULL whenever status <> ''deleted''.';

CREATE INDEX IF NOT EXISTS tenants_deleted_at_idx
  ON public.tenants (deleted_at) WHERE deleted_at IS NOT NULL;

INSERT INTO public.retention_policy (key, days, description)
VALUES ('deleted_tenants', 30,
        'Days a soft-deleted workspace is retained before it is permanently purged.')
ON CONFLICT (key) DO NOTHING;

-- ---- 2. delete becomes soft ----------------------------------------------

CREATE OR REPLACE FUNCTION public.po_delete_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT name INTO v_name FROM public.tenants WHERE id = p_tenant_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No such workspace';   -- BUG-079: not a raw FK error
  END IF;

  UPDATE public.tenants
     SET status = 'deleted',
         deleted_at = COALESCE(deleted_at, now())   -- re-deleting must not
   WHERE id = p_tenant_id;                          -- restart the clock

  -- Still logged against the workspace: unlike a purge, it still exists.
  PERFORM public.log_audit(p_tenant_id, 'tenant.soft_delete', 'tenant',
    p_tenant_id::text, jsonb_build_object('name', v_name, 'restorable_until',
      (now() + make_interval(days => (SELECT days FROM public.retention_policy
                                       WHERE key = 'deleted_tenants')))));
END;
$$;

CREATE OR REPLACE FUNCTION public.po_restore_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT status INTO v_status FROM public.tenants WHERE id = p_tenant_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'No such workspace';
  END IF;
  IF v_status <> 'deleted' THEN
    RAISE EXCEPTION 'That workspace is not deleted';
  END IF;

  UPDATE public.tenants
     SET status = 'active', deleted_at = NULL
   WHERE id = p_tenant_id;

  PERFORM public.log_audit(p_tenant_id, 'tenant.restore', 'tenant',
    p_tenant_id::text, NULL);
END;
$$;

-- ---- 3. the purge ---------------------------------------------------------
-- Deliberately separate from the soft delete, and never called by the UI: the
-- only paths to a hard delete are this scheduled job and an explicit
-- po_purge_tenant() for the "delete it now, I am sure" case.

CREATE OR REPLACE FUNCTION public.purge_tenant_storage(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- BUG-086: nothing cascades storage, so the prefix is removed by hand.
  -- Scoped to exactly one tenant's folder — never a bucket-wide wipe.
  DELETE FROM storage.objects
   WHERE bucket_id = 'insurance-docs'
     AND public.storage_object_tenant(name) = p_tenant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_tenant_storage(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.po_purge_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name    text;
  v_status  text;
  v_objects integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT name, status INTO v_name, v_status FROM public.tenants WHERE id = p_tenant_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No such workspace';
  END IF;

  -- A purge must be a deliberate second step. Requiring the soft delete first
  -- means there is no single call that destroys a live workspace.
  IF v_status <> 'deleted' THEN
    RAISE EXCEPTION 'Delete the workspace first — purge only removes an already-deleted one';
  END IF;

  v_objects := public.purge_tenant_storage(p_tenant_id);

  DELETE FROM public.tenants WHERE id = p_tenant_id;

  -- AFTER the delete, so the FK is SET NULL rather than cascading the row away
  -- (BUG-078). The workspace id and name survive in the metadata.
  PERFORM public.log_audit(NULL, 'tenant.purge', 'tenant', p_tenant_id::text,
    jsonb_build_object('tenant_id', p_tenant_id, 'name', v_name,
                       'storage_objects_removed', v_objects));

  RETURN jsonb_build_object('name', v_name, 'storage_objects_removed', v_objects);
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_tenants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days    integer;
  v_purged  integer := 0;
  v_objects integer := 0;
  r         record;
BEGIN
  SELECT days INTO v_days FROM public.retention_policy WHERE key = 'deleted_tenants';
  IF v_days IS NULL THEN
    RAISE EXCEPTION 'retention_policy.deleted_tenants is missing — refusing to purge';
  END IF;

  FOR r IN
    SELECT id, name FROM public.tenants
     WHERE status = 'deleted'
       AND deleted_at IS NOT NULL
       AND deleted_at < now() - make_interval(days => v_days)
  LOOP
    v_objects := v_objects + public.purge_tenant_storage(r.id);
    DELETE FROM public.tenants WHERE id = r.id;
    PERFORM public.log_audit(NULL, 'tenant.purge', 'tenant', r.id::text,
      jsonb_build_object('tenant_id', r.id, 'name', r.name, 'reason', 'retention'));
    v_purged := v_purged + 1;
  END LOOP;

  RETURN jsonb_build_object('tenants_purged', v_purged,
                            'storage_objects_removed', v_objects,
                            'ran_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_tenants() FROM PUBLIC;

-- ---- 4. let the PO see and export what is pending deletion -----------------

CREATE OR REPLACE FUNCTION public.po_list_deleted_tenants()
RETURNS TABLE (
  id uuid, name text, deleted_at timestamptz, purge_after timestamptz, days_left integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT days INTO v_days FROM public.retention_policy WHERE key = 'deleted_tenants';

  RETURN QUERY
    SELECT t.id, t.name, t.deleted_at,
           t.deleted_at + make_interval(days => v_days),
           GREATEST(0, EXTRACT(DAY FROM
             (t.deleted_at + make_interval(days => v_days)) - now())::integer)
      FROM public.tenants t
     WHERE t.status = 'deleted'
     ORDER BY t.deleted_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.po_restore_tenant(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_purge_tenant(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_list_deleted_tenants()    TO authenticated;

-- ---- 5. schedule ----------------------------------------------------------
-- 03:40 UTC, after the nightly prune.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finroot-purge-expired-tenants') THEN
    PERFORM cron.unschedule('finroot-purge-expired-tenants');
  END IF;
  PERFORM cron.schedule(
    'finroot-purge-expired-tenants',
    '40 3 * * *',
    $job$SELECT public.purge_expired_tenants();$job$
  );
END;
$$;

-- ===========================================================================
-- Post-apply verification (as a platform admin)
--
--   SELECT public.po_delete_tenant('<id>');
--   SELECT status, deleted_at FROM public.tenants WHERE id = '<id>';  -- deleted
--   SELECT * FROM public.po_list_deleted_tenants();                   -- 30 days
--   -- the member sees nothing while deleted (assert ROW COUNTS, not status):
--   --   GET /rest/v1/transactions -> 0 rows
--   SELECT public.po_restore_tenant('<id>');                          -- back
--   SELECT public.purge_expired_tenants();                            -- 0, too new
--   SELECT public.po_purge_tenant('<id>');  -- errors: not deleted
-- ===========================================================================
