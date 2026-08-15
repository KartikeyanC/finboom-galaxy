# ADR-0001 — Multi-tenancy by workspace membership, enforced in RLS

**Status:** Accepted (2026-06-04, Phase 1–2). Reconstructed for the log in Stage 5.6.

## Context

The app began as one person's finance tracker: every table carried `user_id` and every policy was
`auth.uid() = user_id`. Turning it into a product meant two people needed to see the same
household's money — a spouse, an accountant, a parent — and a Product Owner needed to administer
accounts without reading anybody's transactions.

The alternatives were a schema per tenant (isolation by construction, but 32 tables × every
customer, and migrations that fan out), a separate database per tenant (same, worse), or a
`tenant_id` column with policies that ask whether the caller belongs to that workspace.

## Decision

One database, one schema. Every finance table carries `tenant_id`, and access is decided by
`is_tenant_member(tenant_id, min_role)` against a `tenant_members` table with roles
`owner > admin > viewer`. A tenant is **one workspace**, created automatically for every new user by
the `handle_new_user()` signup trigger.

Row-level security is the boundary. The client filters by `tenant_id` as well, but only so that a
user who belongs to two workspaces sees the right one — never as the thing that keeps workspaces
apart.

The Product Owner reads **aggregates only**, through `SECURITY DEFINER` RPCs that return counts and
statuses. There is no path from the PO console to a transaction row.

## Consequences

- A single migration changes every tenant, which is the point at this scale.
- Isolation is only ever as good as the policies. That makes RLS the thing to test, and the reason
  every verification session re-checks cross-tenant reads with a real second account.
- **Never scope a query by RLS alone in the client.** Platform-admin bypass policies exist, so a
  query without an explicit `.eq("tenant_id", …)` returns *every* workspace to a PO. That is exactly
  how a Product Owner once ended up looking at a stranger's Free-plan menus.
- Deleting a tenant cascades to its data, which is why deletion is soft (30-day window) and why the
  audit log deliberately survives the tenant it describes.

## Where it lives

`supabase/migrations/20260604120000_phase1_tenancy_foundation.sql` (tables + helpers),
`20260604130000_phase2a_tenant_scope_existing.sql` (the retrofit),
`src/contexts/TenantContext.tsx`, and the `is_tenant_member()` predicate in every policy since.
