-- =============================================================================
-- Phase 2g — trips table (from localStorage lib/tripsStore.ts)
-- Tenant-scoped. allocation/expenses/companions stored as jsonb.
-- =============================================================================
CREATE TABLE public.trips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('solo','friends','family')),
  start_date  date,
  days        integer NOT NULL DEFAULT 0,
  companions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  allocation  jsonb NOT NULL DEFAULT '{}'::jsonb,
  expenses    jsonb NOT NULL DEFAULT '[]'::jsonb,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_trips_tenant ON public.trips(tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

CREATE POLICY trips_select ON public.trips FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY trips_insert ON public.trips FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY trips_update ON public.trips FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY trips_delete ON public.trips FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

CREATE TRIGGER trg_trips_updated BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
