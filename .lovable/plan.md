
# Recurring + Transactions Model

Replace the standalone "Income Stream" concept with a unified **Recurring Items** system that works for both income and expenses. A recurring item is a template (e.g. "Salary — Acme — ₹80k/month"); when it's due, the user marks it received/paid with one tap and a real transaction is auto-created and linked back to the template.

## What the user will see

**Income page**
- Top section: **Recurring Income** cards (existing income streams UI, kept) with a new "Mark received" button per card when due.
- Bottom: **Received Transactions** (filtered transactions list, type=income).

**Expenses page**
- New top section: **Recurring Expenses** (rent, EMI, subscriptions, utilities) — same card pattern as income streams, but red-themed.
- Bottom: existing transactions list.

**Add flow**
- Add Transaction dialog (image 1) → stays as the quick one-off entry.
- Add Income Stream dialog (image 2) → renamed **Add Recurring Income**.
- New **Add Recurring Expense** dialog (mirrors the income one with red theme + expense categories).

**Dashboard**
- "Upcoming this month" widget showing next due recurring items (both income & expense).

## Technical details

### Database
New unified table `recurring_items`:
- `type` (income | expense)
- `name`, `category`, `subtype` (active/passive for income, null for expense)
- `amount`, `currency`, `fx_rate`
- `frequency` (monthly | weekly | yearly | one-time)
- `next_due_date`, `last_generated_at`
- `icon`, `notes`, `is_active`
- standard `user_id`, timestamps + RLS

Add nullable column `transactions.source_recurring_id` (uuid) so generated transactions trace back to their template.

Keep existing `income_streams` table for now (used by dashboard). Add a small migration script to copy rows into `recurring_items` so nothing is lost; phase out in a later pass.

### Frontend
- `src/hooks/useRecurring.ts` — CRUD + `markPaid(id, date)` which inserts a transaction and bumps `next_due_date`.
- `src/components/recurring/RecurringDialog.tsx` — shared dialog (income/expense mode, mirrors image 2's icon picker + frequency UI).
- `src/components/recurring/RecurringList.tsx` — card grid with due-date pill and "Mark received/paid" action.
- Wire into `src/pages/Income.tsx` and `src/pages/Expenses.tsx`.
- Dashboard widget: `src/components/dashboard/UpcomingRecurring.tsx`.

### Scope kept tight
- No cron / automatic generation yet — user taps "Mark received/paid" (matches Monarch/YNAB behavior and keeps the user in control).
- Keep existing AddIncomeDialog & TransactionDialog working; only add the recurring-expense variant and rename labels.
- No deletion of `income_streams` table this pass — non-breaking migration.
