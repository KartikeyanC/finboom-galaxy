-- =============================================================================
-- Demat / Broker Account Cash Balance Tracking
-- Tracks idle cash sitting in a brokerage account (not yet invested in stocks).
-- Flow: Bank → demat (fund_in) → buy stock / sell stock → Bank (fund_out).
-- =============================================================================

CREATE TABLE public.demat_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  broker      text NOT NULL,
  nickname    text,
  currency    text NOT NULL DEFAULT 'INR',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demat_accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_demat_accounts_tenant ON public.demat_accounts(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demat_accounts TO authenticated;
GRANT ALL ON public.demat_accounts TO service_role;

CREATE POLICY demat_accounts_select ON public.demat_accounts FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY demat_accounts_insert ON public.demat_accounts FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY demat_accounts_update ON public.demat_accounts FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY demat_accounts_delete ON public.demat_accounts FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_demat_accounts_updated BEFORE UPDATE ON public.demat_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Ledger: every cash movement in/out of a demat account
-- fund_in  : bank → demat (adds balance)
-- fund_out : demat → bank withdrawal (reduces balance)
-- buy      : used to purchase stocks/MF (reduces balance)
-- sell     : proceeds from selling stocks/MF (adds balance)
-- dividend : dividend/interest credited by broker (adds balance)
CREATE TABLE public.demat_ledger (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  demat_account_id  uuid NOT NULL REFERENCES public.demat_accounts(id) ON DELETE CASCADE,
  type              text NOT NULL CHECK (type IN ('fund_in', 'fund_out', 'buy', 'sell', 'dividend')),
  amount            numeric(15,2) NOT NULL CHECK (amount > 0),
  note              text,
  txn_date          date NOT NULL DEFAULT CURRENT_DATE,
  ref_investment_id uuid REFERENCES public.investments(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demat_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_demat_ledger_account ON public.demat_ledger(demat_account_id, txn_date DESC);
CREATE INDEX idx_demat_ledger_tenant  ON public.demat_ledger(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demat_ledger TO authenticated;
GRANT ALL ON public.demat_ledger TO service_role;

CREATE POLICY demat_ledger_select ON public.demat_ledger FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY demat_ledger_insert ON public.demat_ledger FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY demat_ledger_update ON public.demat_ledger FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY demat_ledger_delete ON public.demat_ledger FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));
