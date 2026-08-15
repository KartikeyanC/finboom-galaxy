# ADR-0003 — Postgres for shared state; device-local must be argued for

**Status:** Accepted (2026-08-06, roadmap 3.1–3.2 · BUG-026 / BUG-071 / UX-043).

## Context

The app had been built on `localStorage`. Phase 2 moved the eight feature stores (accounts,
investments, debts, insurance, net worth, trips, reminders, tracked subscriptions) into tenant-scoped
tables, and five things were left behind: custom categories, custom subcategories, the budget
planner, the base currency, and per-item recurring reminders.

None of those five keys were namespaced by tenant or by user. The consequences were all real: the
data vanished on a new device, every account sharing a browser profile saw the same custom
categories, a collaborator never saw the categories their teammate created while the transactions
labelled with them *were* shared, and none of it was in any backup, because backups are of Postgres.

Nobody had ever decided they should be device-local. Someone reached for `localStorage`, and it was
never revisited.

## Decision

**State that describes shared data belongs in Postgres**, tenant-scoped like everything else. Four
of the five went into a `tenant_settings` key/value table — small JSON blobs, read together and
written whole, with no relational structure worth modelling. Recurring reminders got a **real
table**, because they are keyed by `recurring_item_id`: a jsonb map cannot express that foreign key,
so deleting a recurring item would leave its reminder behind forever. `ON DELETE CASCADE` is the
whole reason that one is not a settings blob.

**State that is genuinely about this device or this tab stays local — and is registered.**
`src/lib/deviceLocal.ts` lists every such key with a label and a *reason why syncing it would be
wrong*, not merely unnecessary. `deviceLocal.test.ts` scans the source for storage keys and fails on
any that is not registered.

Registered today: theme, hidden balances, dashboard layout, install-prompt dismissal, active
workspace, sign-in bookkeeping, the app-lock PIN and its settings, the per-tab unlock flag, saved
sign-in profiles, the ledger period.

## Consequences

- The guard test is the durable part. The next `localStorage.setItem` forces the same question —
  should this follow the user, or the browser? — instead of quietly answering it.
- One-time importers copy whatever a browser still holds into the database, once per workspace,
  guarded by a `finroot.migrated.*` flag. They read the legacy key through the registry, never a
  literal, and a test asserts nothing else touches those keys.
- `tenant_settings` keys are shape-checked in SQL (`^[a-z][a-z0-9_]*$`) but not enumerated, so a new
  setting needs no migration. `src/lib/tenantSettings.ts` is the spelling authority instead, and its
  test fails on a call site that invents a key — a typo would otherwise read as "this workspace has
  no custom categories".
- Nothing here is a security boundary: anything a user must not change is enforced in RLS.

## Where it lives

`supabase/migrations/20260806120000_stage3_device_local_to_tenant.sql`, `src/lib/deviceLocal.ts`,
`src/lib/tenantSettings.ts`, `src/hooks/useTenantSetting.ts`.
