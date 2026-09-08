# UX review — Income Streams / Recurring Income / dashboard Reminders

**Scope:** the end-to-end flow BUG-001 lives in — creating income, the two places it shows up, and removing it.
**Method:** design review of the shipped components (no app run, no data changes). Heuristic basis: Nielsen's 10 + WCAG 2.2 AA.
**Files reviewed:** `src/pages/Income.tsx`, `src/components/income/{AddIncomeDialog,IncomeCard,ManageCategoriesSheet}.tsx`, `src/components/recurring/{RecurringDialog,RecurringList}.tsx`, `src/components/dashboard/ActionableReminders.tsx`, `src/hooks/{useIncomeStreams,useRecurring,useRecurringReminders}.ts`, `src/lib/recurringReminders.ts`.
**Date:** 2026-09-08

---

## The flow as built

```
"Add Income"  (Income ▸ Income Streams tab, AddIncomeDialog)
   └─ submit()  fires TWO independent writes, no transaction, no link:
        ├─ onAdd()            → income_streams row   → card on "Income Streams" tab
        └─ createRecurring()  → recurring_items row  → card on "Recurring Income" tab
                                                     → row in dashboard "Reminders" widget
   └─ TWO toasts:  "Recurring item added"  +  "<name> added"

"Add Recurring Income"  (Income ▸ Recurring Income tab, RecurringDialog)
   └─ create.mutate()   → recurring_items row ONLY  (+ optional recurring_reminders if toggled)

"Remove stream"  (IncomeCard, the ✕)
   └─ onRemove()  → deletes income_streams row  (interim fix also best-effort deletes the twin by name+amount)
   └─ NO confirmation dialog
```

The user performed **one** action ("Add Income") and now has **three** on-screen artefacts in **three** locations, named identically, with nothing indicating they are the same thing. That is the UX root of BUG-001, and it is a design problem before it is a data problem.

---

## Findings

Severity: **S1** blocks/erodes trust · **S2** significant friction or a11y gap · **S3** polish.

### S1-1 · One action silently creates two conceptually different objects

`AddIncomeDialog.submit()` (`AddIncomeDialog.tsx:127-151`) creates an income **stream** *and* a recurring **reminder**, on two different tabs, with two toasts, and no visible relationship between them.

- **Heuristic:** *Match between system and the real world*; *Visibility of system status*. The user's model is "I added my salary." The system's model is "you created a projection input and a monthly to-do." Those diverge silently.
- **Consequence chain:** the user later finds a "Recurring Income" card they don't remember making → deletes it or the stream → the other half is orphaned (BUG-001) → a "Mark received" button for income they removed → they log a phantom transaction. Trust in every number on the dashboard drops.
- **Recommendation (pick one):**
  - **A — make the reminder opt-in.** In `AddIncomeDialog`, add one control: `☐ Also remind me each month to record this`. Default it from whether the user has ever used the Recurring tab. Only create the `recurring_items` row when checked. This is the smallest change and removes the surprise entirely.
  - **B — keep auto-create but surface the link.** After the migration adds `income_stream_id`: the stream card shows a small `↻ monthly reminder` chip; the recurring card shows a read-only `from income stream` badge and hides its own delete (you remove it by removing the stream). One object, two views.
- **Do not** ship the current "two objects, zero signposting" state past the migration.

### S1-2 · "Remove stream" is a one-tap, unconfirmed, irreversible delete — and it's the odd one out

`IncomeCard.tsx:97-105` — a bare `<Button size="icon">` with an `X` icon, `aria-label="Remove stream"`, `onClick={() => onRemove(stream.id)}`. **No `AlertDialog`.** Every sibling delete in the app confirms:

| Surface | Confirm? | Copy |
|---|---|---|
| `IncomeCard` "Remove stream" | **none** | — |
| `RecurringList` delete (`RecurringList.tsx:302-327`) | `AlertDialog` | "Remove {name}? This stops future occurrences. Past transactions stay in your log." |
| Accounts delete (post-BUG-003) | `AlertDialog` | "Delete "{name}"? This removes the account and its opening balance from Net Worth…" |

- **Heuristic:** *Error prevention*; *Consistency and standards*. WCAG **3.3.4 Error Prevention** (deletion of user data should be reversible, confirmed, or checked).
- **Recommendation:** wrap the trigger in the same `AlertDialog` pattern:
  > **Remove "Salary — Acme"?** This also removes its monthly reminder from your dashboard. Income you've already recorded stays in your log.
  Cancel / Remove.

### S1-3 · The delete affordance is an `X`, which reads as "dismiss / hide", not "delete forever"

`IncomeCard.tsx:3,104` uses `X` from lucide. An `X` on the trailing edge of a card is the universal *close this / hide this* control. Meanwhile the genuinely safe, reversible "hide" action is buried behind the gear in `ManageCategoriesSheet`. The affordances are **inverted**: destructive is prominent and looks benign, reversible is hidden.

- **Recommendation:**
  - Use `Trash2` for delete (matches `RecurringList`, `TransactionsTable`), tinted `text-destructive`.
  - Promote **hide** to a visible per-card control (an eye / `EyeOff` toggle), since that is the action a user reaching for "get this off my list" actually wants.

### S2-4 · Two front doors to "recurring income", different capabilities, no cross-reference

"Add Income" (streams tab) and "Add Recurring Income" (recurring tab) both create a `recurring_items` row. Differences the user cannot see before committing:

| | Add Income | Add Recurring Income |
|---|---|---|
| Creates a stream (feeds projections) | ✅ | ❌ |
| Reminder control in the dialog | ❌ (none) | ✅ (toggle, off by default) |
| "Received On" / due-date field | "Received On" (past tense) | "Next due date" (future) |

A user who wants "salary every month, remind me" must guess. *Recognition rather than recall.*

- **Recommendation:** one entry point. "Add Income" opens a single dialog with: amount/currency/frequency, then two checkboxes — `☑ Track as an income stream` (projections) and `☐ Remind me each period`. The Recurring tab becomes a *view*, not a second creation path.

### S2-5 · The dashboard "Reminders" widget shows items that aren't reminders, and you can't act on any of them

`ActionableReminders.tsx:80-95` lists **every** `is_active` recurring item with a `next_due_date` — regardless of whether a reminder is enabled (`DEFAULT_REMINDER.enabled = false`, `recurringReminders.ts:20`). So an `AddIncomeDialog` twin, which has no reminder, still appears under a heading that says "Reminders".

Worse, the row is inert: title + "Salary · monthly · due today", **no "Mark received", no link to the item, no dismiss** (`ActionableReminders.tsx:150-174`). If the row is a BUG-001 orphan, there is *no way to clear it from the dashboard at all*.

- **Heuristic:** *User control and freedom*; *Visibility of system status* (the label over-promises).
- **Recommendations:**
  - Only list recurring items whose reminder is enabled **or** which are overdue. A never-reminded, not-yet-due item is noise.
  - Make each row actionable: a "Mark received" affordance and a click-through to the item on the Income page.
  - `filter === "all"` shows `merged.slice(0, 5)` (`:103`) with no "View all →". Add one.

### S2-6 · "Received On" collects a date + time that is then thrown away and repurposed as a future due date

`AddIncomeDialog.tsx:65,123-126,146` — a `DateTimeField` labeled **"Received On"** (past tense, implies "when did this income arrive") whose value is used only as `next_due_date: safeISO.slice(0,10)` for the recurring twin (a **future** date), and whose time component is truncated.

- **Heuristic:** *Match between system and the real world*. The label describes one thing; the field does another.
- **Recommendation:** if the reminder becomes opt-in (S1-1 option A), relabel to **"First reminder date"** and show it only when the reminder box is checked. Drop the time picker — a monthly reminder doesn't need `14:30`.

### S2-7 · Keyboard users cannot reorder streams on desktop

`IncomeCard.tsx:52-68` — the `ChevronUp` / `ChevronDown` move buttons are `className="sm:hidden"`. On `sm` and up the **only** reorder mechanism is native HTML drag-and-drop on the `motion.div` (`:32-46`). The `GripVertical` (`:60`) is a decorative icon, not a focusable control, with no `role`/`aria`.

- **WCAG 2.1.1 Keyboard** (fail) and **4.1.2 Name, Role, Value** (the drag operation has no accessible name and no live-region announcement).
- **Recommendation:** show the up/down buttons at **all** breakpoints (they already call `onMove` and are correctly `disabled` at the ends). Optionally keep drag as an enhancement. Announce the new position via an `aria-live="polite"` region ("Salary moved to position 2 of 4").

### S2-8 · Long form dialogs: no sticky submit, no focus-to-error

`AddIncomeDialog` / `RecurringDialog` are tall forms inside `max-h-[90vh] overflow-y-auto` (`AddIncomeDialog.tsx:162`). On a laptop the "Add Income Stream" button sits below the fold; the footer does not stick. On validation failure, `toast.error(parsed.error.issues[0].message)` (`:119`) fires but focus stays put — the error is a transient toast, not programmatically tied to the field.

- **WCAG 3.3.1 Error Identification** (the association is visual/transient only); **2.4.3 Focus Order**.
- **Recommendations:** `position: sticky` footer with the primary button always visible; on `safeParse` failure, move focus to the first invalid field and render an inline `<p role="alert">` beneath it.

### S2-9 · Dialogs have a `DialogTitle` but no `DialogDescription`

`AddIncomeDialog.tsx:163-165`, `RecurringDialog.tsx:136-138`. Same class as the fixed BUG-002 (command palette). Radix logs a warning and SR users get a title with no framing.

- **Recommendation:** add a visually-hidden or visible `DialogDescription` ("Set up a monthly income source. It'll appear on your Income page and feed your projections.").

### S2-10 · Reminder-due state uses a pulsing dot with no reduced-motion guard

`RecurringList.tsx:252-257` renders `animate-ping` on due/overdue items; `ActionableReminders` tones by color. `animate-ping` runs regardless of `prefers-reduced-motion`.

- **WCAG 2.3.3 Animation from Interactions**, **2.2.2 Pause, Stop, Hide**.
- **Recommendation:** wrap the ping in `motion-safe:` (Tailwind) or gate on `prefers-reduced-motion`. Keep the static dot + text label (those are fine and sufficient).

### S3-11 · "Name (optional)" invites duplicate, ambiguous stream names

`AddIncomeDialog.tsx:106,224` — name is optional; blank ⇒ the stream is named after its category ("Salary"). Two salaries ⇒ two identical cards, and the twin `recurring_items` row is also "Salary". This is precisely the ambiguity that made BUG-001's backfill matching hard.

- **Recommendation:** drop "(optional)"; pre-fill with `"{Category} — "` and let the user finish it ("Salary — Acme"). Or auto-suffix a disambiguator when a name collides.

### S3-12 · "Exchange rate to INR" is a raw number field the user is unlikely to know

`AddIncomeDialog.tsx:276-283`, `RecurringDialog.tsx:237-244` — free-text `type="number"` for an FX rate, enabled whenever currency ≠ INR. Most users don't know today's USD→INR to 4 dp.

- **Recommendation:** pre-fill from the existing `live-price` edge function (or `DEFAULT_FX`) and move it under an "Advanced" disclosure; show the resulting INR amount live so the number is verifiable by its effect, not its value.

### S3-13 · Toast copy is developer language

`useRecurring.ts:84` → `"Recurring item added"`. Users don't have a concept called "recurring item". Also the double toast on Add Income ("Recurring item added" + "Salary added") double-confirms one action.

- **Recommendation:** one toast per user action. "Salary added — you'll see it on your Income page." Suppress the internal `createRecurring` toast when it's fired from `AddIncomeDialog`.

### S3-14 · Icon picker is high-effort for a low-value choice

Both dialogs: a scrolling 8×~5 grid of ~40 icons (`AddIncomeDialog.tsx:293-318`), each with grayscale/opacity/scale hover transitions, `aria-label={PascalCaseKey}` ("PiggyBank button").

- **Recommendation:** collapse to a popover ("Choose an icon") with a sensible default already applied; the flow shouldn't stall on it. Give icons human labels for SR ("piggy bank", not "PiggyBank").

### S3-15 · Empty states don't explain where recurring rows come from

`RecurringList.tsx:187-194` — "No recurring income yet. Add one to start tracking." A user who just added an income stream and switches to this tab sees it populated and has no idea why.

- **Recommendation:** on the Recurring tab, a one-line note: "Income streams with a reminder show up here automatically."

---

## Prioritised recommendations

| # | Change | Effort | Payoff |
|---|---|---|---|
| 1 | **S1-2** — add an `AlertDialog` confirm to "Remove stream", with copy naming the reminder side-effect | XS | removes a data-loss footgun; unblocks the honest version of BUG-001's delete |
| 2 | **S1-3** — swap `X` → `Trash2` (destructive tint); add a visible hide/`EyeOff` per-card control | XS | stops accidental deletes; makes the reversible action the easy one |
| 3 | **S1-1 option A** — make the monthly reminder an explicit checkbox in `AddIncomeDialog` (only create `recurring_items` when checked) | S | eliminates the "two hidden objects" surprise at the source; simplifies the BUG-001 data model going forward |
| 4 | **S2-7** — show the up/down move buttons at all breakpoints | XS | fixes a hard keyboard-a11y failure |
| 5 | **S2-5** — dashboard Reminders: list only reminder-enabled/overdue items, make rows actionable + link out | M | the widget matches its name and gives users a way to act (incl. clearing orphans) |
| 6 | **S2-6** — relabel/relocate "Received On" → conditional "First reminder date" | XS | removes a match-with-reality violation |
| 7 | **S2-8 / S2-9** — sticky dialog footer, focus-to-error, `DialogDescription` | S | form a11y + completion rate |
| 8 | **S1-1 option B** — after the migration, show the stream↔reminder link (chip + read-only badge) | M | one mental model instead of two |
| 9 | S3 batch (11–15) — name field, FX field, toast copy, icon picker, empty-state note | S | polish; several also de-risk BUG-001 matching |

**Sequencing vs BUG-001:** items 1–3 are independent of the migration and worth doing first — they make the *current* behaviour honest. Item 8 depends on `income_stream_id` existing. Item 3 (opt-in reminder) would also shrink the future population the migration's backfill has to reason about.

---

## Accessibility summary (WCAG 2.2 AA)

| Guideline | Where | Status |
|---|---|---|
| 2.1.1 Keyboard | `IncomeCard` reorder (drag-only ≥ sm) | **fail** — S2-7 |
| 4.1.2 Name/Role/Value | `IncomeCard` drag handle; drag operation | **fail** — S2-7 |
| 3.3.4 Error Prevention | "Remove stream" (unconfirmed data deletion) | **fail** — S1-2 |
| 3.3.1 Error Identification | dialog validation = transient toast, no field association | **partial** — S2-8 |
| 2.4.3 Focus Order | no focus move to invalid field | **partial** — S2-8 |
| 4.1.2 (dialog) | `AddIncomeDialog` / `RecurringDialog` missing `DialogDescription` | **partial** — S2-9 |
| 2.3.3 / 2.2.2 Motion | `animate-ping` on due items, no reduced-motion guard | **fail** — S2-10 |
| 1.4.1 Use of Color | type badge (active/passive), due-state tone | **pass** — text labels present; check violet/amber contrast |
| 2.5.8 Target Size | icon buttons `h-8 w-8` (32px) | **pass** (≥ 24px); reorder chevrons `w-4 h-4` in a small hit-area — verify ≥ 24px |
