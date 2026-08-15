-- =============================================================================
-- Phase 2c — investments table (from localStorage lib/investmentsStore.ts)
-- Tenant-scoped. fields/derived stored as jsonb to match InvestmentRecord.
-- =============================================================================
CREATE TABLE public.investments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  asset      text NOT NULL CHECK (asset IN ('stocks','mutual_funds','bonds','fd','rd','pf','gold','real_estate','crypto')),
  currency   text NOT NULL DEFAULT 'INR',
  goal       text,
  broker     text,
  mf_mode    text,
  gold_type  text,
  bond_freq  text,
  fields     jsonb NOT NULL DEFAULT '{}'::jsonb,
  derived    jsonb NOT NULL DEFAULT '{}'::jsonb,
  saved_at   timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_investments_tenant ON public.investments(tenant_id, saved_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investments TO authenticated;
GRANT ALL ON public.investments TO service_role;

CREATE POLICY investments_select ON public.investments FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY investments_insert ON public.investments FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY investments_update ON public.investments FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY investments_delete ON public.investments FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_investments_updated BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
