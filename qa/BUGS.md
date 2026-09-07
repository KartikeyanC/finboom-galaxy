# FinRoot — QA Stage 1 Bug Log

> **Stage 2 (branch `fix/qa-stage-2`, PR #6):** BUG-001, 002, 003, 004, 005, 007, 008, 010, 011,
> 012, 013, 015, 016, 018 **fixed** (typecheck 0 · lint 0 · 813 tests green). BUG-006 / 009 / 014
> investigated and confirmed **not bugs** (see `qa/STAGE-2-STATUS.md`). BUG-001's structural
> FK+CASCADE version is written as a migration but not yet applied (needs a Supabase access token);
> the interim frontend fix is live. Only carry-forward: apply that migration.


Commit `2a4b0d3` · env: Vite dev `http://localhost:5188` against live Supabase `ludbntvhagefadfkhrjj` · account `demo@finroot.app` (owner + platform admin, Canopy).
Severity: **P0** unusable/data-loss · **P1** major feature broken · **P2** important issue, workaround exists · **P3** minor functional/usability · **P4** cosmetic.

> No pre-existing security items from `docs/BUG_TRACKER.md` / `CLAUDE.md` (po-auth rate limit, webhook signature, CORS `*`, etc.) are re-listed here — they are documented, known, and were not re-verified in this UI audit. See `qa/PROJECT-OVERVIEW.md` §2.

---

## BUG-001 — Deleting an income stream orphans its recurring item
- **SEVERITY:** P2
- **MODULE:** Income / Recurring
- **PAGE / ROUTE:** `/app/income` (both tabs) + `/app` dashboard "Reminders"
- **FEATURE:** Income stream delete
- **STEPS TO REPRODUCE:**
  1. `/app/income` → "Add Income" → name "X", amount 4321, save. Two toasts fire: *"Recurring item added"* and *"X added"* (a row is created in **both** `income_streams` and `recurring_items`).
  2. On the stream card click "Remove stream". The card disappears and the monthly total drops to ₹0.
  3. Reload. Open the **Recurring Income** tab, and look at the dashboard **Reminders** widget.
- **EXPECTED:** Removing the stream removes the recurring item it created.
- **ACTUAL:** The recurring item survives. It shows on the dashboard as *"X — ₹4,321 · Salary · monthly · due today"* and in the Recurring Income tab with a **"Mark received"** button that would log a transaction for an income source the user has deleted.
- **CONSOLE / NETWORK:** none (silent).
- **DATABASE IMPACT:** orphaned `recurring_items` row; `useIncomeStreams.remove()` (`src/hooks/useIncomeStreams.ts:229`) only does `db.from("income_streams").delete().eq("id", id)` and never touches `recurring_items`.
- **EVIDENCE:** reproduced during this audit; recurring item had to be deleted separately from the Recurring Income tab.
- **NOTES:** Either cascade the delete, or don't auto-create the recurring item, or surface it as the same object in both places.

## BUG-002 — Command palette (Ctrl+K) dialog has no accessible name
- **SEVERITY:** P3
- **MODULE:** Global search
- **PAGE / ROUTE:** every `/app/*` page (`src/components/GlobalSearch.tsx` → `CommandDialog` in `src/components/ui/command.tsx:29`)
- **STEPS:** Sign in → press **Ctrl+K**.
- **EXPECTED:** Dialog exposes a title/description to assistive tech.
- **ACTUAL:** Console error every open:
  `` `DialogContent` requires a `DialogTitle` for the component to be accessible for screen reader users `` and warning `Missing 'Description' or 'aria-describedby' for {DialogContent}`. `aria-labelledby` points at a generated id with no matching element. A screen-reader user gets an unnamed dialog.
- **FIX SHAPE:** add a visually-hidden `<DialogTitle>` (and `<DialogDescription>`) inside `CommandDialog`.

## BUG-003 — Deleting an account has no confirmation
- **SEVERITY:** P3
- **MODULE:** Accounts
- **PAGE / ROUTE:** `/app/accounts`
- **STEPS:** On any account card click the trash icon.
- **EXPECTED:** A confirm dialog ("Delete account? …"), consistent with transactions / budgets / goals / trackers which all confirm.
- **ACTUAL:** The account is deleted immediately on one click, no prompt, no undo. Verified: created "QA Test Account", clicked trash, it was gone (count 3 → 2, persisted through reload). Deleting an account also affects Net Worth and balance history.
- **RELATED:** the trash and archive controls on the account card are **icon-only with no `aria-label`** (screen readers announce "button").

## BUG-004 — Goal card action buttons have no accessible name
- **SEVERITY:** P3
- **MODULE:** Goals
- **PAGE / ROUTE:** `/app/goals`
- **ACTUAL:** The three per-goal icon buttons — piggy-bank (*Add funds*), pencil (*Edit*), trash (*Delete*) — render with **no `aria-label`** and no visible text. Contrast: the transactions table correctly uses `aria-label="Edit …" / "Delete …"`.
- **EXPECTED:** each icon button carries an `aria-label`.

## BUG-005 — Budget "Add" accepts an empty / zero allocation
- **SEVERITY:** P3
- **MODULE:** Budget
- **PAGE / ROUTE:** `/app/budget` → "Add budget"
- **STEPS:** Open "Add budget", leave **Allocated** blank, click **Add**.
- **EXPECTED:** validation — "Enter an allocation amount" / positive number required.
- **ACTUAL:** toast *"Budget saved"*, a `Needs / 2026-08-31 / ₹0` row is created. A ₹0 budget is meaningless and clutters the list. (Income's "Add Income Stream" and Accounts' "Add Account" both validate; Budget does not.)
- **NOTES:** also allowed a 3rd "Needs" budget alongside two existing August "Needs" budgets — confirm whether overlapping periods for one bucket should be prevented.

## BUG-006 — ~~Account edit reuses the "Add Account" button label~~ — **RETRACTED (not a bug)**
- **SEVERITY:** — · **Re-verified 2026-09-07: INVALID.**
- When "Edit account" is triggered with a real click, the panel heading becomes "Edit Account" and the
  submit button correctly reads **"Save Changes"** (with a "Cancel" beside it) — `AccountsManager.tsx:491`.
  The earlier observation was a test-automation artefact (a malformed synthetic click that half-populated
  the form without entering edit mode). No fix needed.

## BUG-007 — Profile "Upgrade to Pro — ₹199/mo" does not match the plan catalogue
- **SEVERITY:** P3
- **MODULE:** Profile / plans
- **PAGE / ROUTE:** `/app/profile`
- **ROOT CAUSE (`src/pages/Profile.tsx`):** `const isPro = plan?.toLowerCase().includes("pro")` — the real plan names are **Roots / Canopy / Heritage**, none contains "pro", so `isPro` is **always false** and the free-tier card is shown to *everyone*, including paid users. The whole `PlanCard` is written against a defunct two-tier "Roots / Pro @ ₹199/mo" model; `ROOTS_FEATURES`, `PRO_FEATURES` and the `₹199/mo` string are hard-coded (`Profile.tsx:18-19,113`).
- **EXPECTED:** derive plan tier + features + price from the `plans` table / `usePricingContent`; treat "not Roots" as paid.

## BUG-008 — `/reset-password` enables the form from a normal session (minor); heading nit
- **SEVERITY:** P4  *(revised down after code review)*
- **MODULE:** Auth
- **PAGE / ROUTE:** `/reset-password`
- **ACTUAL:** The **signed-out** path is already handled well (`ResetPassword.tsx`, BUG-099 fix): the field is `disabled` showing "Waiting for your secure reset link to be verified…", and an `#error=` param or a 15 s timeout flips it to "This link isn't working". The remaining gap: when a user is **already signed in** and navigates to `/reset-password` directly, `supabase.auth.getSession()` returns their normal session → `becomeReady()` → the "Set a new password" form is enabled with no recovery context. Also `<h1>` is "FinRoot" and the real title is a `<CardTitle>` that is *not* `as="h1"` (Auth.tsx does this correctly).
- **EXPECTED:** only `becomeReady()` on a genuine `PASSWORD_RECOVERY` event (not a plain existing session); make the card title the `<h1>`.

## BUG-009 — Quick Add: sheet appeared to stay open with the amount retained — **LIKELY A TEST ARTEFACT**
- **SEVERITY:** P4 · **NEEDS VERIFICATION in a real browser**
- **MODULE:** Quick Add (`src/components/QuickAddSheet.tsx`)
- **OBSERVED:** ~2.5 s after "Record Expense", the sheet was still open and the amount field still read "137".
- **CODE REVIEW:** `handleSave()` calls `onOpenChange(false)` on a **700 ms** timer after a successful save, and the `useEffect([open])` clears every field when it re-opens. In the audit the browser pane was a hidden/background tab, where `setTimeout` is heavily throttled — the 700 ms close very likely just hadn't fired yet. Confirm in a foreground browser: if the sheet closes within ~1 s and re-opens empty, this is **not a bug**.

## BUG-010 — Quick-added transactions get a midnight-UTC time
- **SEVERITY:** P4
- **MODULE:** Quick Add / transactions
- **ACTUAL:** an expense added ~22:00 IST via Quick Add shows as **05:30 AM** in the ledger and the edit dialog (00:00 UTC → +05:30 IST). Quick Add only captures a date; the time defaults to the start of the UTC day.
- **EXPECTED:** default to "now", or don't show a time for date-only entries.

## BUG-011 — `Import` page has no `<h1>`
- **SEVERITY:** P4 (a11y / SEO)
- **PAGE / ROUTE:** `/app/import` — the visible "Import" heading is not an `<h1>` (page has none). Every other app page has one.

## BUG-012 — Leading whitespace in several page `<h1>`s
- **SEVERITY:** P4
- **PAGE / ROUTE:** `/app/trips` (" Trip Tracker Hub"), `/app/calculator` (" Investment Calculator Suite"), and the same pattern on Reminders, Billing, Settings, Profile, Notifications ( `" Reminders"`, `" Billing"`, …). A stray leading space in the heading string.

## BUG-013 — Insurance summary counters render "00"
- **SEVERITY:** P4
- **PAGE / ROUTE:** `/app/insurance` — "ACTIVE POLICIES 00", "RENEWING SOON 00", "OVERDUE POLICIES 00" (zero-padded to two digits). Cosmetic; confirm it is intentional and not a broken counter.

## BUG-014 — Landing page: deep scroll could not be verified
- **SEVERITY:** P3 → **NEEDS VERIFICATION IN A REAL BROWSER**
- **PAGE / ROUTE:** `/`
- **OBSERVED:** In the automated in-app browser, `window.scrollTo` / `scrollBy` / wheel / `End` are complete no-ops on `/` (document 5900 px, viewport 900 px). No `overflow:hidden`, no scroll-lock CSS, `wheel` not `preventDefault`ed were found. Sizing the viewport to 3200 px tall showed all sections **do** render correctly (hero, product bento, pricing, FAQ) and the animated stat counters settle on real values (₹4.2B+, 32k, 7, 4.9★).
- **UNCERTAINTY:** the same pane also mis-renders screenshots and never fires `animationend`, so this may be an instrumentation artifact rather than a real scroll trap. Could not cross-check — Claude-in-Chrome extension was not connected.
- **ACTION:** open `/` in a normal desktop + mobile browser and confirm a user can scroll from hero to the "Get started" CTA.
- **RELEVANT:** `src/pages/Landing.tsx`, `src/pages/landing/FloatingNav.tsx` and `src/pages/landing/effects.tsx` are all part of the **uncommitted** branding WIP in this tree — if a real browser also can't scroll `/`, start there.

## BUG-015 — Expenses: "N entries in view" vs the filtered result
- **SEVERITY:** P4
- **PAGE / ROUTE:** `/app/expenses` (Spending Overview) — header reads "3 entries in view · last 3 months" while the active **Today** filter shows "Transactions found: 0" and the empty state. The two counts describe different things on the same screen.

## BUG-016 — No way to see or revoke a pending workspace invitation
- **SEVERITY:** P4
- **PAGE / ROUTE:** `/app/workspace`
- **ACTUAL:** After "Invite" creates a link, dismissing the panel ("Done") leaves no trace — the Members list shows only accepted members. There is no pending-invitations list and no revoke control, and the link panel says "This is the only time it can be shown." An invite sent to the wrong address can only be waited out (14-day expiry).

## BUG-017 — Dashboard shows two contradictory net-worth figures at once
- **SEVERITY:** P2 (visible on the home screen of a finance app; undermines trust in every figure) — **root cause identified, exact repro trigger NEEDS VERIFICATION**
- **MODULE:** Dashboard / Net Worth
- **PAGE / ROUTE:** `/app`
- **STEPS TO REPRODUCE:** sign in, open the dashboard, compare the top **"NET WORTH"** metric card with the **"Wealth Overview → CURRENT NET WORTH"** panel lower down.
- **EXPECTED:** the same number.
- **ACTUAL (observed live, stable across reloads):**
  - Top metric card **NET WORTH / TOTAL ASSETS: −₹8,128** (matches the `/app/net-worth` page: HDFC Savings −₹15,128 + Paytm Wallet ₹7,000).
  - "Wealth Overview" panel **CURRENT NET WORTH / ASSETS: ₹52,000**, LIABILITIES ₹0.
  - The `/app/net-worth` page itself labels the delta "**−₹60,128 (−116%) vs Aug 5**" — ₹52,000 is the **Aug-5 historical value**, not "current".
- **ROOT CAUSE (in code):** `src/components/dashboard/NetWorthTrend.tsx` (the "Wealth Overview" panel) computes net worth from the **legacy localStorage stores** — `useAccounts()` (`src/lib/accountsStore.ts`), `useInvestments()` (`investmentsStore`), `useDebts()` (`debtsStore`) — via `calcLiveTotalBalance(accounts, liveBalances)`. The top metric cards and the `/app/net-worth` page use `useDashboardSummary` / server (`accounts` table) data. CLAUDE.md documents these `lib/*Store.ts` stores as **pending migration** to tenant-scoped tables — this bug is the visible symptom of that half-done migration.
- **NOTE ON REPRO:** at the very start of this session the panel also read −₹8,128 (consistent). It flipped to ₹52,000 at some point during ~2 h of CRUD testing (account create/delete, transaction CRUD, a goal contribution — all cleaned up afterwards). Because the panel's inputs are per-browser localStorage, the trigger and whether it reproduces on a clean browser must be confirmed. The *contradiction on screen right now* is real regardless.
- **EVIDENCE:** observed in a dashboard screenshot this session — top card −₹8,128, "Wealth Overview" ₹52,000 side by side. (Screenshots could not be reliably written to disk from the automated pane; see the tooling-limits note.)

## BUG-018 — Account "Archive" button is a non-functional mock
- **SEVERITY:** P3
- **MODULE:** Accounts
- **PAGE / ROUTE:** `/app/accounts` — each account card
- **STEPS:** click the archive (box) icon on an account card.
- **ACTUAL:** toast **"Archived (mock)"**, nothing changes (`AccountList.tsx:121` — `onClick={() => toast.message("Archived (mock)")}`). A placeholder control shipped to production on a data-management screen. The icon also has **no `aria-label`** (same as BUG-003's trash icon).
- **EXPECTED:** wire it to a real archive (soft-hide) action, or remove the button until it exists.

---

## Observations (not filed as bugs — confirm intent)

| # | Area | Note |
|---|---|---|
| OBS-1 | Dashboard | "TOTAL ASSETS **-₹8,128**" — a bank account with a negative balance (demo data: HDFC Savings -₹15,128) is summed as a negative asset, so the "assets" figure and the net-worth figure are identical and negative. Consider clamping negative balances into liabilities, or relabelling. |
| OBS-2 | Budget | Summary card "SPENT ₹0 / 0% used" while budget rows show ₹175 and ₹303 spent — likely because the summary is current-period-only and there is no September budget. Verify. |
| OBS-3 | Dev server | `npm run dev` needed restarting 2–3× during the ~2 h session (the preview process disappeared). Could be the sandbox reaping an idle process rather than a crash — `preview_logs` showed no error. Verify it stays up under normal use. |
| OBS-4 | Realtime | 3 × `net::ERR_CONNECTION_CLOSED` in the console over the session, no user-visible effect — consistent with the Supabase realtime WebSocket (`useRealtimeSync`) dropping in the pane. |
| OBS-5 | Radix dialogs | Closed (`data-state="closed"`) dialogs linger in the DOM in this pane because `animationend` never fires. Almost certainly a pane artifact — in a real browser Radix unmounts them — but worth a glance in a real browser DevTools. |

## Environment / tooling limits that shaped this audit (not product bugs)

- In-app browser pane: screenshots unreliable while the pane is hidden; `computer` mouse clicks frequently land off-target (JS `.click()` / full pointer-event sequences used instead); framer-motion & Radix exit animations don't complete; `window.scrollTo` inert on the landing page.
- `read_network_requests` only captures same-origin (`localhost:5188`) traffic — Supabase REST/RPC/auth calls were verified via direct `fetch` probes, `localStorage` session state, UI state changes and success/error toasts instead.
- Claude-in-Chrome (real browser) was not connected, so no independent cross-check of the landing-scroll question.
