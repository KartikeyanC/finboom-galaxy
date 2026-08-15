-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 1b — table-privilege hardening
--
-- Found while verifying Stage 1a on the fresh project (2026-08-05): every table
-- in `public` grants the full privilege set to BOTH `anon` and `authenticated`.
--
--   anon           : SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
--   authenticated  : SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
--
-- Source: Supabase's bootstrap runs
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role
-- so every CREATE TABLE inherits everything. The per-table
-- `GRANT SELECT, INSERT, UPDATE, DELETE` lines in our migrations were additive
-- and never took the surplus away.
--
-- SEVERITY: latent, not currently exploitable. `anon` and `authenticated` are
-- NOLOGIN (only `authenticator` connects, then SET ROLE), and PostgREST has no
-- TRUNCATE verb, so there is no request that reaches these privileges today.
-- RLS is what actually blocks the write paths. The problem is that RLS is then
-- the ONLY thing blocking them: a single table shipped without a policy, or one
-- overly broad policy, turns an over-grant into data loss. TRUNCATE is the worst
-- of these because it is NOT subject to RLS at all.
--
-- This migration makes the grants match the intended access model:
--   anon          -> SELECT only (landing page reads plans/coupons/site_settings)
--   authenticated -> SELECT/INSERT/UPDATE/DELETE, gated by RLS
--   service_role  -> untouched (edge functions rely on it)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Strip the privileges nothing should ever hold ────────────────────────
-- TRUNCATE bypasses RLS entirely. TRIGGER and REFERENCES allow schema-level
-- mischief. None of the three are reachable via PostgREST, and none are used.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ── 2. anon becomes read-only ───────────────────────────────────────────────
-- Signup writes go through GoTrue (auth schema) and the SECURITY DEFINER
-- handle_new_user() trigger, never through `public` as anon. The only anon
-- reads the app performs are the public landing data: plans, active coupons,
-- and site_settings rows whose key is LIKE 'landing_%'.
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

-- ── 3. Finish what Stage 1a started on subscriptions ────────────────────────
-- Stage 1a revoked the write grants from `authenticated` but not from `anon`.
-- RLS already denied it (the table has only a SELECT policy), but the grant
-- should not be sitting there either.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM anon, authenticated;

-- ── 4. Stop future tables from inheriting the surplus ───────────────────────
-- Without this, the next CREATE TABLE re-introduces exactly what we just
-- revoked. Default privileges are recorded per granting role, so this only
-- covers tables created by the role running migrations; new tables should still
-- carry explicit GRANTs, as our migrations already do.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- Post-apply verification (all three should return zero rows)
--
--   -- a. nobody but service_role may TRUNCATE
--   SELECT table_name, grantee FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND privilege_type='TRUNCATE'
--      AND grantee IN ('anon','authenticated');
--
--   -- b. anon may not write
--   SELECT table_name, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND grantee='anon'
--      AND privilege_type IN ('INSERT','UPDATE','DELETE');
--
--   -- c. subscriptions stays read-only for end users
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name='subscriptions' AND grantee IN ('anon','authenticated')
--      AND privilege_type <> 'SELECT';
--
-- Sanity check that the app still works afterwards: anon must still be able to
-- read the landing data.
--   SELECT count(*) FROM public.plans;   -- as anon, expect the seeded rows
-- ═══════════════════════════════════════════════════════════════════════════
