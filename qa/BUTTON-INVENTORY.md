# FinRoot — Button / Control Inventory

Covers primary, secondary and icon-only controls. "TESTED" = the click was performed live this session and the result observed. Icon-only buttons with no accessible name are flagged **[no a11y label]**.

Format per row: **result** — note.

---

## Global chrome — header (`DashboardLayout.tsx`) — all `/app/*`

| BUTTON | LOCATION | EXPECTED | TESTED |
|---|---|---|---|
| Sidebar toggle (`SidebarTrigger`) | header left | collapse/expand sidebar | **not clicked** — present |
| Search ("Search anything… Ctrl K") | header | open command palette | **PASS** (via Ctrl+K) — opens `GlobalSearch`; a11y defect BUG-002 |
| **Add** (Plus, "Quick add transaction (press N)") | header | open Quick Add sheet | **PASS** — opens; also via key `n` |
| Theme toggle (Sun/Moon) | header | switch obsidian↔light | **PASS** — bg + `data-theme` + `finroot.theme` change, persists |
| Notifications (Bell) | header | → `/app/notifications` | **PASS** — navigates; unread badge when >0 |
| Profile email link | header | → `/app/profile` | **PASS** (also sidebar footer) |
| Lock (only when app-lock on) | header | lock the screen | **PASS** — shows `LockScreen` |
| Sign out | header | `signOut()` → `/` | **PASS** — session cleared, lands on `/` |
| "View as" role select | header (only if collaborator profiles) | restricted view | **not testable** — no collaborators |

## Sidebar (`AppSidebar.tsx`) — 20 nav links + footer

| CONTROL | EXPECTED | TESTED |
|---|---|---|
| 20 nav links (Dashboard…Settings, grouped Overview/Wealth/Tools) | route to `/app/<x>` | **PASS** — every route loaded (see PAGE-INVENTORY); direct-click verified for Goals, Calendar, Dashboard |
| Plan-locked nav row | routes to upgrade page, padlock shown | **not seen** — Canopy owner has all menus |
| "Install app" (PWA) | prompt / instructions toast | **not shown** — dev server, no SW |
| Workspace switcher (footer) | switch tenant | **not clicked** — single tenant |
| Profile card (footer) | → `/app/profile` | **PASS** |

## Auth `/auth`

| BUTTON | EXPECTED | TESTED |
|---|---|---|
| Sign in / Sign up tabs | switch panel | **PASS** — both render |
| Show password | reveal/hide | present, **not clicked** |
| Forgot password? | open reset dialog | **PASS** — dialog opens |
| Sign in (submit) | authenticate | **PASS** — empty/bad/wrong/correct |
| Continue with Google | OAuth redirect | **NOT TESTED** — external Google consent |
| Saved-profile chip / "Remove <email>" | prefill / forget profile | chip **PASS** (appeared after sign-in); remove **not clicked** |
| Back to site / brand link | → `/` | **PASS** (href) |

## PIN / Lock

| BUTTON | EXPECTED | TESTED |
|---|---|---|
| "4 digits" / "6 digits" | set PIN length | **PASS** (4-digit used) |
| Turn on app lock | save PIN, enable lock | **PASS** |
| Not now | decline, `lock.pref` = off | **PASS** |
| Sign out instead | sign out from the gate | **not clicked** |
| Forgot your PIN? | password fallback | **NOT TESTED** |
| Turn it off (Settings confirm) | disable + delete PIN | **PASS** |

## Dashboard `/app`

| BUTTON | EXPECTED | TESTED |
|---|---|---|
| View Full Report | → report / export | **not clicked** |
| Add Transaction | open Quick Add | **not clicked** (Quick Add covered via header) |
| Metric / section cards (links) | drill to module | **not each clicked** |

## Income `/app/income`

| BUTTON | EXPECTED | TESTED |
|---|---|---|
| Add Income | open AddIncomeDialog | **PASS** |
| Income Streams / Recurring Income tabs | switch | **PASS** |
| list / donut / bar view toggle | chart mode | **PASS** (list default; toggles present) |
| Manage Categories (gear) | open sheet | **not clicked** |
| Add Income Stream (dialog submit) | create | **PASS** — validation + create |
| Close / Cancel (dialog) | dismiss | **PASS** |
| Stream card: Move up / Move down | reorder | present, **not clicked** |
| Stream card: **Remove stream** | delete stream | **PASS** — deletes (no confirm; leaves recurring orphan, BUG-001) |
| Table: Income / Expense toggle | switch table type | **PASS** |
| Table: Add income / Add expense | open TransactionDialog | present |
| Table row: **Edit** (Pencil) | edit txn | **PASS** |
| Table row: **Delete** (Trash) | confirm + delete | **PASS** — "Delete transaction?" |
| Filter: type / category / All dates | filter table | **PASS** (All dates widens range) |

## Expenses `/app/expenses`

| BUTTON | EXPECTED | TESTED |
|---|---|---|
| Spending Overview / Smart Split / Recurring Expenses / Subscriptions tabs | switch | **PASS** (loaded) |
| Add expense | open dialog | present |
| Category filter chips, Today, Reset / Reset Active Filters | cross-filter | present, **not each clicked** |

## Budget `/app/budget`

| BUTTON | EXPECTED | TESTED |
|---|---|---|
| Buckets / Planner tabs | switch | **PASS** |
| Add budget | open dialog | **PASS** |
| Add (dialog submit) | create | **PASS (defect BUG-005)** |
| Row: Edit the <bucket> budget | edit | **PASS** — ₹0→₹5,000 |
| Row: Delete the <bucket> budget | confirm + delete | **PASS** — "Delete budget?" |

## Goals `/app/goals`

| BUTTON | EXPECTED | TESTED |
|---|---|---|
| Add goal | open dialog | **PASS** |
| Add (dialog submit) | create | **PASS** |
| Card: Add funds (piggy-bank) **[no a11y label]** | contribute dialog | **PASS** — ₹2,500 |
| Card: Edit (pencil) **[no a11y label]** | edit dialog | **PASS** — rename |
| Card: Delete (trash) **[no a11y label]** | confirm + delete | **PASS** — "Delete goal?" |

## Trackers `/app/trackers`

| BUTTON | EXPECTED | TESTED |
|---|---|---|
| New Tracker | open type picker | **PASS** |
| Type tiles (Home Construction … Custom) | pick, go to step 2 | **PASS** (Travel) |
| Back / Cancel / Create tracker | wizard nav / create | **PASS** (Create) |
| Active / Completed / Archived tabs | filter | **PASS** (loaded) |
| Detail: Edit | edit tracker | **not clicked** |
| Detail: Complete / Archive | status change | **not clicked** |
| Detail: Export | export tracker data | **not clicked** |
| Detail: **Delete** | confirm + delete | **PASS** — informative confirm |

## Accounts `/app/accounts`

| BUTTON | EXPECTED | TESTED |
|---|---|---|
| Account Type radio grid (7) | pick type | present |
| Add Custom Purpose / utility purpose chips | manage purposes | present |
| Reset | clear form | **not clicked** |
| Add Account (submit) | create / update | **PASS** — create + (mislabeled) update, BUG-006 |
| Transfer | transfer dialog | **not clicked** |
| Card: Balance history | history view | present |
| Card: Edit account | load into form | **PASS** |
| Card: Archive **[no a11y label]** | archive | **not clicked** |
| Card: Delete (trash) **[no a11y label]** | delete — **no confirm** (BUG-003) | **PASS** — deletes immediately |

## Net Worth `/app/net-worth`

| BUTTON | TESTED |
|---|---|
| Add Entry / Add Asset / Add Liability / Customize / 3M-6M-All range | present, **not clicked** |

## Calculator `/app/calculator`

| BUTTON | TESTED |
|---|---|
| 7 calculator tabs, Clear Fields | tabs **PASS** (Average Down computed live); Clear not clicked |

## Calendar `/app/calendar`

| BUTTON | TESTED |
|---|---|
| Prev/next month, Today, day cells, legend toggles | present, **not clicked** (grid + detail render) |

## Workspace `/app/workspace`

| BUTTON | TESTED |
|---|---|
| Team / Recurring Income / Recurring Expenses tabs | **PASS** (loaded) |
| Role select, Pre-set module permissions | present |
| **Invite** | **PASS** — creates link |
| Copy / Done (link panel) | **not clicked** (Done used via JS) |
| Refresh (members) | present |

## Settings `/app/settings`

| BUTTON | TESTED |
|---|---|
| 5 theme cards | **PASS** (obsidian/light toggled elsewhere; cards present) |
| Wealth / Classic layout, Comfortable / Compact | present, **not clicked** |
| Category visibility toggles | present, **not toggled** |
| App lock switch + PIN sub-form | **PASS** (full cycle) |
| "I want to delete my account" | **opened, not confirmed** |
| "Download your data first" | **not clicked** |

## Profile `/app/profile`

| BUTTON | TESTED |
|---|---|
| Upgrade to Pro | **not clicked** — card content wrong (BUG-007) |
| Base currency INR/USD/AED | present |
| Save changes | **NOT TESTED** — would change shared workspace currency |

## Billing `/app/billing`

| BUTTON | TESTED |
|---|---|
| Refresh | present |
| **Cancel subscription** | **NOT TESTED** — live plan state |
| Plans "Contact us" ×3 | mailto — **not clicked** |
| Invoice download (per row) | **N/A** — no history |

## Notifications `/app/notifications`

| BUTTON | TESTED |
|---|---|
| Mark all read | **N/A** — 0 notifications |

## Import / Export / Bill Scan

| BUTTON | TESTED |
|---|---|
| Import: dataset/source/broker pickers, Browse Files | present, **no file** |
| Export: PDF/CSV/Excel, range, "Download all my data" | present; **downloads not triggered** (pane blocks saves) |
| Bill Scan: browse, Start over, Approve & Log Scanned Expenses | present, **no image** |

## Public pages

| BUTTON | TESTED |
|---|---|
| Landing: Sign in, Start free ×2, See the product, anchor nav (Product/Workflow/Voices/Pricing/FAQ), plan CTAs, FAQ accordions, GlassDashboard tab buttons | **render**; anchor-scroll + FAQ toggle **NOT verified** (pane scroll issue, BUG-014) |
| Privacy / Terms / Support / Status: Back to site, "Check again" (Status), mailto (Support) | **render**; "Check again" **not clicked** (checks already ran on load) |
| 404: Return to Home | **PASS** (href `/`) |
| Invite: Go to FinRoot | **PASS** — shown on both invalid-token and wrong-email |

## PO console `/po/*`

All page-level buttons (Add tenant, Save, Update, Rotate secret, Revoke, Open /status, per-tenant module pills, etc.) were **left unclicked** — mutating shared live platform data is out of scope for Stage 1. Navigation between the 10 PO pages: **PASS**.
