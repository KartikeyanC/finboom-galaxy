-- =============================================================================
-- Phase 2e — insurance table (from localStorage lib/insuranceStore.ts)
-- Tenant-scoped. NOTE: document_data_url holds a base64 data URL for now; move
-- to Supabase Storage later if document sizes grow.
-- =============================================================================
CREATE TABLE public.insurance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id           uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  category          text NOT NULL CHECK (category IN ('health','life','vehicle','gadget','other')),
  policy_name       text NOT NULL,
  provider          text,
  policy_number     text,
  sum_insured       numeric(14,2) NOT NULL DEFAULT 0,
  premium           numeric(14,2) NOT NULL DEFAULT 0,
  pay_structure     text,
  payment_frequency text,
  due_date          date,
  document_name     text,
  document_data_url text,
  document_mime     text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.insurance ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_insurance_tenant ON public.insurance(tenant_id, created_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance TO authenticated;
GRANT ALL ON public.insurance TO service_role;

CREATE POLICY insurance_select ON public.insurance FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY insurance_insert ON public.insurance FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY insurance_update ON public.insurance FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY insurance_delete ON public.insurance FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_insurance_updated BEFORE UPDATE ON public.insurance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
