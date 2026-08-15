# ADR-0006 — Derive money figures; never store what can be computed

**Status:** Accepted (2026-08-05, roadmap 2.4 · extended in 4.2).

## Context

`budgets.spent` was a number the user typed in by hand. It drifted from actual spending immediately,
and the budget page then reported a fiction with complete confidence. The same temptation exists
everywhere in the app: cached net worth, stored monthly totals, a running account balance.

Stored aggregates are faster and always eventually wrong. Every write path that forgets to update
one produces a number nobody can explain, and the fix is a data migration rather than a code change.

## Decision

**A figure that can be computed from transactions is computed from transactions.** `budgets.spent`
is derived by matching each budget's category bucket and period window against real expense rows;
account balances are derived from an opening balance plus the transactions that touch the account;
net worth is derived from accounts, investments and debts.

When deriving in the browser became too expensive — the dashboard was reducing the entire ledger
three times over — the reduction moved to SQL aggregates (`dashboard_summary()`, `budget_spend()`),
**not** to stored columns. The numbers are still derived; only the machine doing it changed.

## Consequences

- The budget page cannot lie about spend. If a figure looks wrong, the transactions are wrong, and
  that is a fixable, explainable thing.
- Three rules had to be written down when the aggregates moved to SQL, and they are easy to break
  later:
  - **totals are per currency, unconverted** — the FX table lives in `src/lib/finance.ts`, and a
    second copy in SQL is the one nobody would update;
  - **months bucket in the caller's timezone** — `occurred_at` is `timestamptz`, and a late-night
    last-of-month transaction lands in the wrong month for every IST user otherwise;
  - **account deltas sum currency-agnostically**, because the client code they replaced did.
    Arguably wrong, but silently changing displayed balances inside a performance change destroys
    trust in the numbers. Fix it as its own task, both sides together.
- Derivation is pure, so it is unit-testable without a database — which is why `lib/` holds the
  arithmetic and the tests.

## Where it lives

`src/lib/budgetBuckets.ts` (`deriveSpent`), `src/lib/accountBalances.ts`,
`supabase/migrations/20260810130000_stage4_dashboard_summary.sql` and the three that follow it,
`src/hooks/useDashboardSummary.ts`.
