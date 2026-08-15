-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 2.3 / BUG-010 — real net-worth history
--
-- `netWorthStore.seedHistory()` invented the trend: it took the CURRENT net
-- worth, multiplied it by 0.82, then walked it forward six months with made-up
-- growth rates (~1.8-2.8% a month) and cached the result in localStorage. The
-- Net Worth page rendered that as the user's actual history, complete with a
-- 3M/6M/All range filter and a "vs {month}" delta — all of it fabricated, and
-- device-local so two browsers disagreed.
--
-- This table stores what actually happened. One row per tenant per day; the
-- client upserts today's figures when the user opens the page, so history
-- accumulates without needing pg_cron. A scheduled job can be added later
-- (roadmap 3.7) and will land on the same unique key.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.net_worth_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  captured_on date NOT NULL DEFAULT CURRENT_DATE,
  assets      numeric(16,2) NOT NULL DEFAULT 0,
  liabilities numeric(16,2) NOT NULL DEFAULT 0,
  net_worth   numeric(16,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- One snapshot per day per workspace; re-opening the page updates it in place
  -- rather than piling up duplicates.
  CONSTRAINT net_worth_snapshots_unique_day UNIQUE (tenant_id, captured_on)
);

ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;

-- The page always reads a date-ordered slice for one tenant.
CREATE INDEX idx_nw_snapshots_tenant_date
  ON public.net_worth_snapshots(tenant_id, captured_on ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.net_worth_snapshots TO authenticated;
GRANT ALL ON public.net_worth_snapshots TO service_role;

CREATE POLICY nw_snap_select ON public.net_worth_snapshots FOR SELECT
  USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY nw_snap_insert ON public.net_worth_snapshots FOR INSERT
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY nw_snap_update ON public.net_worth_snapshots FOR UPDATE
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY nw_snap_delete ON public.net_worth_snapshots FOR DELETE
  USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_nw_snapshots_updated
  BEFORE UPDATE ON public.net_worth_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification
--   SELECT count(*) FROM public.net_worth_snapshots;   -- 0 on a fresh install
--
-- Also confirms Stage 1b held: a table created AFTER the default-privilege fix
-- must not have picked TRUNCATE back up.
--   SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE table_name='net_worth_snapshots' AND grantee IN ('anon','authenticated');
--   -- expect: authenticated SELECT/INSERT/UPDATE/DELETE only, anon nothing
-- ═══════════════════════════════════════════════════════════════════════════
