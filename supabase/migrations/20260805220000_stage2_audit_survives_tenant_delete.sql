-- =============================================================================
-- Found while executing test case TEN-008 (delete a workspace, check the
-- cascade). The cascade works — too well.
--
-- BUG-078: deleting a workspace erased its own audit trail.
--   `po_delete_tenant` writes a `tenant.delete` row and then deletes the
--   tenant. `audit_log_tenant_id_fkey` is ON DELETE CASCADE, so that row — and
--   every earlier row for the workspace, including `tenant.create` — was
--   removed in the same transaction. The most destructive action in the PO
--   console left no trace whatsoever. Measured: after creating and deleting a
--   workspace, `audit_log` held zero `tenant.create` / `tenant.delete` rows.
--
-- BUG-079: `po_delete_tenant` on an id that does not exist raised a raw
--   foreign-key error (23503) from the audit insert instead of saying so.
--
-- Fix: audit rows outlive the workspace (tenant_id becomes NULL, and the id and
-- name are kept in the metadata), and the function checks before it acts.
-- =============================================================================

-- ---- 1. audit rows survive their workspace --------------------------------
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_tenant_id_fkey;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;

-- A row whose workspace is gone has tenant_id NULL, so `is_tenant_member(NULL,
-- 'owner')` is false and only a platform admin can read it. That is the right
-- audience for "this workspace was deleted" — but the policy has to be explicit
-- rather than relying on a NULL comparison quietly evaluating to false.
DROP POLICY IF EXISTS audit_select ON public.audit_log;
CREATE POLICY audit_select ON public.audit_log FOR SELECT
  USING (
    (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id, 'owner'))
    OR public.is_platform_admin()
  );

-- ---- 2. deletion is recorded, and refuses cleanly -------------------------
CREATE OR REPLACE FUNCTION public.po_delete_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT name INTO v_name FROM public.tenants WHERE id = p_tenant_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No such workspace';
  END IF;

  DELETE FROM public.tenants WHERE id = p_tenant_id;

  -- Logged AFTER the delete, with tenant_id left NULL: the workspace no longer
  -- exists to reference, and the identifying details live in the metadata so
  -- the record still means something a year from now.
  PERFORM public.log_audit(
    NULL, 'tenant.delete', 'tenant', p_tenant_id::text,
    jsonb_build_object('tenant_id', p_tenant_id, 'name', v_name)
  );
END;
$$;

-- =============================================================================
-- Post-apply verification (as a platform admin):
--   SELECT public.po_create_tenant('Audit probe', '<an existing email>');
--   SELECT public.po_delete_tenant('<the id it returned>');
--   SELECT action, tenant_id, metadata FROM audit_log
--    WHERE action IN ('tenant.create','tenant.delete') ORDER BY created_at DESC;
--   -- expect BOTH rows present; the delete row has tenant_id NULL and a
--   -- metadata name; the create row now has tenant_id NULL too (SET NULL).
--
--   SELECT public.po_delete_tenant('00000000-0000-0000-0000-0000000000ff');
--   -- expect ERROR "No such workspace", not a foreign-key violation
-- =============================================================================
