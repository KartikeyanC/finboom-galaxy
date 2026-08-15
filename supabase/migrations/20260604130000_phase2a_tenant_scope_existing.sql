-- =============================================================================
-- Phase 2a — Tenant-scope the existing finance tables
-- Adds tenant_id to transactions, budgets, goals, recurring_items, backfills it
-- from each row's owner personal tenant, then swaps per-user RLS for
-- membership-based RLS. Column default current_tenant_id() means the existing
-- React Query hooks keep working unchanged (they only set user_id on insert).
-- =============================================================================

-- Helper: add tenant_id, backfill, default, not-null, index — done per table.

-- ---- transactions ----------------------------------------------------------
ALTER TABLE public.transactions ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.transactions t SET tenant_id = m.tenant_id
  FROM public.tenant_members m
  WHERE m.user_id = t.user_id AND m.role = 'owner' AND m.status = 'active'
    AND t.tenant_id IS NULL;
ALTER TABLE public.transactions ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE public.transactions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_tx_tenant ON public.transactions(tenant_id, occurred_at DESC);

DROP POLICY IF EXISTS tx_select_own ON public.transactions;
DROP POLICY IF EXISTS tx_insert_own ON public.transactions;
DROP POLICY IF EXISTS tx_update_own ON public.transactions;
DROP POLICY IF EXISTS tx_delete_own ON public.transactions;
CREATE POLICY tx_select ON public.transactions FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY tx_insert ON public.transactions FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY tx_update ON public.transactions FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY tx_delete ON public.transactions FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

-- ---- budgets ---------------------------------------------------------------
ALTER TABLE public.budgets ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.budgets b SET tenant_id = m.tenant_id
  FROM public.tenant_members m
  WHERE m.user_id = b.user_id AND m.role = 'owner' AND m.status = 'active'
    AND b.tenant_id IS NULL;
ALTER TABLE public.budgets ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE public.budgets ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_bg_tenant ON public.budgets(tenant_id);

DROP POLICY IF EXISTS bg_select_own ON public.budgets;
DROP POLICY IF EXISTS bg_insert_own ON public.budgets;
DROP POLICY IF EXISTS bg_update_own ON public.budgets;
DROP POLICY IF EXISTS bg_delete_own ON public.budgets;
CREATE POLICY bg_select ON public.budgets FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY bg_insert ON public.budgets FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY bg_update ON public.budgets FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY bg_delete ON public.budgets FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

-- ---- goals -----------------------------------------------------------------
ALTER TABLE public.goals ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.goals g SET tenant_id = m.tenant_id
  FROM public.tenant_members m
  WHERE m.user_id = g.user_id AND m.role = 'owner' AND m.status = 'active'
    AND g.tenant_id IS NULL;
ALTER TABLE public.goals ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE public.goals ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_gl_tenant ON public.goals(tenant_id);

DROP POLICY IF EXISTS gl_select_own ON public.goals;
DROP POLICY IF EXISTS gl_insert_own ON public.goals;
DROP POLICY IF EXISTS gl_update_own ON public.goals;
DROP POLICY IF EXISTS gl_delete_own ON public.goals;
CREATE POLICY gl_select ON public.goals FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY gl_insert ON public.goals FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY gl_update ON public.goals FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY gl_delete ON public.goals FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));

-- ---- recurring_items -------------------------------------------------------
ALTER TABLE public.recurring_items ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.recurring_items ri SET tenant_id = m.tenant_id
  FROM public.tenant_members m
  WHERE m.user_id = ri.user_id AND m.role = 'owner' AND m.status = 'active'
    AND ri.tenant_id IS NULL;
ALTER TABLE public.recurring_items ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE public.recurring_items ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_ri_tenant ON public.recurring_items(tenant_id);

DROP POLICY IF EXISTS ri_select_own ON public.recurring_items;
DROP POLICY IF EXISTS ri_insert_own ON public.recurring_items;
DROP POLICY IF EXISTS ri_update_own ON public.recurring_items;
DROP POLICY IF EXISTS ri_delete_own ON public.recurring_items;
CREATE POLICY ri_select ON public.recurring_items FOR SELECT USING (public.is_tenant_member(tenant_id, 'viewer'));
CREATE POLICY ri_insert ON public.recurring_items FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY ri_update ON public.recurring_items FOR UPDATE USING (public.is_tenant_member(tenant_id, 'admin')) WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));
CREATE POLICY ri_delete ON public.recurring_items FOR DELETE USING (public.is_tenant_member(tenant_id, 'admin'));
