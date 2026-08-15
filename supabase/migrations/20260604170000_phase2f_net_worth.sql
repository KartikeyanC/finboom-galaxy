-- =============================================================================
-- Phase 2f — net_worth_entries table (from localStorage lib/netWorthStore.ts)
-- Tenant-scoped asset/liability ledger. 'group' is a SQL reserved word, stored
-- as column "grp". The synthetic history sparkline stays client-side for now
-- (real historical snapshots can be added later as net_worth_snapshots).
-- =============================================================================
CREATE TABLE public.net_worth_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  kind       text NOT NULL CHECK (kind IN ('asset','liability')),
  grp        text NOT NULL,
  name       text NOT NULL,
  amount     numeric(16,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.net_worth_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_nw_tenant ON public.net_worth_entries(tenant_id, created_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.net_worth_entries TO authenticated;
GRANT ALL ON public.net_worth_entries TO service_role;

CREATE POLICY nw_select ON public.net_worth_entries FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY nw_insert ON public.net_worth_entries FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY nw_update ON public.net_worth_entries FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY nw_delete ON public.net_worth_entries FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_nw_updated BEFORE UPDATE ON public.net_worth_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
