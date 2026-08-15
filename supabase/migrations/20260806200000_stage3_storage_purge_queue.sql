-- ===========================================================================
-- Stage 3.5 fix — Postgres CANNOT delete storage objects.
--
-- `purge_tenant_storage()` (previous migration) tried `DELETE FROM
-- storage.objects`. Supabase installs a trigger that forbids exactly that:
--
--   ERROR 42501: Direct deletion from storage tables is not allowed.
--                Use the Storage API instead.
--   HINT: This prevents accidental data loss from orphaned objects.
--   CONTEXT: PL/pgSQL function storage.protect_delete()
--
-- The trigger is right: deleting the ROW would orphan the FILE, since the row
-- is only an index of object storage. Removing a file genuinely requires the
-- Storage HTTP API, which Postgres has no business calling.
--
-- Consequence: the whole purge failed, because the storage step raised before
-- the tenant delete. So a workspace past its 30 days was never purged at all —
-- a broken feature, not a partial one. That is what the test caught.
--
-- ---- The fix: record the intent, drain it where the API lives -------------
--
-- The purge now ENQUEUES the tenant's storage prefix and deletes the workspace.
-- Draining the queue is done by something holding a service-role key and
-- speaking the Storage API.
--
-- This is deliberately not hidden behind a "success" return value: the queue is
-- a visible, inspectable list of files that still exist and should not. If the
-- drain never runs, `SELECT * FROM storage_purge_queue WHERE completed_at IS
-- NULL` says so plainly, which is a much better failure mode than a function
-- that quietly reported it had deleted files it could not delete.
--
-- ⚠️ BUG-086 is therefore only fully closed once a drain runs. See the roadmap.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.storage_purge_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,          -- NOT a FK: the workspace is being deleted
  bucket_id    text NOT NULL,
  path_prefix  text NOT NULL,
  object_count integer,                -- how many rows existed when queued
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error   text
);

COMMENT ON TABLE public.storage_purge_queue IS
  'Stage 3.5. Storage prefixes belonging to purged workspaces. Postgres cannot '
  'delete storage objects (storage.protect_delete), so the files are removed by '
  'a drain that speaks the Storage API. Rows with completed_at IS NULL are files '
  'that still exist and should not.';

CREATE INDEX IF NOT EXISTS storage_purge_queue_pending_idx
  ON public.storage_purge_queue (requested_at) WHERE completed_at IS NULL;

ALTER TABLE public.storage_purge_queue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.storage_purge_queue TO authenticated;
GRANT ALL ON public.storage_purge_queue TO service_role;

-- Operational data: platform admins only.
DROP POLICY IF EXISTS storage_purge_queue_select ON public.storage_purge_queue;
CREATE POLICY storage_purge_queue_select ON public.storage_purge_queue FOR SELECT
  USING (public.is_platform_admin());

-- ---- enqueue instead of delete -------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_tenant_storage(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Count what is there so the queue row says how much is outstanding. Reading
  -- storage.objects is allowed; only deleting is not.
  SELECT count(*) INTO v_count
    FROM storage.objects
   WHERE bucket_id = 'insurance-docs'
     AND public.storage_object_tenant(name) = p_tenant_id;

  IF v_count > 0 THEN
    INSERT INTO public.storage_purge_queue (tenant_id, bucket_id, path_prefix, object_count)
    VALUES (p_tenant_id, 'insurance-docs', p_tenant_id::text || '/', v_count);
  END IF;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.purge_tenant_storage(uuid) IS
  'Stage 3.5. Queues a tenant''s storage prefix for deletion and returns how '
  'many objects are outstanding. Does NOT delete — storage.protect_delete() '
  'forbids it; the drain uses the Storage API.';

REVOKE ALL ON FUNCTION public.purge_tenant_storage(uuid) FROM PUBLIC;

-- ---- let a drain report back ---------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_storage_purge(
  p_id uuid, p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.storage_purge_queue
     SET completed_at = CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
         last_error   = p_error
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_storage_purge(uuid, text) TO authenticated;

-- ---- surface the backlog to the PO console -------------------------------

CREATE OR REPLACE FUNCTION public.po_pending_storage_purges()
RETURNS TABLE (id uuid, tenant_id uuid, bucket_id text, path_prefix text,
               object_count integer, requested_at timestamptz, last_error text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT q.id, q.tenant_id, q.bucket_id, q.path_prefix, q.object_count,
           q.requested_at, q.last_error
      FROM public.storage_purge_queue q
     WHERE q.completed_at IS NULL
     ORDER BY q.requested_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.po_pending_storage_purges() TO authenticated;

-- ===========================================================================
-- Draining the queue (operator step, until an edge function does it):
--
--   for each row from po_pending_storage_purges():
--     GET  /storage/v1/object/list/<bucket>   {"prefix": "<path_prefix>"}
--     DELETE /storage/v1/object/<bucket>/<name>   for each object
--     SELECT public.complete_storage_purge('<id>');
--
-- Verify:
--   SELECT public.purge_expired_tenants();     -- now succeeds
--   SELECT * FROM public.storage_purge_queue;  -- one row per purged workspace
--                                              -- that still had files
-- ===========================================================================
