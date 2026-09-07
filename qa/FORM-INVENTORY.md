# FinRoot — Form Inventory

Forms are plain controlled components + `zod` (no react-hook-form). Validation is usually a `zod.safeParse` → `toast.error(firstIssue)` on submit; a few use native `required`.

Legend: **PASS** positive + negative paths verified · **PARTIAL** positive path verified, some negative cases not · **NOT TESTED** (reason).

| FORM ID | FORM | PAGE | FIELDS | VALIDATION SEEN | SUBMIT TARGET | STATUS |
|---|---|---|---|---|---|---|
| F-01 | Sign in | `/auth` | email, password | native `required`; invalid email blocked by browser; `zod` email + password min 8; wrong creds → GoTrue 400 → error toast; 5-fail client lockout (`signInLockout.ts`) | `supabase.auth.signInWithPassword` | **PASS** — empty, bad-format, wrong-password, correct all exercised; failed-attempt counter increments (`finroot.signin.attempts.*`) |
| F-02 | Sign up | `/auth` (Sign up tab) | name, email, password, confirm password, remember checkbox | `zod` name 1–80, email, password ≥8, passwords-match refine; anti-enumeration neutral message | `supabase.auth.signUp` + `record_legal_acceptance` | **NOT TESTED** — would create a real user against the live project (free-tier mailer rate-limited) |
| F-03 | Forgot password | `/auth` dialog | email | `zod` email → "Enter a valid email…" | `supabase.auth.resetPasswordForEmail` | **PARTIAL** — dialog opens; not submitted (would send a real reset email) |
| F-04 | Set new password | `/reset-password` | new password | "At least 8 characters" | `supabase.auth.updateUser` | **NOT TESTED** — needs a recovery session; renders with no token (BUG-008) |
| F-05 | Quick Add transaction | any `/app/*` (header "Add" / key **n**) | Expense/Income toggle, amount, currency, category, date, tracker, note | amount required (empty submit blocked) | `useTransactions` create → `transactions` insert | **PASS** — created ₹137 expense, persisted, appeared on Expenses + dashboard; note-field reset inconsistency (BUG-009); date-only time (BUG-010) |
| F-06 | Add Income Stream | `/app/income` dialog | income type, category (+ create new), name, amount, currency, frequency, received-on (today/yesterday/date + time), FX rate, icon, description | empty amount → toast "Amount must be positive" | `income_streams` insert **and** `recurring_items` insert | **PASS** — created "QA Test Income Stream" ₹4,321, persisted; delete leaves recurring orphan (BUG-001) |
| F-07 | Add / Edit Recurring Income | `/app/income` → Recurring tab | name, amount, category, frequency, reminder toggle, … | not fully probed | `recurring_items` | **PARTIAL** — delete path verified (confirm dialog "Remove X?"); add/edit not exercised |
| F-08 | Transaction edit | Income page table (Pencil) | amount, currency, category (+ create new), date & time, note | inline; "Save changes" | `useTransactions` update | **PASS** — ₹137→₹999, note edited, toast "Transaction updated", persisted |
| F-09 | Add / Edit Budget | `/app/budget` dialog | bucket (select), allocated (text), period start (date) | **none** on allocated — empty → "Budget saved" with ₹0 (BUG-005) | `budget_set_allocation` RPC | **PASS (with defect)** — create ₹0, edit → ₹5,000, delete (confirm "Delete budget?") all work |
| F-10 | Add / Edit Goal | `/app/goals` dialog | title, category, currency, target amount, saved so far, target date, status | title placeholder present; not fully probed for empty submit | `goals` insert / update | **PASS** — created, edited (rename), deleted (confirm "Delete goal?"), persisted |
| F-11 | Add funds to goal | `/app/goals` card (piggy-bank) | amount to add | — | `goal_contribute` RPC | **PASS** — ₹2,500 added, progress 2%→7%, toast "Funds added" |
| F-12 | New Tracker (2-step) | `/app/trackers` dialog | step 1: type tiles; step 2: name, start date, end date, budget, notes | name required to reach "Create tracker" | `trackers` insert | **PASS** — created "QA Test Tracker", deleted (confirm w/ explanation), navigated back |
| F-13 | Edit Tracker | `/app/trackers?id=…` "Edit" | name, dates, budget, notes | — | `trackers` update | **NOT TESTED** — create/delete covered; edit dialog not opened |
| F-14 | Add / Edit Account | `/app/accounts` (always-visible inline form) | type (radio grid), name, holder, bank, acct last-4, branch/IFSC, opening balance, opening date, colour, icon, utility purpose (+ custom) | empty name → toast "Please enter an account name" | `accounts` insert / update | **PASS** — created "QA Test Account", edited (button mislabeled, BUG-006), deleted (no confirm, BUG-003), persisted |
| F-15 | Transfer between accounts | `/app/accounts` "Transfer" | from, to, amount, date | — | `accounts` / `transactions` | **NOT TESTED** — dialog not opened |
| F-16 | Add Investment | `/app/investments` | holding fields | — | `investments` | **NOT TESTED** |
| F-17 | Add Demat Account | `/app/investments` | broker, cash | — | `demat_accounts` | **NOT TESTED** |
| F-18 | Add Policy | `/app/insurance` | policy type, insurer, premium, dates, … | — | `insurance` | **NOT TESTED** — empty state only |
| F-19 | New Reminder | `/app/reminders` | title, amount, due date, recurrence | — | `reminders` | **NOT TESTED** |
| F-20 | Net Worth: Add Entry / Asset / Liability | `/app/net-worth` | label, amount, date | — | `net_worth_entries` | **NOT TESTED** |
| F-21 | New Trip (+ buckets) | `/app/trips` | name, dates, funding sources, buckets | — | `trips` (jsonb sandbox) | **NOT TESTED** — empty state only |
| F-22 | Profile — personal details | `/app/profile` | full name, phone, base currency (INR/USD/AED) | — | `profiles` update | **NOT TESTED** — did not save (would change workspace-wide base currency for a shared demo account) |
| F-23 | Settings — theme / layout / density / categories | `/app/settings` | radio groups + toggles | n/a (instant, device-local) | `localStorage` + `tenant_settings` | **PASS** — theme obsidian↔light verified & persisted; other toggles present, not each toggled |
| F-24 | Settings — App Lock (PIN) | `/app/settings` | length (4/6), new PIN, confirm PIN | mismatch → toast "PINs do not match"; wrong length rejected | `localStorage` `finroot.pin.*` (PBKDF2 `{v:2,salt,iter:310000,hash}`) | **PASS** — set, locked, wrong PIN rejected, correct PIN unlocked, disabled (confirm) |
| F-25 | PIN setup gate | `/app` first visit | length, new PIN, confirm | same as F-24; "Not now" declines | as F-24 | **PARTIAL** — "Not now" path verified; set-from-gate not (set via Settings instead) |
| F-26 | Lock screen | `LockScreen` | PIN entry / password fallback | wrong PIN → "Incorrect PIN. Try again." | client hash compare | **PASS** (PIN mode); password-fallback mode **NOT TESTED** |
| F-27 | Invite Member | `/app/workspace` | email, role (select), module-permission presets | — | `create_invitation` RPC | **PASS** — link generated, email-locked (verified on redemption) |
| F-28 | Export builder | `/app/export` | format (PDF/CSV/Excel), date range, section checkboxes | — | client generation / `useDataExport` | **PARTIAL** — filters render & preview updates; download not triggered (pane blocks file saves) |
| F-29 | Import upload | `/app/import` | dataset, source, broker, file drop | file-type hint (.csv/.xls/.xlsx/.pdf) | `useImportTransactions` | **NOT TESTED** — no file uploaded |
| F-30 | Bill Scan upload | `/app/bill-scan` | image drop (≤5), Document/Lumpsum | — | `scan-receipt` edge fn | **NOT TESTED** — no image uploaded |
| F-31 | Global search | any `/app/*` (Ctrl+K) | query | no-match → "No results for …" | client fuzzy over pages/data | **PASS** — filter + navigate verified; dialog a11y defect (BUG-002) |
| F-32 | PO — Branding / Pricing / Plans / Status editors | `/po/*` | many text fields | — | `po_set_site_setting` / `po_set_plan_*` | **NOT TESTED** — would mutate live platform/site content |
| F-33 | PO — sign in (identifier + password/secret) | `/po/login` | identifier, password, 16-digit secret | `po-auth` server lockout | `po-auth` | **NOT TESTED** — demo admin bypassed the login |
| F-34 | Delete account | `/app/settings` → "I want to delete my account" | confirmation flow | — | (routes by email today; queue RPC exists) | **NOT TESTED** — opened only, not confirmed |
