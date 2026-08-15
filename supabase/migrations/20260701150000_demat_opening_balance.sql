-- Add opening balance fields to demat_accounts
-- This lets users record a pre-existing cash balance (before they started using FinRoot)
-- without creating any bank expense/income transaction.

ALTER TABLE public.demat_accounts
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_date     DATE;
