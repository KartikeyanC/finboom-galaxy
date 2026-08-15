-- =============================================================================
-- Phase 2h — reminders table (from localStorage lib/remindersStore.ts)
-- Tenant-scoped. 'date' renamed to due_date; maturity_leads/debt as jsonb.
-- =============================================================================
CREATE TABLE public.reminders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  title            text NOT NULL,
  context          text NOT NULL CHECK (context IN ('fixed_due','balance_buffer','maturity')),
  due_date         date NOT NULL,
  amount           numeric(14,2),
  currency         text,
  notes            text,
  source           text,
  source_id        text,
  frequency        text,
  grace            text,
  verify_liquidity boolean,
  maturity_leads   jsonb,
  debt             jsonb,
  status           text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_reminders_tenant ON public.reminders(tenant_id, due_date ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

CREATE POLICY reminders_select ON public.reminders FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY reminders_insert ON public.reminders FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY reminders_update ON public.reminders FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY reminders_delete ON public.reminders FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_reminders_updated BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
