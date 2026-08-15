-- =============================================================================
-- Phase 2j — income_streams table (from localStorage hooks/useIncomeStreams.ts,
-- key "valar.income.streams"). The last finance feature still on localStorage.
-- Tenant-scoped, membership-based RLS, mirrors the tracked_subscriptions shape.
-- =============================================================================
CREATE TABLE public.income_streams (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id              uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  name                 text NOT NULL,
  type                 text NOT NULL DEFAULT 'passive' CHECK (type IN ('active','passive')),
  icon                 text NOT NULL DEFAULT 'Coins',
  amount               numeric(14,2) NOT NULL DEFAULT 0,
  currency             text NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR','USD','EUR')),
  exchange_rate_to_inr numeric(14,4) NOT NULL DEFAULT 1,
  is_visible           boolean NOT NULL DEFAULT true,
  display_order        integer NOT NULL DEFAULT 0,
  frequency            text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','weekly','one-time')),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.income_streams ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_income_streams_tenant ON public.income_streams(tenant_id, display_order ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_streams TO authenticated;
GRANT ALL ON public.income_streams TO service_role;

CREATE POLICY istream_select ON public.income_streams FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY istream_insert ON public.income_streams FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY istream_update ON public.income_streams FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY istream_delete ON public.income_streams FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_income_streams_updated BEFORE UPDATE ON public.income_streams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
