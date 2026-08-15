-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 2.8 / BUG-016 — make workspace suspension actually do something
--
-- `po_set_tenant_status` has always written `tenants.status` and notified the
-- members, but NOTHING ever read that column. `is_tenant_member()` — the gate
-- behind all 53 tenant RLS policies — only checked `tenant_members.status`.
-- A suspended workspace therefore kept full read AND write access.
--
-- ── Behaviour chosen: suspension is READ-ONLY, not a blackout ───────────────
--
--   active     -> unchanged
--   suspended  -> reads succeed, writes are refused
--   deleted    -> everything refused
--
-- Rather than add a second argument, this leans on the existing calling
-- convention: SELECT policies ask for 'viewer', write policies ask for
-- 'admin'/'owner'. So gating anything above 'viewer' yields read-only for free.
--
-- Why read-only rather than a hard lockout: a suspended customer must still be
-- able to see and export their own records. Locking reads would mean a billing
-- dispute or an accidental suspension makes user data unreachable, which is a
-- data-portability problem (DPDP/GDPR) as much as a UX one. Suspension is a
-- commercial control, not a punishment, and it stays fully reversible.
--
-- To switch to a hard lockout instead, delete the `OR (t.status = 'suspended'
-- AND p_min_role = 'viewer')` branch below — everything else stays the same.
--
-- ── Blast radius (checked before writing) ──────────────────────────────────
--   * 18 SELECT policies use 'viewer'  -> unaffected while suspended
--   * 30 write policies use 'admin'    -> correctly refused while suspended
--   *  5 policies/RPCs use 'owner'     -> invite_member, update_member_role,
--       set_member_menus, revoke_member (all writes, correctly refused) and the
--       audit_log SELECT (an owner-level read; deliberately unavailable while
--       suspended, which is acceptable)
--   * get_effective_menus() does NOT call is_tenant_member — it reads
--     tenant_members directly — so the sidebar keeps working and the existing
--     "suspended" banner still renders.
--   * is_platform_admin() is a separate branch everywhere, so the PO console
--     keeps working and can always un-suspend.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_tenant_member(
  p_tenant_id uuid,
  p_min_role  text DEFAULT 'viewer'::text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members m
    JOIN public.tenants t ON t.id = m.tenant_id
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND (CASE m.role     WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END)
       >= (CASE p_min_role WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END)
      AND (
            t.status = 'active'
        -- Suspended: reads only. 'deleted' matches neither branch, so it denies.
        OR (t.status = 'suspended' AND p_min_role = 'viewer')
      )
  );
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification (run as a member of the tenant, not as superuser — the function
-- depends on auth.uid()):
--
--   -- with the workspace active
--   SELECT public.is_tenant_member('<tid>','viewer');  -- true
--   SELECT public.is_tenant_member('<tid>','admin');   -- true
--
--   UPDATE public.tenants SET status='suspended' WHERE id='<tid>';
--   SELECT public.is_tenant_member('<tid>','viewer');  -- true  (reads survive)
--   SELECT public.is_tenant_member('<tid>','admin');   -- FALSE (writes refused)
--
--   UPDATE public.tenants SET status='deleted' WHERE id='<tid>';
--   SELECT public.is_tenant_member('<tid>','viewer');  -- false
--
--   UPDATE public.tenants SET status='active' WHERE id='<tid>';  -- restore
-- ═══════════════════════════════════════════════════════════════════════════
