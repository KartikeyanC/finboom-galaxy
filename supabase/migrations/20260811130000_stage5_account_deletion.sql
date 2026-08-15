-- Stage 5.2 — account deletion requests.
--
-- ⚠️ NOT YET APPLIED. Written to be reviewed and pushed together with the UI
-- change that replaces the email route in DeleteAccountCard.tsx. See
-- docs/runbooks/account-deletion.md for the operator half.
--
-- WHY A QUEUE AND NOT A DELETE:
-- Postgres cannot finish this job. Removing an account means deleting the
-- `auth.users` row and draining the workspace's files from Storage, and
-- neither is reachable from a SECURITY DEFINER function in this project —
-- Storage refuses direct DELETE on its tables (that is exactly why
-- `storage_purge_queue` exists, Stage 3.5), and touching `auth` schema from
-- application SQL is how people lock themselves out of their own project.
--
-- So the user's click records an INTENT, with a grace period, and a
-- service_role operator (or a future edge function) completes it. The same
-- shape the tenant purge already uses, for the same reason.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at      timestamptz NOT NULL DEFAULT now(),
  -- Nothing is destroyed before this moment; the user can cancel until then.
  purge_after       timestamptz NOT NULL,
  cancelled_at      timestamptz,
  completed_at      timestamptz,
  -- What the operator actually did, for the audit trail.
  completion_note   text,
  requester_email   text,
  UNIQUE (user_id)
);

COMMENT ON TABLE public.account_deletion_requests IS
  'Stage 5.2. A user asking for erasure. Postgres cannot delete the auth user or the stored files, so the request is queued and completed with service_role.';

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM anon;
GRANT SELECT ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;

-- A user may see their own request and nothing else. Writes go through the
-- functions below, never straight to the table.
DROP POLICY IF EXISTS adr_select_own ON public.account_deletion_requests;
CREATE POLICY adr_select_own ON public.account_deletion_requests FOR SELECT
  USING (user_id = auth.uid() OR public.is_platform_admin());

-- Retention knob lives with the others rather than hard-coded in a function.
INSERT INTO public.retention_policy (key, days, description)
VALUES ('account_deletion_grace', 30,
        'Days between an account deletion request and the point it can be purged. The user can cancel until then.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS public.account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_row  public.account_deletion_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT days INTO v_days FROM public.retention_policy WHERE key = 'account_deletion_grace';
  IF v_days IS NULL THEN
    -- Same rule as prune_expired_data(): a missing policy row must stop the
    -- world, not silently pick a number that destroys data on a timer.
    RAISE EXCEPTION 'retention_policy.account_deletion_grace is missing';
  END IF;

  INSERT INTO public.account_deletion_requests (user_id, purge_after, requester_email)
  VALUES (auth.uid(), now() + make_interval(days => v_days),
          (SELECT email FROM auth.users WHERE id = auth.uid()))
  ON CONFLICT (user_id) DO UPDATE
     -- Re-requesting must not restart the clock (the same rule as
     -- po_delete_tenant's deleted_at COALESCE, Stage 3.5).
     SET cancelled_at = NULL
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (tenant_id, actor_id, action, detail)
  VALUES (NULL, auth.uid(), 'account.deletion_requested',
          jsonb_build_object('purge_after', v_row.purge_after));

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.account_deletion_requests
     SET cancelled_at = now()
   WHERE user_id = auth.uid()
     AND completed_at IS NULL;

  INSERT INTO public.audit_log (tenant_id, actor_id, action, detail)
  VALUES (NULL, auth.uid(), 'account.deletion_cancelled', '{}'::jsonb);
END;
$$;

-- What the operator works from: due, not cancelled, not already done.
CREATE OR REPLACE FUNCTION public.po_pending_account_deletions()
RETURNS TABLE (
  id uuid, user_id uuid, requester_email text,
  requested_at timestamptz, purge_after timestamptz, owned_tenants bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.user_id, r.requester_email, r.requested_at, r.purge_after,
         (SELECT count(*) FROM public.tenant_members m
           WHERE m.user_id = r.user_id AND m.role = 'owner')
  FROM public.account_deletion_requests r
  WHERE r.cancelled_at IS NULL
    AND r.completed_at IS NULL
    AND r.purge_after <= now()
    AND public.is_platform_admin()
  ORDER BY r.purge_after;
$$;

CREATE OR REPLACE FUNCTION public.complete_account_deletion(p_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.account_deletion_requests
     SET completed_at = now(), completion_note = p_note
   WHERE id = p_id AND completed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open deletion request with that id';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion() FROM public, anon;
REVOKE ALL ON FUNCTION public.cancel_account_deletion() FROM public, anon;
REVOKE ALL ON FUNCTION public.po_pending_account_deletions() FROM public, anon;
REVOKE ALL ON FUNCTION public.complete_account_deletion(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_pending_account_deletions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion(uuid, text) TO authenticated;
