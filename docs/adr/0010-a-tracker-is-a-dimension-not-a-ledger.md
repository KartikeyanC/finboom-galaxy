# ADR-0010 — A tracker is a dimension on a transaction, not a ledger

**Status:** Accepted (2026-08-27).

## Context

FinRoot could answer "how much went on Labour?" (category) and "which account paid?"
(`account_id`), but not "what has the house build cost me so far?". Users were reaching that
answer by abusing categories — inventing `Labour (Home)`, `Cement (Home)` — which pollutes every
category aggregate in the app and cannot be undone once the rows exist.

Trips already existed and looked like the answer. It is not. `trips.expenses` is a **jsonb array
inside the trip row**: trip spending has no row in `transactions`, never reaches
`dashboard_summary()`, `budget_spend()` or any account balance, and the page says so in as many
words — *"Isolated from Daily Ledger"*. Trips is a deliberate sandbox. Extending that shape to
house construction would mean a second ledger holding real money that the dashboard cannot see.

Three shapes were considered:

1. **A parallel ledger, like Trips.** Rejected: it duplicates the transaction. The same ₹18,600
   would exist twice, and the two copies drift the moment one is edited.
2. **Encode it in `description`.** Rejected outright. That path is already worn — split metadata
   (`⟦SPLIT|…⟧`) and the legacy `[Mode|accountId]` prefix both did it, and
   `20260806150000_stage3_transaction_account_columns.sql` lists the four reasons it failed: no
   referential integrity, no index, unreportable, fragile parsing. `mutationPaths.test.ts` now
   fails the build if any writer glues such a prefix on.
3. **A nullable foreign key on `transactions`.** Taken.

## Decision

**A tracker is one nullable column on the existing transaction, plus one tenant table that names
it.** `transactions.tracker_id uuid NULL REFERENCES trackers(id) ON DELETE SET NULL`.

Consequences of that single sentence, each deliberate:

- **One transaction, zero or one tracker.** No join table. A second tracker on the same row would
  make every aggregate double-count, which is the one failure this feature must not have.
- **The row is never duplicated and never moved.** A tagged transaction stays in All Transactions,
  Expenses, its account, its category, Reports, Search and Export exactly as before. A tracker adds
  a label; it takes nothing away.
- **Assigning a tracker cannot move money.** This is structural, not a promise: `BalanceTxn`
  (`src/lib/accountBalances.ts`) is a narrow structural type that does not mention `tracker_id`,
  and balance derivation reads only `account_id`, `transfer_to_account_id`, `type` and `amount`.
- **Spend is derived, never stored** (ADR-0006). There is no `spent` column and there must never be
  one. `tracker_spend()` aggregates; `foldTrackerSpend()` folds.
- **The column stays nullable, permanently.** `mark_recurring_generated()` inserts into
  `transactions` server-side without naming it; `NOT NULL` would break every recurring generation.
- **`ON DELETE SET NULL`, and deletion is soft anyway.** Removing a label must never destroy money.

Trips is not absorbed, renamed, migrated or reused. It remains a sandbox, and the two answer
different questions: Trips asks *"how much may I spend on this holiday, from which wallet?"*, a
tracker asks *"what has this project cost me?"*.

## Consequences

- **The trackers table is menu-enforced; the column is not.** Per ADR-0002 a menu is a real paywall
  when it owns exactly one feature's tables, and `trackers` owns exactly one. So `trackers` carries
  `has_menu(tenant_id, 'trackers')` in all four policies while `transactions` stays ungated —
  `menuContract.test.ts` forbids gating it, because every aggregate reads it. The visible effect on
  a plan without the menu: the tracker row is unreadable, so the badge does not render. The
  transaction itself is never hidden. Never render a raw uuid in that state.
- **Adding the menu id cost more than expected.** `menuContract.test.ts` reads the *latest*
  migration defining `has_menu()` and requires `goal_contribute` and `budget_set_allocation` to
  appear in that same file with their menu checks. So `20260827120000_trackers.sql` restates
  ~130 lines of two unchanged SECURITY DEFINER functions verbatim. That is the price of the
  one-implementation rule (ADR-0008) and it was paid rather than weakening the guard.
- **`deleted_at` is a first for a finance table.** Only `tenants` had one. A tracker is a label many
  transactions point at, and a hard delete on a misclick strips context from history the user cannot
  reconstruct — they will not remember which of 400 rows were the build. Every read filters
  `deleted_at IS NULL`; restore is clearing it.
- **Nothing is ever auto-assigned.** When a tracker's `start_date` predates its creation there are
  probably existing transactions, so the app *offers* a review. The selection starts empty, filters
  narrow what is shown and never what is selected, and the bulk write carries
  `.is("tracker_id", null)` so a row tagged elsewhere meanwhile is skipped rather than stolen. A
  confident wrong guess re-categorises real financial history and the user never learns it happened.
- **Saved views needed no migration.** They are a registered `tenant_settings` key, because that
  table constrains a key's shape rather than its spelling.
- **Currency is INR-anchored.** Tracker budgets are INR; transactions keep their own currency and
  aggregate through `toINR()`, which stays the single FX implementation. A per-tracker currency
  selector was deliberately not built — it implies a fidelity the app cannot honestly deliver.

## Where it lives

`supabase/migrations/20260827120000_trackers.sql` (table, column, `tracker_spend()`, menu id) ·
`src/lib/trackers.ts` (types, folds, display convention) · `src/lib/trackerReview.ts` ·
`src/lib/trackerFilters.ts` · `src/hooks/useTrackers.ts`, `useTrackerSpend.ts`,
`useTrackerTransactions.ts` · `src/components/trackers/` · `src/pages/Trackers.tsx` ·
`src/lib/accountBalances.test.ts` (the money invariant, pinned).
