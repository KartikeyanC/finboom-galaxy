# ADR-0002 — Menus are a real paywall, not navigation

**Status:** Accepted (2026-08-05, roadmap 2.15 · BUG-021 / AZ-001).

## Context

`get_effective_menus()` decided what appeared in the sidebar, and nothing else. RLS gated on
`is_tenant_member()` alone. So a workspace on the free plan could `GET /rest/v1/investments`
directly and read every row, and a member whose Investments menu had been revoked could still read
and write it. The plan tiers were decoration, and the per-member permissions were a UI preference.

Either menus mean something to the server or they mean nothing. Two options: enforce them
everywhere (including the shared `transactions` table, by inventing a category→menu mapping), or
enforce them exactly where a menu maps 1:1 onto a feature's own tables and say so out loud.

## Decision

**Enforced in RLS** — a menu that owns exactly one feature's tables:
`investments`, `insurance`, `trips`, `net-worth`, `reminders`, `goals`, `budget`, `income`.

**Navigation-only, and documented as such** — `dashboard`, `expenses`, `import`, `bill-scan`,
`calculator`, `billing`. These read and write the shared `transactions` table (plus `accounts`,
`recurring_items`, `debts`, `tracked_subscriptions`, which map to no single menu). Attributing a
transaction row to one menu would need a category→menu mapping, and getting it wrong would silently
drop rows out of the dashboard, budget derivation and every aggregate.

Owners are **not** exempt: `get_effective_menus()` short-circuits an owner to `plan_menus()`, so a
free-plan owner genuinely has no Investments. That is the paywall.

## Consequences

- The plan tiers became worth money instead of being cosmetic.
- `Export.tsx` exports only what the caller can see. That is correct, and it narrowed an
  unauthenticated-route finding at the same time.
- Two `SECURITY DEFINER` writers (`goal_contribute`, `budget_set_allocation`) bypass RLS by
  definition and needed an explicit `has_menu()` check, or the gate would be half-applied.
- The owner short-circuit means an owner can never be permission-locked, only plan-locked — which
  is what makes the Stage 5.5 upgrade prompts safe to show them.
- A member granted `net-worth` but denied `investments` sees a net worth excluding investments.
  Accepted: it only arises from a deliberate per-member override.

## Where it lives

`supabase/migrations/20260805230000_stage2_menu_paywall.sql` (the contract is written out in full
at the top of that file), `has_menu()`, `src/lib/menuContract.ts` + its test, and the client side in
`src/contexts/AccessContext.tsx`.
