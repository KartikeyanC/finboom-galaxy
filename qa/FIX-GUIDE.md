# FinRoot — Stage 2 Fix Guide

Step-by-step remediation for every **confirmed** finding from Stage 1, ordered by priority.
Nothing here has been applied — Stage 2 (fix + regression) is a separate, approved phase.

Each fix lists: **file(s)** · **change** · **why** · **regression check**.
Line numbers are from commit `2a4b0d3` + the uncommitted branding WIP present at audit time — re-open the file before editing.

Priority order: BUG-001 → BUG-017 → BUG-002 → BUG-003 → BUG-004 → BUG-005 → BUG-007 → BUG-018 → BUG-010 → the P4 batch → the NEEDS-VERIFICATION items.

---

## BUG-001 (P2) — income-stream delete orphans its recurring item

### What's wrong
`src/components/income/AddIncomeDialog.tsx` `submit()` fires **two independent writes**:
```
onAdd({...})                    // → income_streams row  (useIncomeStreams.add)
createRecurring.mutate({...})    // → recurring_items row (useCreateRecurring)
```
There is no column linking the two rows. `IncomeCard`'s "Remove stream" → `useIncomeStreams.remove()` deletes only the `income_streams` row (`src/hooks/useIncomeStreams.ts:229-241`). The `recurring_items` row lives on and shows on the dashboard "Reminders" widget with a "Mark received" button.

### Fix — Option B (recommended, correct): link + cascade

**Step 1 — migration.** New file `supabase/migrations/<ts>_link_recurring_to_income_stream.sql`:
```sql
alter table public.recurring_items
  add column if not exists income_stream_id uuid
  references public.income_streams(id) on delete cascade;

create index if not exists recurring_items_income_stream_id_idx
  on public.recurring_items(income_stream_id);
```
Apply it (`supabase db push`), then regenerate types:
`supabase gen types typescript --project-id ludbntvhagefadfkhrjj > src/integrations/supabase/types.ts` (Bash, not PowerShell — BOM/CRLF).

**Step 2 — return the new id from `add()`.** `src/hooks/useIncomeStreams.ts` — change `add` to `.insert(...).select("id").single()` and `return data.id` (currently returns `void`).

**Step 3 — pass it through.** `src/components/income/AddIncomeDialog.tsx`:
- change the `onAdd` prop type to `(input) => Promise<string | undefined>`;
- in `submit()`, `const streamId = await onAdd({...});` then
  `createRecurring.mutate({ ...recurringInput, income_stream_id: streamId ?? null });`
- update `RecurringInput` in `src/hooks/useRecurring.ts` to include `income_stream_id?: string | null`.

**Step 4 — one-time cleanup of existing orphans** (run once against the DB, or ship as a migration):
```sql
-- recurring income rows whose "name" no longer matches any income stream in the same tenant
delete from public.recurring_items ri
where ri.type = 'income'
  and ri.income_stream_id is null
  and not exists (
    select 1 from public.income_streams s
    where s.tenant_id = ri.tenant_id and s.name = ri.name
  );
```
(Review the SELECT first; only delete what it returns.)

### Fix — Option A (pragmatic interim, no migration)
In `AddIncomeDialog.submit()` simply **remove** the `createRecurring.mutate(...)` block and the `"${d.name} added"` / recurring toast. An income stream stops auto-creating a schedule; a user who wants a recurring reminder adds it on the **Recurring Income** tab. Still run Step 4's cleanup for existing orphans.

### Regression check
- Add an income stream → confirm exactly one row appears on both the Streams list and (Option B) the Recurring Income tab.
- Delete the stream → confirm the Recurring Income tab entry and the dashboard "Reminders" entry both disappear (Option B) / that no recurring entry was ever made (Option A).
- `src/hooks/mutationPaths.test.ts` and any income/recurring unit tests still green.

---

## BUG-017 (P2) — dashboard shows two different net-worth figures

### What's wrong
`src/components/dashboard/NetWorthTrend.tsx` (the "Wealth Overview" panel) computes net worth from the **legacy localStorage stores**:
```
useAccounts()      // src/lib/accountsStore.ts   (localStorage)
useInvestments()   // src/lib/investmentsStore.ts (localStorage)
useDebts()         // src/lib/debtsStore.ts       (localStorage)
```
The top metric cards (`DashboardClassic.tsx`, via `useDashboardSummary`) and the `/app/net-worth` page use **server** data (`accounts` table). When the two sources disagree (they did: −₹8,128 vs ₹52,000), the same screen shows both.

### Fix
**Step 1 — repoint `NetWorthTrend` at server data.** Replace the three localStorage hooks with the same source the rest of the dashboard uses:
- assets: `useDashboardSummary()` already returns `assets` / `liabilities` / `netWorth` (see `DashboardClassic.tsx:55-67`) — reuse it, or
- use `useLiveAccountBalances` + the server `accounts`/`investments`/`debts` hooks (`useDematAccounts`, etc.) consistently with `/app/net-worth`.
- Delete the `useAccounts`/`useInvestments`/`useDebts` imports from this file.

**Step 2 — grep for other legacy-store readers still on a live screen:**
```
grep -rn "from \"@/lib/accountsStore\"\|from \"@/lib/investmentsStore\"\|from \"@/lib/debtsStore\"\|from \"@/lib/netWorthStore\"\|from \"@/lib/remindersStore\"\|from \"@/lib/tripsStore\"" src/
```
`NetWorthTrend.tsx` is the one that bit us; check whether any other dashboard/summary component reads these. `AccountsManager.tsx` legitimately still uses `accountsStore` (Accounts is one of the not-yet-migrated modules) — that's the migration backlog, not this bug. The bug is specifically a **summary widget** disagreeing with the canonical figure.

**Step 3 (bigger, tracked separately):** finish migrating `accounts`, `investments`, `debts`, `reminders`, `trips`, `net worth` off `lib/*Store.ts` per the CLAUDE.md backlog. Until then, every summary/aggregate must read the server, never the store.

### Regression check
- Dashboard top "NET WORTH" card == "Wealth Overview → CURRENT NET WORTH" == `/app/net-worth` "YOUR TOTAL NET WORTH", to the rupee, on a fresh load and after an account edit.
- `useDashboardSummary.test.ts` still green.

---

## BUG-002 (P3) — Ctrl+K command palette has no accessible name

### What's wrong
`src/components/ui/command.tsx:26-36` — `CommandDialog` renders `<DialogContent>` with no `<DialogTitle>`/`<DialogDescription>`. Radix logs an error every open and screen-reader users get an unnamed dialog.

### Fix
`src/components/ui/command.tsx`:
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
// add near the top:
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";  // already a transitive dep of radix

const CommandDialog = ({ children, ...props }: CommandDialogProps) => (
  <Dialog {...props}>
    <DialogContent className="overflow-hidden p-0 shadow-lg">
      <VisuallyHidden.Root>
        <DialogTitle>Search</DialogTitle>
        <DialogDescription>Search pages, transactions and settings</DialogDescription>
      </VisuallyHidden.Root>
      <Command className="...">{children}</Command>
    </DialogContent>
  </Dialog>
);
```
If `@radix-ui/react-visually-hidden` isn't resolvable, use a `<span className="sr-only">` wrapper instead (Tailwind `sr-only` is already in the project).

### Regression check
Open Ctrl+K → no console error, no `Missing Description` warning; the palette still looks identical (title is visually hidden).

---

## BUG-003 (P3) — deleting an account has no confirmation, and the icon has no label

### What's wrong
- `src/components/accounts/AccountsManager.tsx:193-199` `remove(id)` deletes immediately, no prompt.
- `src/components/accounts/AccountList.tsx:125-132` the trash `<Button size="icon">` has no `aria-label`.

### Fix
**Step 1 — add a confirm.** `AccountList.tsx` already imports `AlertDialog*` (line ~24-31, used elsewhere). Wrap the trash button the same way the transactions table does (`src/components/transactions/TransactionsTable.tsx:416-435` is the pattern):
```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
            aria-label={`Delete ${a.name}`}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete “{a.name}”?</AlertDialogTitle>
      <AlertDialogDescription>
        This removes the account and its opening balance from Net Worth and balance history.
        Transactions already recorded against it are not deleted.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={() => onRemove(a.id)}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```
**Step 2** — the `aria-label` in the snippet above covers the label half.

### Regression check
Click trash → confirm dialog appears → Cancel keeps the account → Delete removes it (count decrements, persists through reload). Screen reader announces "Delete <name>, button".

---

## BUG-004 (P3) — goal card icon buttons have no accessible name

### What's wrong
`src/components/goals/GoalManager.tsx:335-342` — the edit (`Pencil`) and delete (`Trash2`) buttons are `size="icon"` with no `aria-label`; "Add funds" is icon-only below `sm`.

### Fix
```tsx
<Button variant="ghost" size="sm" aria-label={`Add funds to ${g.title}`} ...>   {/* line ~330 */}
<Button variant="ghost" size="icon" aria-label={`Edit ${g.title}`} ...>          {/* line ~335 */}
<Button variant="ghost" size="icon" aria-label={`Delete ${g.title}`} ...>        {/* line ~339 */}
```

### Regression check
`e2e/ui-a11y.spec.ts` / an axe pass on `/app/goals` reports no "button has no accessible name" on the goal cards.

---

## BUG-005 (P3) — "Add budget" accepts a blank / ₹0 allocation

### What's wrong
`src/components/budgets/BudgetManager.tsx:51-55`:
```ts
const schema = z.object({
  bucket: z.string().min(1),
  allocated: z.number().nonnegative().max(1e12),   // ← 0 passes
  period_start: z.string().min(1),
});
```
`allocated` state defaults to `"0"` and `MoneyInput` sets `""` when cleared → `Number("")` is `0` → `.nonnegative()` passes → "Budget saved" with a ₹0 row.

### Fix
```ts
allocated: z.number().positive("Enter an allocation greater than zero").max(1e12),
```
Optionally also change the initial state (`BudgetManager.tsx:70,84`) from `"0"` to `""` so the field starts empty rather than showing a value that would be rejected.

### Note
The "3rd Needs budget" concern from the audit is **not** a bug — `useSetBudgetAllocation` upserts on `(tenant, bucket, period_start)`, and my extra row had a different `period_start` (2026-08-31 vs 2026-08-01). No dedupe change needed.

### Regression check
Open "Add budget", leave the amount blank → "Add" shows "Enter an allocation greater than zero" and creates nothing. A positive value still saves. `useBudgetSpend.test.ts` green.

---

## BUG-007 (P3) — Profile "Upgrade to Pro — ₹199/mo" is wrong for everyone

### What's wrong
`src/pages/Profile.tsx`:
- `:18-19` hard-coded `ROOTS_FEATURES` / `PRO_FEATURES`.
- `:45` `const isPro = plan?.toLowerCase().includes("pro")` — real plans are **Roots / Canopy / Heritage**, so `isPro` is **always false**; every user sees the free-tier card + the "₹199/mo" banner (`:113`), including paid users.

### Fix
**Step 1 — correct the tier check:**
```ts
const isPaid = !!plan && plan.toLowerCase() !== "roots" && isActive;
```
Rename `isPro` → `isPaid` throughout the component.

**Step 2 — drive features + price from real data.** Use `usePricingContent()` (already in the repo, powers `/` and `/po/pricing`) or `upgradeable_plans()` to get the next tier's name, price and feature list, instead of the two hard-coded arrays and the `₹199/mo` literal. For a paid user, show "Manage plan" (already there) and hide the upgrade banner (the `{!isPro && ...}` guard becomes `{!isPaid && ...}` and will now be correct).

**Step 3 — delete** `ROOTS_FEATURES`, `PRO_FEATURES`, and the `₹199/mo` / "Upgrade to Pro" strings.

### Regression check
- Demo account (Canopy) → Profile shows "Canopy / Active", "Manage plan", **no** upgrade banner.
- A Roots account → shows the real next tier (Canopy ₹699/yr) and its real features.

---

## BUG-018 (P3) — account "Archive" button is a mock

### What's wrong
`src/components/accounts/AccountList.tsx:119-124` — `onClick={() => toast.message("Archived (mock)")}`, no `aria-label`, does nothing.

### Fix
Pick one:
- **Remove it** until a real archive exists — delete the button, drop the `Archive` import.
- **Implement it** — add `is_archived boolean default false` to `accounts` (migration), an `onArchive(id)` prop that flips it, filter archived accounts out of the active list + "N active accounts" count, and an "Archived" section/toggle to restore. Add `aria-label={`Archive ${a.name}`}`.

Given YAGNI and the "2 active accounts" copy, **removing it** is the smaller correct move for now.

### Regression check
No "(mock)" toast anywhere (`grep -rn "mock" src/` should only hit comments/tests).

---

## BUG-010 (P4) — quick-added transactions get a midnight-UTC timestamp

### What's wrong
`src/components/QuickAddSheet.tsx:90` — `occurred_at: new Date(date).toISOString()` where `date` is `"YYYY-MM-DD"`. `new Date("2026-09-07")` is parsed as **UTC midnight**, so an IST user sees "05:30 AM".

### Fix
If the chosen date is today, stamp the current wall-clock time; otherwise noon local (so a tz shift never moves the calendar day):
```ts
const chosen = date;                                  // "YYYY-MM-DD"
const today  = new Date().toISOString().slice(0, 10); // UTC today — good enough here
const occurredAt = chosen === today
  ? new Date().toISOString()
  : new Date(`${chosen}T12:00:00`).toISOString();
// ...
occurred_at: occurredAt,
```
(`DateTimeField` on the full transaction dialog already does time properly — this is only the quick sheet.)

### Regression check
Quick-add an expense now → the ledger row and the edit dialog show a sensible current time, not 05:30 AM.

---

## P4 batch — quick cosmetic fixes

| Bug | File | Change |
|---|---|---|
| **BUG-011** Import has no `<h1>` | `src/pages/Import.tsx` | make the visible "Import" title an `<h1>` (match the other pages' header pattern) |
| **BUG-012** leading space in `<h1>`s | `src/pages/Trips.tsx`, `Calculator.tsx`, `Reminders.tsx`, `Billing.tsx`, `Settings.tsx`, `Profile.tsx`, `Notifications.tsx` | remove the stray leading space in the heading string (`" Trip Tracker Hub"` → `"Trip Tracker Hub"`); likely a shared header component or a `{" "}{icon}` ordering issue — check for one root cause first |
| **BUG-013** Insurance "00" counters | `src/pages/Insurance.tsx` | if the 2-digit pad is unintended, format the metric as a plain number; if intended (design), leave it and close the bug |
| **BUG-015** "N entries in view" vs filtered count | `src/pages/Expenses.tsx` (Spending Overview) | make the header count reflect the active filter, or reword it to "N total, last 3 months" so it doesn't read as the on-screen count |
| **BUG-016** no pending-invite management | `src/pages/WorkspaceManage.tsx` + a `list_invitations` / `revoke_invitation` RPC | add a "Pending invitations" list under Members with a Revoke action (needs a small RPC + migration). Lower priority — invites self-expire in 14 days |
| **BUG-008** `/reset-password` from a normal session | `src/pages/ResetPassword.tsx` | in the `onAuthStateChange` handler, only `becomeReady()` on `event === "PASSWORD_RECOVERY"` (drop the `|| "SIGNED_IN"` and the `getSession()` shortcut, or gate them on a `type=recovery` hash param). Make `<CardTitle>` the `<h1>` |

---

## NEEDS VERIFICATION before fixing

| Bug | How to verify |
|---|---|
| **BUG-014** landing deep-scroll | Open `/` in a real desktop **and** mobile browser. Scroll hero → Product → Pricing → FAQ → "Get started". If it scrolls fine, close as a test-harness artefact. If it traps: the suspects are `src/pages/Landing.tsx`, `src/pages/landing/FloatingNav.tsx`, `src/pages/landing/effects.tsx` — all **uncommitted branding WIP** — check for a `useEffect` that calls `scrollTo`/locks `overflow`, or a full-height `position:fixed` layer over the scroll container. |
| **BUG-009** quick-add sheet stay-open | Foreground browser: quick-add an expense, confirm the sheet closes within ~1 s and re-opens empty. Code says it should (700 ms `onOpenChange(false)` + reset-on-open). |
| **OBS-3** dev server restarts | Run `npm run dev` and use the app for 15+ min; watch whether the process dies. If it's only the sandbox reaping idle processes, not a bug. |
| **OBS-1** negative "TOTAL ASSETS" | Product decision: should a negative account balance (overdraft) count as a negative asset, or be surfaced as a liability? `useDashboardSummary` / the net-worth calc. |
| **OBS-2** budget summary "SPENT ₹0" | Confirm it's current-period-only and there's simply no September budget; if so, not a bug. |
