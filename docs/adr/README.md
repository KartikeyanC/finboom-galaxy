# Architecture decision records

Why the system is the way it is. One file per decision, written when the decision was made or —
for the ones that predate this log — reconstructed from the migration, the code and the commit
trail that implemented them.

**An ADR is not documentation of a feature.** It records a choice between real alternatives, the
reason one was taken, and what it costs. If a decision has no cost, it probably was not a decision.

| # | Decision | Status |
|---|---|---|
| [0001](0001-membership-based-multi-tenancy.md) | Multi-tenancy by workspace membership, enforced in RLS | Accepted |
| [0002](0002-menus-are-a-real-paywall.md) | Menus are a real paywall, not navigation | Accepted |
| [0003](0003-postgres-for-shared-state.md) | Postgres for shared state; device-local must be argued for | Accepted |
| [0004](0004-cloud-only-supabase-dev.md) | Cloud-only Supabase development, no Docker | Accepted |
| [0005](0005-defer-the-payment-gateway.md) | Defer the payment gateway; upgrades are manual | Accepted |
| [0006](0006-derive-money-never-store-it.md) | Derive money figures; never store what can be computed | Accepted |
| [0007](0007-app-lock-is-not-security.md) | The app lock is a curtain, not an access control | Accepted |
| [0008](0008-one-implementation-per-rule.md) | A rule has one implementation; every mirror is tested against it | Accepted |
| [0009](0009-analytics-without-tracking.md) | Product analytics is derived from existing records, not tracked | Accepted |

## Writing a new one

Copy the shape of an existing file: **Status · Context · Decision · Consequences**, and end with
where it lives in the code. Number sequentially; never renumber. A superseded ADR keeps its file and
gains a line at the top pointing at the one that replaced it — the history is the point.
