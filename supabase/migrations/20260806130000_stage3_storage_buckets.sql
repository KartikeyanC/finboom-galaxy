-- ===========================================================================
-- Stage 3.3 / BUG-043 — insurance documents and the branding logo move to
-- Supabase Storage, with server-enforced size caps and MIME validation.
--
-- ---- What was wrong -------------------------------------------------------
--
-- `insurance.document_data_url` held a whole PDF or photo as a base64 data URL
-- in a Postgres text column, and the file picker enforced NO size limit at all.
-- Consequences:
--
--   * `useInsurance()` selects every column, so opening the Insurance page
--     downloaded every policy's full document — a handful of 5 MB scans is a
--     40 MB+ PostgREST response on every mount, and base64 inflates by ~33%;
--   * documents sat inside row backups and every `SELECT *` in the app;
--   * nothing validated the file type, so any bytes could be stored and later
--     handed to an <iframe> as a trusted data: URL.
--
-- The branding logo has the same shape (a data URI inside
-- `site_settings.landing_branding`) but is far smaller — it is already
-- downscaled to 256px client-side. It moves too, so there is one answer to
-- "where do uploaded files live", and because the SVG branch stored arbitrary
-- user-supplied markup inline.
--
-- ---- Why buckets rather than a bigger column ------------------------------
--
-- Storage gives us the two controls BUG-043 actually asks for as BUCKET
-- properties, enforced by the server rather than by whichever client happens
-- to be calling: `file_size_limit` and `allowed_mime_types`. A column cannot
-- express either.
--
-- ---- Path convention (load-bearing) ---------------------------------------
--
--   insurance-docs/<tenant_id>/<policy_id>/<filename>
--   branding/logo/<filename>
--
-- The FIRST path segment of an insurance object is the tenant id, and the RLS
-- policies below derive authorisation from it. That is the whole access model,
-- so the client must never write an object anywhere else — `insuranceDocs.ts`
-- builds the path and is the only thing allowed to.
--
-- ---- Menu gating (2.15 contract) ------------------------------------------
--
-- The `insurance` TABLE is gated by the `insurance` menu. If the bucket were
-- not gated identically, a workspace without the module could still fetch the
-- files — the row would be invisible while its attachment was not. The storage
-- policies therefore repeat `has_menu(tenant, 'insurance')`.
-- ===========================================================================

-- ---- 1. a total helper for "which tenant owns this object?" ---------------
-- storage.foldername() returns text[]; casting segment 1 to uuid throws on a
-- malformed path, and an exception inside an RLS policy is an ERROR, not a
-- denial. Returning NULL instead makes a bad path fail closed, because
-- is_tenant_member(NULL, …) is false.

CREATE OR REPLACE FUNCTION public.storage_object_tenant(p_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN (storage.foldername(p_name))[1]::uuid;
EXCEPTION
  WHEN others THEN RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.storage_object_tenant(text) IS
  'Stage 3.3. First path segment of a storage object as a tenant uuid, or NULL '
  'when the path is malformed. NULL makes the storage policies fail closed.';

REVOKE ALL ON FUNCTION public.storage_object_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_object_tenant(text) TO authenticated, anon;

-- ---- 2. buckets -----------------------------------------------------------
-- Limits are server-enforced: Storage rejects an oversized or wrong-typed
-- upload regardless of what the client believes.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'insurance-docs', 'insurance-docs',
  false,                      -- private: reachable only via a signed URL
  10485760,                   -- 10 MB; a scanned policy comfortably fits
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding', 'branding',
  true,                       -- public: the logo renders for anonymous
                              -- visitors on the landing page and the auth screen
  2097152,                    -- 2 MB; logos are downscaled to 256px first
  ARRAY['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---- 3. insurance-docs policies ------------------------------------------
-- Mirrors the `insurance` table exactly: viewer reads, admin writes, and the
-- same menu gate. `is_tenant_member` also carries 2.8's suspension rule, so a
-- suspended workspace can still read its own documents but not add more.

DROP POLICY IF EXISTS insurance_docs_select ON storage.objects;
CREATE POLICY insurance_docs_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'insurance-docs'
    AND public.is_tenant_member(public.storage_object_tenant(name), 'viewer')
    AND public.has_menu(public.storage_object_tenant(name), 'insurance')
  );

DROP POLICY IF EXISTS insurance_docs_insert ON storage.objects;
CREATE POLICY insurance_docs_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'insurance-docs'
    AND public.is_tenant_member(public.storage_object_tenant(name), 'admin')
    AND public.has_menu(public.storage_object_tenant(name), 'insurance')
  );

DROP POLICY IF EXISTS insurance_docs_update ON storage.objects;
CREATE POLICY insurance_docs_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'insurance-docs'
    AND public.is_tenant_member(public.storage_object_tenant(name), 'admin')
    AND public.has_menu(public.storage_object_tenant(name), 'insurance')
  )
  WITH CHECK (
    bucket_id = 'insurance-docs'
    AND public.is_tenant_member(public.storage_object_tenant(name), 'admin')
    AND public.has_menu(public.storage_object_tenant(name), 'insurance')
  );

DROP POLICY IF EXISTS insurance_docs_delete ON storage.objects;
CREATE POLICY insurance_docs_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'insurance-docs'
    AND public.is_tenant_member(public.storage_object_tenant(name), 'admin')
    AND public.has_menu(public.storage_object_tenant(name), 'insurance')
  );

-- ---- 4. branding policies -------------------------------------------------
-- Read is open because the bucket is public (the landing page is anonymous).
-- Writing is Product-Owner only — the logo is the app's identity, and letting a
-- tenant change it would let them repaint the product for everybody.

DROP POLICY IF EXISTS branding_read ON storage.objects;
CREATE POLICY branding_read ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS branding_write ON storage.objects;
CREATE POLICY branding_write ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'branding' AND public.is_platform_admin());

DROP POLICY IF EXISTS branding_update ON storage.objects;
CREATE POLICY branding_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'branding' AND public.is_platform_admin())
  WITH CHECK (bucket_id = 'branding' AND public.is_platform_admin());

DROP POLICY IF EXISTS branding_delete ON storage.objects;
CREATE POLICY branding_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'branding' AND public.is_platform_admin());

-- ---- 5. insurance.document_path ------------------------------------------
-- `document_data_url` is deliberately KEPT rather than dropped: on a database
-- that already holds inline documents, dropping it would destroy them before
-- anything had copied them out. The client prefers `document_path` and falls
-- back to the old column, so existing rows keep working and new ones never
-- write inline. (This project's `insurance` table is empty, so there is nothing
-- to backfill here — the column survives for deployments that are not.)

ALTER TABLE public.insurance ADD COLUMN IF NOT EXISTS document_path text;

COMMENT ON COLUMN public.insurance.document_path IS
  'Stage 3.3. Object path in the insurance-docs bucket: <tenant_id>/<policy_id>/<file>. '
  'Supersedes document_data_url, which is retained only for pre-3.3 rows.';

COMMENT ON COLUMN public.insurance.document_data_url IS
  'DEPRECATED (Stage 3.3). Inline base64 document. Do not write. New uploads go '
  'to Storage and set document_path instead.';

-- ===========================================================================
-- Post-apply verification
--
--   SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets;
--   -- expect insurance-docs private/10485760, branding public/2097152
--
--   SELECT policyname FROM pg_policies
--    WHERE schemaname='storage' AND tablename='objects' ORDER BY 1;   -- expect 8
--
--   -- the helper fails closed rather than raising
--   SELECT public.storage_object_tenant('not-a-uuid/x.pdf');          -- expect NULL
--
--   -- as a real user (assert on rows, not status):
--   --   upload  <own tenant>/<policy>/f.pdf   -> ok
--   --   upload  <other tenant>/…              -> denied
--   --   upload  a .txt                        -> denied by allowed_mime_types
--   --   upload  > 10 MB                       -> denied by file_size_limit
-- ===========================================================================
