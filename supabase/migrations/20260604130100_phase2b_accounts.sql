-- =============================================================================
-- Phase 2b — accounts table (migrated from localStorage lib/accountsStore.ts)
-- Tenant-scoped. Mirrors the StoredAccount shape (snake_case columns).
-- =============================================================================
CREATE TABLE public.accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  type            text NOT NULL CHECK (type IN ('bank','debit','credit','wallet','cash','investment','other')),
  name            text NOT NULL,
  holder          text,
  bank            text,
  bank_custom     text,
  last4           text,
  exp_month       text,
  exp_year        text,
  branch          text,
  opening_balance numeric(14,2),
  opening_date    date,
  color           text,
  icon            text,
  purposes        text[],
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_accounts_tenant ON public.accounts(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;

CREATE POLICY accounts_select ON public.accounts FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY accounts_insert ON public.accounts FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY accounts_update ON public.accounts FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY accounts_delete ON public.accounts FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
