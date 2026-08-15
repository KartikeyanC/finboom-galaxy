# ADR-0008 — A rule has one implementation; every mirror is tested against it

**Status:** Accepted (2026-08-05 onward — the pattern behind 2.15, 3.1, 4.2 and 5.5).

## Context

The same rule frequently needs to hold in two places: in SQL, where it is enforced, and in
TypeScript, where the interface has to anticipate it. Menu access, the default plan, budget periods,
the account-id prefix in a legacy description — each one is a rule the server owns and the client
has to know something about.

Two independent implementations of a rule **will** drift. The failure is silent and asymmetric: the
UI shows a feature the server then refuses, or hides one the user is paying for.

## Decision

**One implementation, delegated to.** `has_menu()` is a one-line wrapper over
`get_effective_menus()` — the exact function the sidebar calls — rather than a reimplementation of
the same logic inside a policy. It costs a few indexed lookups per statement on tables that hold
tens to hundreds of rows, which is a price worth paying for a rule that cannot disagree with itself.

**Where a mirror is unavoidable, the test is what keeps it honest.** The client's plan resolution
mirrors SQL `plan_menus()`/`default_plan()`; the client's account-delta regex mirrors the SQL one.
In each case the mirror is a small pure function with its own tests, and the SQL side was verified
against the same cases read-only before it shipped.

**Where a list has to exist in two forms, one side is declared the authority and a test scans for
drift.** `src/lib/tenantSettings.ts` is the spelling authority for `tenant_settings` keys;
`src/lib/deviceLocal.ts` is the register of device-local storage; `EXPORT_TABLES` is the authority
on which tables are personal data, and a test reads the generated Supabase types and fails when a
new table is in neither list. Adding a table now forces a decision instead of silently omitting
somebody's data from their own export.

## Consequences

- Several tests are file scanners rather than unit tests. They are slower and less pretty, and they
  have caught real drift repeatedly — a legacy key nobody had accounted for, a table with no export
  decision, four copies of a sign-in helper.
- A delegating SQL function is slower than an inlined predicate. Accepted, with a note in the
  migration about what to do if a gated table ever grows into the tens of thousands of rows
  (memoise per statement — still do not duplicate the logic).
- New code is expected to follow the pattern: if you find yourself writing the same rule twice,
  either delegate or add the drift test.

## Where it lives

`supabase/migrations/20260805230000_stage2_menu_paywall.sql` (`has_menu()` and the reasoning),
`src/lib/menuUpsell.ts`, `src/lib/tenantSettings.test.ts`, `src/lib/deviceLocal.test.ts`,
`src/lib/dataExport.test.ts`, `src/lib/menuContract.test.ts`.
