# FinRoot — Workflow Inventory

End-to-end journeys, tested live on 2026-09-07 against the demo account. All test data created during the audit was removed afterwards; the demo account is back to its starting state (2 accounts, 2 budgets, 1 goal, 1 tracker, 0 income streams, 3 expenses).

---

## W-01 — Sign in → land in app
- **START:** `/auth`, signed out
- **STEPS:** enter `demo@finroot.app` + password → submit → PIN gate "Not now" → `/app`
- **EXPECTED:** authenticated, dashboard renders, session in `localStorage`
- **ACTUAL:** as expected — `sb-…-auth-token` set, dashboard shows "Good evening, Demo"
- **STATUS:** **PASS**

## W-02 — Wrong password → feedback → recover
- **STEPS:** correct email + wrong password ×3 → correct password
- **EXPECTED:** each failure rejected with feedback, no lockout before 5, then success
- **ACTUAL:** GoTrue 400 `invalid_credentials` each time, error toast (transient), `finroot.signin.attempts.*` counter 1→2→3; correct password then succeeds and clears the counter
- **STATUS:** **PASS** (5-attempt client lockout itself not tripped — would 30 s-lock the demo email in this browser)

## W-03 — Sign out → protected routes blocked → sign back in
- **STEPS:** header "Sign out" → try `/app/income` directly → sign in again
- **ACTUAL:** sign-out → `/`, session cleared; `/app/income` → redirect `/auth`; sign-in → back in; "SAVED PROFILES: demo" now offered
- **STATUS:** **PASS**

## W-04 — App Lock lifecycle
- **STEPS:** Settings → App Lock on → length 4 → PIN 2468 ×2 → header "Lock" → wrong PIN 9999 → correct PIN 2468 → Settings → App Lock off (confirm "Turn it off")
- **EXPECTED:** PIN stored hashed; lock screen intercepts; wrong rejected; right unlocks; off deletes the PIN
- **ACTUAL:** all as expected. Stored as `{v:2,salt,iter:310000,hash}` PBKDF2, not plaintext. Wrong → "Incorrect PIN. Try again." Correct → app. Off → keys removed, toast "App lock off"
- **STATUS:** **PASS**

## W-05 — Expense: create → verify → edit → verify → delete → verify (full CRUD)
- **STEPS:** header "Add" → Expense, ₹137, note "QA test expense" → Record Expense → open Expenses page → open Income-page table (Expense mode) → Edit → ₹999, note "…EDITED" → Save → Delete → confirm
- **EXPECTED:** persists at every step
- **ACTUAL:**
  - create → toasts "Expense recorded"/"Transaction added"; Expenses "THIS MONTH ₹137", "TOTAL RECORDS 4", dashboard reflects it
  - edit → toast "Transaction updated", table shows ₹999 / "…EDITED"
  - delete → "Delete transaction?" confirm → toast "Transaction deleted", count 4→3
  - reload → gone, "THIS MONTH ₹0", "TOTAL RECORDS 3"
- **STATUS:** **PASS** — persistence confirmed after full page reload at the end. (Minor: quick-add note/amount reset inconsistency BUG-009; date-only time BUG-010.)

## W-06 — Income stream: create → verify persistence → delete
- **STEPS:** `/app/income` → Add Income → "QA Test Income Stream" ₹4,321 → save → reload → Remove stream → reload
- **ACTUAL:** create persists (TOTAL MONTHLY ₹4,321, "1 active stream" after reload); remove → total ₹0, gone after reload
- **STATUS:** **PASS with defect** — a `recurring_items` row created alongside the stream is **not** removed with it (**BUG-001**); had to be deleted separately from the Recurring Income tab (which surfaced a stale dashboard reminder in between).

## W-07 — Budget: create → edit → delete
- **STEPS:** `/app/budget` → Add budget (blank amount) → Add → Edit row → ₹5,000 → Save → Delete row → confirm
- **ACTUAL:** create with blank field → "Budget saved" ₹0 row (**BUG-005**); edit → ₹5,000 "Budget saved"; delete → "Delete budget?" → "Budget deleted", BUDGETS 3→2
- **STATUS:** **PASS with defect (BUG-005)**

## W-08 — Goal: create → contribute → edit → delete
- **STEPS:** `/app/goals` → Add goal "QA Test Goal" target 50000, saved 1000 → Add → Add funds ₹2,500 → Edit → rename → Save → Delete → confirm
- **ACTUAL:** create "Goal added"; contribute → ₹1,000→₹3,500 (2%→7%), "Funds added" (`goal_contribute` RPC); edit → "Goal updated" rename shown; delete → "Delete goal?" → "Goal deleted", GOALS 2→1
- **STATUS:** **PASS** (icon buttons unlabeled, BUG-004)

## W-09 — Tracker: create (2-step) → delete
- **STEPS:** `/app/trackers` → New Tracker → "Travel" → name "QA Test Tracker" → Create tracker → open detail (`?id=`) → Delete → confirm
- **ACTUAL:** created (toast `Tracker "QA Test Tracker" created`, `tracker_spend` shows ₹0); detail page has Edit/Complete/Archive/Export/Delete; delete → confirm with explanation → "Tracker deleted. Your transactions were not changed." → back to list
- **STATUS:** **PASS**

## W-10 — Account: create → edit → delete
- **STEPS:** `/app/accounts` inline form → name "QA Test Account", opening balance 1234 → Add Account → Edit account (card) → rename → submit → Delete (card trash)
- **ACTUAL:** create → "Account added", 2→3 active; edit → loads into form, submit button still says "Add Account" (**BUG-006**) but update works → "Account updated"; delete → **no confirmation**, 3→2, persisted (**BUG-003**)
- **STATUS:** **PASS with defects (BUG-003, BUG-006)**

## W-11 — Global search → navigate
- **STEPS:** Ctrl+K → "bud" → "invest" + Enter
- **ACTUAL:** "bud" filters to "Budget"; unknown term → "No results for …"; "invest" + Enter → `/app/investments`, dialog closes
- **STATUS:** **PASS** (dialog a11y defect BUG-002)

## W-12 — Quick Add via keyboard
- **STEPS:** on `/app`, focus body, press `n`
- **ACTUAL:** Quick Add sheet opens, amount field auto-focused
- **STATUS:** **PASS**

## W-13 — Workspace invite → redemption guard
- **STEPS:** `/app/workspace` → email `qa-invite-test@example.com`, role Viewer → Invite → copy the `/invite/<token>` link → open it while signed in as demo
- **ACTUAL:** invite created (`create_invitation` RPC), one-time link shown; opening it → "This invitation was sent to a different email address" (email-locked, server-checked). Bogus token → "not valid any more"
- **STATUS:** **PASS** — happy-path acceptance (a second real account joining) **NOT TESTED**. Note: the pending invite cannot be revoked from the UI (**BUG-016**); it self-expires in 14 days.

## W-14 — Theme switch persistence
- **STEPS:** header theme toggle obsidian→light→obsidian; check `localStorage`
- **ACTUAL:** `finroot.theme` = "light" / "obsidian", `data-theme` + body background update instantly
- **STATUS:** **PASS**

## W-15 — Route sweep (all 22 app pages + 10 PO + 9 public + redirects)
- **ACTUAL:** every route loaded and rendered its intended content; **zero React errors, hydration errors, or unhandled rejections** across the whole sweep; redirects and 404 all correct
- **STATUS:** **PASS** (see PAGE-INVENTORY for per-page notes)

---

## Workflows NOT tested (and why)

| WORKFLOW | REASON |
|---|---|
| First-run onboarding wizard (5 steps) | demo account is `onboarding_completed = true`; needs a fresh sign-up |
| Sign-up → email confirm → first login | would create a real user on the live project; free-tier mailer rate-limited |
| Password reset email → `/reset-password` with token → new password | would send a real email; no recovery session available |
| Google OAuth sign-in | external Google consent screen |
| Recurring item "Mark received" → transaction logged | not exercised (would create a transaction from the orphan; avoided) |
| Bill Scan: upload receipt → AI extract → review → Approve & Log | needs a real receipt image + server-side Gemini key |
| Import: file → map → commit | no sample broker file uploaded |
| Export: build → download PDF/CSV/Excel/JSON | pane blocks file downloads for the automated browser |
| Billing: cancel / resume / upgrade / invoice | would change the demo account's live subscription; self-serve checkout is disabled anyway |
| Multi-role: owner invites admin/viewer → permission boundary (UI + RLS) | only one usable account; role-harness accounts never provisioned |
| Account deletion end-to-end | routes by email today; service-role edge step not built |
| PO: create/suspend/delete/restore tenant, assign plan, edit site content, rotate secret | mutating shared **live** platform data — out of scope for a non-destructive audit |
| Offline banner / PWA install / service worker | needs a production build; dev server doesn't register the SW |
| Session expiry handling (`handleExpiredSession`) | would require tampering a live JWT |
