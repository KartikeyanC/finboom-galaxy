-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 2.5 / BUG-025 — transfer transaction type
--
-- Moving money between your own accounts (bank -> wallet, salary account ->
-- savings) had no representation. Users recorded it as an expense on one
-- account and an income on the other, which double-counts: monthly income and
-- monthly spend both inflate, the savings rate is wrong, and the spending
-- donut shows a category that was never really spent.
--
-- ── Shape: one row, not a pair ─────────────────────────────────────────────
-- Transactions already carry their account in the description prefix
-- `[PaymentMode|accountId]` (see useLiveAccountBalances). A transfer reuses that
-- as the SOURCE and adds an explicit destination column. One row keeps edit and
-- delete atomic — a paired-row model would let half a transfer be deleted and
-- silently unbalance both accounts.
--
--   type                     = 'transfer'
--   description prefix       -> source account
--   transfer_to_account_id   -> destination account
--   amount                   -> always positive; direction comes from the two
--                               account references, never from a sign
--
-- Aggregates need no special handling: every income/expense query filters on
-- `type`, so transfers fall out automatically. Balances DO need it — see
-- useLiveAccountBalances, which debits the source and credits the destination.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD  CONSTRAINT transactions_type_check
  CHECK (type IN ('income', 'expense', 'transfer'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_to_account_id uuid
    REFERENCES public.accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.transfer_to_account_id IS
  'Destination account for type=transfer. The source account is encoded in the '
  '[PaymentMode|accountId] description prefix. NULL for income/expense rows.';

-- Only transfers may name a destination, and a transfer must have one.
-- Rows created before this migration are all income/expense with a NULL
-- destination, so they satisfy the constraint as-is.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transfer_dest_check;
ALTER TABLE public.transactions ADD  CONSTRAINT transactions_transfer_dest_check
  CHECK (
    (type = 'transfer'  AND transfer_to_account_id IS NOT NULL)
    OR
    (type <> 'transfer' AND transfer_to_account_id IS NULL)
  );

-- Recurring items stay income/expense only: a scheduled transfer is a
-- different feature and is not being built now (YAGNI).

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname IN ('transactions_type_check','transactions_transfer_dest_check');
--
--   -- a transfer without a destination must be rejected
--   INSERT INTO public.transactions (user_id,tenant_id,type,amount,currency,category,occurred_at)
--   VALUES (...,'transfer',100,'INR','Transfer',now());   -- expect: violates check
--
--   -- an expense WITH a destination must be rejected
--   ...type='expense', transfer_to_account_id='<uuid>'    -- expect: violates check
-- ═══════════════════════════════════════════════════════════════════════════
