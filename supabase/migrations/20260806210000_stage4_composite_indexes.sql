-- ===========================================================================
-- Stage 4.4 — composite indexes matching the queries the app actually runs.
--
-- Stage 2.1 (BUG-002) rewrote every read to filter on `tenant_id`, but the
-- indexes were laid down before that, when reads filtered on `user_id`. So the
-- hot paths were either scanning or using an index whose leading column is no
-- longer in the WHERE clause.
--
-- Each index below is justified by a specific query in the codebase. Indexes
-- are not free — they cost on every write and they occupy cache — so this adds
-- only ones with a named caller.
-- ===========================================================================

-- ---- transactions: (tenant_id, type, occurred_at DESC) --------------------
-- `useTransactions(type)` runs exactly:
--     .eq("tenant_id", …).eq("type", …).order("occurred_at", desc)
-- The existing idx_tx_tenant is (tenant_id, occurred_at DESC), so adding a type
-- filter meant reading every row for the workspace and discarding most of them.
-- The Income and Expenses pages are both type-filtered, and this is the single
-- most-run query in the product.
CREATE INDEX IF NOT EXISTS transactions_tenant_type_date_idx
  ON public.transactions (tenant_id, type, occurred_at DESC);

-- ---- tenant_members: (tenant_id, status) ----------------------------------
-- `is_tenant_member()` is the gate behind every one of the ~60 tenant RLS
-- policies, so it runs on essentially every request — often once per candidate
-- row. It looks up (tenant_id, user_id) and then tests `status = 'active'`.
-- The primary key already covers the lookup; this covers the membership LISTS
-- (`list_tenant_members`, the Workspace page, `get_effective_menus`) which scan
-- a workspace's active members without a user_id.
CREATE INDEX IF NOT EXISTS tenant_members_tenant_status_idx
  ON public.tenant_members (tenant_id, status);

-- ---- recurring_items: (tenant_id, next_due_date) --------------------------
-- The recurring lists and the due/overdue ribbons read per workspace ordered by
-- next_due_date. The existing index leads with user_id, which the tenant-scoped
-- queries no longer supply.
CREATE INDEX IF NOT EXISTS recurring_items_tenant_due_idx
  ON public.recurring_items (tenant_id, next_due_date);

-- Income and Expenses each render only their own half of the table.
CREATE INDEX IF NOT EXISTS recurring_items_tenant_type_idx
  ON public.recurring_items (tenant_id, type);

-- ---- notifications: (user_id, read_at) ------------------------------------
-- The bell polls the unread COUNT every 60 seconds for as long as the app is
-- open — the most frequently executed query in the app by a wide margin.
-- Partial, because unread is the only side ever counted, which keeps the index
-- tiny and hot regardless of how much read history accumulates.
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

-- ---- retire indexes whose leading column is no longer queried -------------
-- These lead with user_id on tables the app now reads by tenant_id. They are
-- pure write overhead. Dropped rather than left "just in case": an unused index
-- still has to be maintained on every insert, and the ones above cover the
-- access patterns that remain.
--
-- Kept deliberately: idx_tenant_members_user (TenantContext looks up a user's
-- memberships across workspaces, so user_id genuinely leads there) and
-- subscriptions_user_id_idx (billing-api still resolves by user).
DROP INDEX IF EXISTS public.idx_tx_user_date;
DROP INDEX IF EXISTS public.idx_recurring_items_user_type;
DROP INDEX IF EXISTS public.idx_recurring_items_next_due;

-- ===========================================================================
-- Post-apply verification
--
--   -- the hot query should use the new index, not a seq scan:
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM public.transactions
--    WHERE tenant_id = '<id>' AND type = 'expense'
--    ORDER BY occurred_at DESC LIMIT 50;
--   -- expect: Index Scan using transactions_tenant_type_date_idx
--
--   -- and the unread count:
--   EXPLAIN SELECT count(*) FROM public.notifications
--    WHERE user_id = '<uid>' AND read_at IS NULL;
--
--   SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
--    WHERE schemaname = 'public' ORDER BY idx_scan DESC;
-- ===========================================================================
