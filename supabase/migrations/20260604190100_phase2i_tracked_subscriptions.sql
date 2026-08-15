-- =============================================================================
-- Phase 2i — tracked_subscriptions table (from localStorage lib/subscriptionsStore.ts)
-- This is the FINANCE FEATURE (user-tracked subs like Netflix/Spotify).
-- It is NOT the SaaS billing `subscriptions` table (Paddle).
-- =============================================================================
CREATE TABLE public.tracked_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  name         text NOT NULL,
  icon         text,
  amount       numeric(14,2) NOT NULL DEFAULT 0,
  currency     text NOT NULL DEFAULT 'INR',
  frequency    text NOT NULL CHECK (frequency IN ('weekly','monthly','annual')),
  renewal_date date,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancel')),
  category     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tracked_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tracked_subs_tenant ON public.tracked_subscriptions(tenant_id, renewal_date ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_subscriptions TO authenticated;
GRANT ALL ON public.tracked_subscriptions TO service_role;

CREATE POLICY tsub_select ON public.tracked_subscriptions FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY tsub_insert ON public.tracked_subscriptions FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY tsub_update ON public.tracked_subscriptions FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY tsub_delete ON public.tracked_subscriptions FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_tracked_subs_updated BEFORE UPDATE ON public.tracked_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
