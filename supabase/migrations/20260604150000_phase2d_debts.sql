-- =============================================================================
-- Phase 2d — debts table (from localStorage lib/debtsStore.ts)
-- Tenant-scoped. installments[] stored as jsonb.
-- =============================================================================
CREATE TABLE public.debts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id        uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  lender         text NOT NULL,
  category       text,
  currency       text NOT NULL DEFAULT 'INR',
  total_amount   numeric(14,2) NOT NULL DEFAULT 0,
  duration       integer NOT NULL DEFAULT 0,
  monthly        numeric(14,2) NOT NULL DEFAULT 0,
  first_due_date date,
  notes          text,
  installments   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_debts_tenant ON public.debts(tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.debts TO authenticated;
GRANT ALL ON public.debts TO service_role;

CREATE POLICY debts_select ON public.debts FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY debts_insert ON public.debts FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY debts_update ON public.debts FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY debts_delete ON public.debts FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_debts_updated BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
