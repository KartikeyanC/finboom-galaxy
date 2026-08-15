# Test Case Register

> Seed register generated from the Phase 1 audit (2026-08-04). Strategy:
> [Testing_Master_Plan.md](./Testing_Master_Plan.md). Execution results (Actual / Status /
> Bug ID / Executed by / Date) are recorded once, in [QA_PROGRESS.md](./QA_PROGRESS.md), so
> this file stays the stable specification.
>
> **Pri** P0 (blocker) → P3 (nice to have) · **Sev** C/H/M/L · **Reg** regression required ·
> **Auto** automation candidate (U=unit, I=integration, E=e2e, M=manual-only).
>
> Cases marked 🔴 are **expected to FAIL** on the current build — each corresponds to a
> documented issue in [Known_Issues.md](./Known_Issues.md).

**Test accounts** (create in the dev project): `owner-a`, `admin-a`, `viewer-a` (workspace A);
`owner-b` (workspace B); `multi` = owner of B **and** collaborator in A; `po` = platform admin.

---

## 1. AUTH — Authentication (`pages/Auth.tsx`, `useAuth`, GoTrue)

| ID | Feature | Pri | Sev | Preconditions | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|---|:-:|:-:|
| AUTH-001 | Sign-up happy path | P0 | C | no account for the email | fill name/email/password/confirm → Create account | account created; profile + tenant + owner membership + Free subscription all exist | ✔ | I |
| AUTH-002 | Sign-up trigger atomicity | P0 | C | — | after AUTH-001 query `profiles`, `tenants`, `tenant_members`, `subscriptions` | exactly one row in each, correctly linked | ✔ | I |
| AUTH-003 | Password < 8 chars | P0 | M | — | enter a 7-char password | inline error "Password must be at least 8 characters"; no request sent | ✔ | E |
| AUTH-004 | Password mismatch | P0 | M | — | confirm ≠ password | error "Passwords do not match" | ✔ | E |
| AUTH-005 | Duplicate email | P0 | M | account exists | sign up again | friendly "An account with this email already exists" | ✔ | E |
| AUTH-006 | Invalid email format | P1 | L | — | `not-an-email` | "Enter a valid email" | | E |
| AUTH-007 | Email 255-char boundary | P2 | L | — | 256-char email | rejected | | U |
| AUTH-008 | Password 72-char boundary | P2 | L | — | 73-char password | rejected | | U |
| AUTH-009 | Sign-in happy path | P0 | C | confirmed account | email + password → Sign in | redirected to `/app` (or `location.state.from`) | ✔ | E |
| AUTH-010 | Wrong password | P0 | H | — | bad password | "The email or password is incorrect"; no session | ✔ | E |
| AUTH-011 | Unconfirmed email sign-in | P1 | M | confirmation enabled | sign in | "Please confirm your email address" | ✔ | E |
| AUTH-012 | Saved-profile chip sign-in | P1 | L | prior sign-in on this device | click chip → enter password | signs in with the chip's email | | E |
| AUTH-013 | Remove a saved profile | P2 | L | ≥1 chip | click ✕ | chip removed from UI and from `valar.profiles` | | E |
| AUTH-014 | 🔴 "Remember this profile" controls session lifetime | P1 | M | — | sign up with the box **unchecked**, close browser, reopen | session should not persist | ✔ | E |
| AUTH-015 | Password reset request | P0 | H | SMTP configured | Forgot password → email → send | success toast; reset mail delivered | ✔ | M |
| AUTH-016 | Reset link sets a new password | P0 | H | valid reset link | open `/reset-password`, set a new password | password changed; old one rejected | ✔ | E |
| AUTH-017 | Reset link reuse | P1 | H | link already used | open it again | rejected | ✔ | M |
| AUTH-018 | Google OAuth | P1 | H | provider configured | Continue with Google | session established; signup trigger fires exactly once | ✔ | M |
| AUTH-019 | Sign out | P0 | M | signed in | click Sign out | session cleared; `/app` redirects to `/auth` | ✔ | E |
| AUTH-020 | Sign-out leaves no residual auth | P1 | M | signed in | sign out, inspect storage | no Supabase session token remains | ✔ | E |
| AUTH-021 | Rate limiting on sign-in | P0 | H | — | 20 wrong passwords in 60 s | throttled/locked, not unlimited | ✔ | I |
| AUTH-022 | Session refresh | P1 | M | signed in > 1 h | leave the tab open, then act | token silently refreshed; no error | | M |
| AUTH-023 | Expired session handling | P1 | M | revoke the session server-side | trigger a query | graceful redirect to `/auth`, not a raw error toast | ✔ | M |

## 2. LOCK — App-lock PIN (`ProtectedRoute`, `lib/appLock.ts`)

> **Four cases were rewritten on 2026-08-12, against Stage 5.4 rather than against the 2026-08-04
> audit that seeded them.** 5.4 turned the PIN from a wall into an offer, replaced instant
> re-locking with a grace clock, and added the recovery path LOCK-010 was filed for. The old
> wording is kept in each row so a reader can see what changed and why the register is not simply
> disagreeing with itself. Executable form: `e2e/lock-suite.spec.ts` and
> `src/components/ProtectedRoute.storage.test.tsx`.

| ID | Feature | Pri | Sev | Preconditions | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|---|:-:|:-:|
| LOCK-001 | PIN creation is **offered**, not forced *(was: forced on first login — 5.4)* | P0 | H | no PIN on device | sign in, then try a deep URL such as `/app/transactions` | PinSetup shown with a working **Not now**; the offer is a route gate, so a deeper URL does not get round it | ✔ | E |
| LOCK-002 | PIN is not re-requested on later logins | P0 | H | PIN set | sign out, sign in | no PinSetup; `finroot.pinlen.<uid>` unchanged (regression guard for the fixed re-prompt bug) | ✔ | E |
| LOCK-003 | 4-digit and 6-digit PINs both work | P1 | M | — | set each length | length persisted in `finroot.pinlen.<uid>`, and the lock screen draws that many boxes | | E |
| LOCK-004 | Correct PIN unlocks | P0 | H | locked | enter the PIN | app renders | ✔ | E |
| LOCK-005 | Wrong PIN is rejected | P0 | H | locked | wrong PIN ×3 | stays locked; no lockout bypass | ✔ | E |
| LOCK-006 | New tab re-locks, and so does a reload | P1 | M | unlocked in tab 1 | open `/app` in tab 2; separately, press Lock and reload | both ask for the PIN — `unlocked` is per tab, and a restored session is not a sign-in | ✔ | E |
| LOCK-007 | Hiding the tab starts a **grace clock** *(was: tab hide re-locks — 5.4)* | P1 | M | unlocked, grace at its 5-minute default | hide and return at once; then hide, rewind `finroot.lock.hiddenAt.<uid>` an hour, and return | the quick switch is forgiven; the long absence locks. With grace `0` it locks on the way out | ✔ | E |
| LOCK-008 | 12-hour rule → password mode | P1 | H | `pwdauth` older than 12 h | lock, return | LockScreen shows **password** mode, with no PIN boxes | ✔ | I |
| LOCK-009 | Lock button keeps the session | P1 | M | unlocked | click Lock | locked, and the `sb-*-auth-token` in localStorage is byte-identical — locking is not signing out | | E |
| LOCK-010 | PIN recovery path exists *(the 🔴 is spent — shipped in 5.4)* | P0 | H | PIN forgotten | Forgot your PIN? → account password → set a new one | the reset screen appears **and** `finroot.pin.<uid>` is gone, so the old PIN is cleared rather than stepped around | ✔ | E |
| LOCK-011 | PIN hash is not trivially reversible | P1 | M | 6-digit PIN set | read `finroot.pin.<uid>`, take `salt` and `iter` from the record, and time a sample of an offline 10⁶ PBKDF2 search | ≫ 1 day extrapolated on one core (was 30 s). ⚠️ Measure a sample and extrapolate — finishing is the thing being claimed infeasible. This is a **cost** check, not a safety one: 4–6 digits stays GPU-breakable by design (BUG-091), so a slower result is the pass, not an unbreakable one | ✔ | U |
| LOCK-012 | Storage failure fails closed | P1 | M | block `localStorage`; then, separately, block only `sessionStorage` | load `/app`, and decline the PIN offer it falls back to | neither store may grant access: no route through to the app in either case | ✔ | U |

## 3. TEN — Tenancy & isolation

| ID | Feature | Pri | Sev | Preconditions | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|---|:-:|:-:|
| TEN-001 | Cross-workspace read is blocked | P0 | C | A and B have data | as `owner-a`, `GET` each of the 15 tenant tables | only workspace A rows | ✔ | I |
| TEN-002 | Cross-workspace write is blocked | P0 | C | — | as `owner-a`, insert with `tenant_id = B` | RLS denies | ✔ | I |
| TEN-003 | 🔴 Collaborator writes land in the shown workspace | P0 | C | `multi` is a collaborator in A | as `multi`, with A selected, add an expense | the row's `tenant_id` = **A** | ✔ | I |
| TEN-004 | 🔴 Reads are scoped to the shown workspace | P0 | C | `multi` has data in both | as `multi`, open Expenses with A selected | only A's transactions listed | ✔ | I |
| TEN-005 | 🔴 Dashboard totals are single-workspace | P0 | C | as TEN-004 | open the dashboard | totals match workspace A only | ✔ | E |
| TEN-006 | 🔴 A workspace switcher exists | P0 | H | `multi` | look for a switcher in the UI | present and functional | ✔ | E |
| TEN-007 | PO does not over-fetch memberships | P1 | H | `po` is signed into `/app` | load the app | sees only their own memberships (guard for the fixed RLS-bypass bug) | ✔ | I |
| TEN-008 | Deleting a workspace cascades | P1 | H | workspace with data | `po_delete_tenant` | all finance rows for that tenant are gone | ✔ | I |
| TEN-009 | 🔴 Direct tenant insert is blocked | P1 | M | any user | `POST /rest/v1/tenants` | denied | ✔ | I |
| TEN-010 | 🔴 Suspension actually restricts access | P0 | H | workspace suspended by PO | as its owner, read and write | access is blocked or read-only | ✔ | I |

## 4. AUTHZ — Roles & permissions

| ID | Feature | Pri | Sev | Preconditions | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|---|:-:|:-:|
| AUTHZ-001 | Viewer cannot insert | P0 | C | `viewer-a` | insert into each of the 15 tables | all denied | ✔ | I |
| AUTHZ-002 | Viewer cannot update or delete | P0 | C | `viewer-a` | update/delete an existing row | denied | ✔ | I |
| AUTHZ-003 | Viewer can read | P0 | H | `viewer-a` | select from each table | rows returned | ✔ | I |
| AUTHZ-004 | Admin can CRUD | P0 | H | `admin-a` | full CRUD | allowed | ✔ | I |
| AUTHZ-005 | Admin cannot manage members | P0 | H | `admin-a` | call `invite_member` | `Not authorized` | ✔ | I |
| AUTHZ-006 | Owner can manage members | P0 | H | `owner-a` | invite / change role / revoke | succeeds and is audited | ✔ | I |
| AUTHZ-007 | Owner cannot be demoted | P0 | H | `owner-a` | `update_member_role` on the owner | 0 rows affected | ✔ | I |
| AUTHZ-008 | Owner cannot be revoked | P0 | H | — | `revoke_member` on the owner | 0 rows affected | ✔ | I |
| AUTHZ-009 | `invite_member` rejects `owner` | P0 | H | — | `p_role='owner'` | `Role must be admin or viewer` | ✔ | I |
| AUTHZ-010 | Member allow-list narrows menus | P0 | H | member menus = `{dashboard}` | `get_effective_menus` | `["dashboard"]` | ✔ | I |
| AUTHZ-011 | Tenant deny-list removes a menu | P0 | H | tenant deny `{investments}` | as a collaborator | `investments` absent | ✔ | I |
| AUTHZ-012 | Owner bypasses overrides but not the plan | P0 | H | tenant deny set, Free plan | as owner | gets the Free menu set, not the deny-filtered set | ✔ | I |
| AUTHZ-013 | Non-member gets an empty menu list | P0 | H | `owner-b` | `get_effective_menus(A)` | `[]` | ✔ | I |
| AUTHZ-014 | Denied menu also blocks the data (enforced menus) | P0 | H | member denied `investments` | `GET /rest/v1/investments` | **0 rows** — `investments` is RLS-enforced (AZ-001). Assert on row count, not HTTP status: an RLS-filtered SELECT returns 200 with `[]`. | ✅ 2026-08-05 | I |
| AUTHZ-014b | Denied menu does NOT block the data (navigation-only menus) | P1 | M | member denied `expenses` | `GET /rest/v1/transactions` | rows still returned — navigation-only by design (AZ-001). Pins the other half of the contract so it cannot be "fixed" by accident. | ✅ 2026-08-05 | I |
| AUTHZ-015 | MenuGuard blocks a denied route | P0 | M | as AUTHZ-010 | navigate to `/app/investments` | redirected to the fallback | ✔ | E |
| AUTHZ-016 | Zero menus → clear empty state | P1 | M | member allow `[]` | open `/app` | "No modules assigned" screen, no redirect loop | ✔ | E |
| AUTHZ-017 | 🔴 AccessContext fails closed | P0 | H | force `get_effective_menus` to error | load the app | restricted, not full access | ✔ | I |
| AUTHZ-018 | 🔴 `/app/export` is gated | P0 | H | `viewer-a` | navigate to `/app/export` | blocked | ✔ | E |
| AUTHZ-019 | 🔴 `/app/billing` respects the plan | P1 | M | `billing` removed from the plan | navigate to `/app/billing` | blocked | ✔ | E |
| AUTHZ-020 | Non-PO is blocked from all `po_*` RPCs | P0 | C | `owner-a` | call each of the 20 PO RPCs | `Not authorized` for every one | ✔ | I |
| AUTHZ-021 | Non-PO cannot become a PO | P0 | C | `owner-a` | insert/update `platform_admins` | denied | ✔ | I |
| AUTHZ-022 | `/po/*` redirects non-PO | P0 | H | `owner-a` | navigate to `/po` | redirected to `/po/login` | ✔ | E |
| AUTHZ-023 | `ACCESS_MENUS` matches `all_feature_menus()` | P1 | M | — | compare both lists | identical | ✔ | I |

## 5. SEC — Security negative suite

All 20 cases are specified in [Testing_Master_Plan.md](./Testing_Master_Plan.md) §6 as
**SEC-T01 … SEC-T20**. Every one is **P0**, **Sev C/H**, regression-required and an
integration-automation candidate. SEC-T01–T05, T14, T15, T16, T18, T19 and T20 are 🔴 expected
to fail today.

## 6. FIN — Money & calculations

| ID | Feature | Pri | Sev | Preconditions | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|---|:-:|:-:|
| FIN-001 | INR formatting | P0 | H | — | format 150000 | `₹1,50,000.00` (lakh grouping) | ✔ | U |
| FIN-002 | Formatting boundaries | P1 | M | — | 0, 0.01, 999999999999.99, negatives | correct, no overflow, no `NaN` | ✔ | U |
| FIN-003 | Amount precision | P0 | C | — | store 1234.567 | stored as `1234.57` (numeric 14,2); no float drift | ✔ | I |
| FIN-004 | Amount max boundary | P1 | M | — | 14-digit amount | accepted; 15 digits rejected cleanly | ✔ | I |
| FIN-005 | Negative amount | P1 | M | — | enter −100 | rejected or explicitly handled — not silently stored | ✔ | E |
| FIN-006 | Zero amount | P1 | L | — | enter 0 | rejected with a clear message | | E |
| FIN-007 | MoneyInput live grouping | P1 | M | — | type `150000` | displays `1,50,000`; emits `150000` | ✔ | U |
| FIN-008 | FX conversion | P1 | H | USD stream, rate 83 | check the INR total | amount × rate, rounded to 2dp | ✔ | U |
| FIN-009 | Savings rate | P1 | M | income 100k, expense 60k | dashboard | 40 % | ✔ | U |
| FIN-010 | Net worth | P0 | H | assets 500k, liabilities 200k | Net Worth page | 300k | ✔ | E |
| FIN-011 | 🔴 Net-worth history is real | P0 | H | 6 months of data | open the trend chart | values derived from real snapshots, not a seed | ✔ | I |
| FIN-012 | Live account balance | P0 | H | opening 10k, +5k income, −3k expense on that account | Accounts page | 12k | ✔ | E |
| FIN-013 | 🔴 Account tag survives a `[` in the note | P1 | M | — | note beginning with `[` | balance still computed correctly | ✔ | U |
| FIN-014 | 🔴 `budgets.spent` follows expenses | P0 | H | budget 10k, log a 3k expense in that bucket | Budget page | shows 3k spent | ✔ | E |
| FIN-015 | Budget utilisation tones | P1 | L | 84 % / 86 % / 105 % | Budget page | green / amber / red | | U |
| FIN-016 | Goal contribution | P0 | M | goal 100k/0 | contribute 25k | current = 25k, 25 % | ✔ | E |
| FIN-017 | Goal auto-completes | P1 | M | goal at target | contribute the remainder | status → completed | ✔ | E |
| FIN-018 | 🔴 Concurrent goal contributions | P1 | M | two browsers | contribute 10k simultaneously | final = +20k (no lost update) | ✔ | M |
| FIN-019 | 🔴 Transfer between accounts | P0 | H | two accounts | move 10k between them | income and spending totals are unaffected | ✔ | E |
| FIN-020 | Smart Split reconciliation | P1 | M | source 528, buckets 128 + 400 | Save | one 128 expense posted; save blocked when unbalanced | ✔ | E |
| FIN-021 | Smart Split percent / shares modes | P1 | M | — | switch modes | values convert, split preserved | | U |

## 7. TXN — Transactions

| ID | Feature | Pri | Sev | Preconditions | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|---|:-:|:-:|
| TXN-001 | Create expense | P0 | C | signed in | full dialog → Save | row created with correct type/amount/category/date | ✔ | E |
| TXN-002 | Create income | P0 | C | — | as above | correct | ✔ | E |
| TXN-003 | Edit a transaction | P0 | H | existing row | edit amount and note | persisted; payment mode and account recovered correctly | ✔ | E |
| TXN-004 | Delete a transaction | P0 | H | existing row | delete | removed; totals recompute | ✔ | E |
| TXN-005 | Payment-mode encoding round-trips | P1 | M | — | save with UPI + account, reopen | both recovered | ✔ | U |
| TXN-006 | Category picker: custom head category | P1 | M | custom category created | pick it in the drawer | selectable, saved | ✔ | E |
| TXN-007 | Custom subcategory | P1 | M | — | add one, use it | saved (⚠ localStorage-only today) | ✔ | E |
| TXN-008 | Quick add (Ctrl+N) | P1 | M | — | Ctrl+N → save | transaction created | | E |
| TXN-009 | 🔴 Ctrl+N does not hijack the browser | P2 | L | — | press Ctrl+N | either the app opens quick-add **or** the browser opens a window — documented and non-surprising | | M |
| TXN-010 | Ledger grouping and min/max | P1 | L | several same-day rows | Expenses ledger | grouped by day; min/max shown when > 1 | | E |
| TXN-011 | Ledger day-group collapse | P2 | L | — | click a day header | collapses/expands | | E |
| TXN-012 | Ledger List/Donut/Bar toggle | P2 | L | — | switch views | all three render the same totals | | E |
| TXN-013 | Long description | P2 | L | — | 5 000-char note | stored and rendered without breaking the layout | | E |
| TXN-014 | Unicode / emoji in a note | P2 | L | — | emoji + Tamil text | round-trips intact | | U |
| TXN-015 | Script tag in a note | P1 | H | — | `<script>alert(1)</script>` | rendered as text; no execution | ✔ | E |

## 8. REC — Recurring & reminders

| ID | Feature | Pri | Sev | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|:-:|:-:|
| REC-001 | Create recurring income/expense | P0 | H | create both types | rows created, listed under the right tab | ✔ | E |
| REC-002 | Mark received/paid | P0 | H | mark an item | transaction created **and** `next_due_date` advanced | ✔ | I |
| REC-003 | 🔴 Mark is atomic | P0 | H | fail the second statement | no orphan transaction, or a retry does not double-post | ✔ | I |
| REC-004 | One-time item deactivates | P1 | M | mark a one-time item | `is_active = false` | ✔ | I |
| REC-005 | 🔴 31st-of-month rollover | P1 | M | monthly item due 31 Jan, mark it | next due = 28/29 Feb, not 3 Mar | ✔ | U |
| REC-006 | Weekly / yearly bumps | P1 | M | mark each | +7 d / +1 y | ✔ | U |
| REC-007 | 🔴 Reminder settings persist across browsers | P1 | H | set a reminder, open in another browser | setting present | ✔ | E |
| REC-008 | Reminder fires (bell state) | P1 | M | days_before reached | card shows the amber firing state | | E |
| REC-009 | Dashboard merges reminders + recurring | P1 | M | both exist | both appear in ActionableReminders | ✔ | E |
| REC-010 | Bell 3-way filter | P2 | L | — | All / This week / Today | filters correctly | | E |

## 9. BILL — Billing & subscriptions

| ID | Feature | Pri | Sev | Preconditions | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|---|:-:|:-:|
| BILL-001 | New tenant gets Free, active | P0 | C | fresh signup | inspect `subscriptions` | Free / active / manual | ✔ | I |
| BILL-002 | Free plan menu ceiling | P0 | H | Free tenant | `get_effective_menus` | 8 Free menus | ✔ | I |
| BILL-003 | Pro plan menu ceiling | P0 | H | Pro assigned by PO | as above | all 14 | ✔ | I |
| BILL-004 | Expiry falls back to Free | P0 | H | `current_period_end` in the past | as above | Free's 8 | ✔ | I |
| BILL-005 | Expired banner shows | P1 | M | as BILL-004 | open `/app` | banner with a Renew link | ✔ | E |
| BILL-006 | `upgradeable_plans` filter | P1 | M | — | call it | only active, paid, Paddle-mapped plans | ✔ | I |
| BILL-007 | Paddle checkout opens | P0 | H | sandbox token set | click Upgrade | Paddle overlay with the right price | ✔ | M |
| BILL-008 | Webhook upgrades in place | P0 | C | complete a sandbox purchase | inspect `subscriptions` | same row, now Pro/paddle; still one row per tenant | ✔ | M |
| BILL-009 | Webhook rejects a bad signature | P0 | C | — | POST with a wrong signature | 401 | ✔ | I |
| BILL-010 | 🔴 Webhook rejects a replay | P0 | H | capture a valid event | POST it twice | second rejected | ✔ | I |
| BILL-011 | Cancel at period end | P1 | H | active Paddle sub | Cancel | `scheduled_change` set; access continues to period end | ✔ | M |
| BILL-012 | Resume | P1 | M | cancelled | Resume | schedule cleared | ✔ | M |
| BILL-013 | Invoice PDF | P2 | L | paid transaction | request the invoice | URL returned | | M |
| BILL-014 | 🔴 Owner cannot self-upgrade | P0 | C | `owner-a` | PATCH `subscriptions` to Pro | denied | ✔ | I |
| BILL-015 | Coupons are not offered without a gateway | P1 | M | no purchasable plan | load the landing and `/po/coupons` | no promo banner anywhere; the PO editor shows the "no payment gateway" notice instead of the create form | ✅ 2026-08-05 | E |
| BILL-015b | ~~Coupon applies a discount~~ | P1 | H | active coupon | use the code at checkout | discount applied | **deferred with the gateway** — reinstate together with 2.11's Paddle branch | M |
| BILL-018 | No gateway ⇒ Billing still offers a route to upgrade | P1 | H | tenant on Roots, no purchasable plan | open `/app/billing` | the plans catalogue renders with a "Contact us" mailto per plan, and the current plan is labelled, not linked (BUG-082) | ✅ 2026-08-05 | E |
| BILL-016 | 🔴 Landing price = charged price | P0 | H | — | compare the landing card with the Paddle charge | identical name and amount | ✔ | M |
| BILL-017 | 🔴 `billing-api` is tenant-scoped | P1 | H | `multi` owns two workspaces | open Billing | the selected workspace's subscription is shown | ✔ | I |
| BILL-018 | PO manual plan assignment | P1 | M | `po` | assign Pro to a tenant | applied and audited | ✔ | I |

## 10. IMP / EXP — Import & export

| ID | Feature | Pri | Sev | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|:-:|:-:|
| IMP-001 | Import each of the 5 CSV templates | P0 | H | expenses, income, goals, budgets, assets | rows created correctly | ✔ | E |
| IMP-002 | 🔴 Re-importing the same file | P0 | H | import twice | no duplicates (or an explicit warning) | ✔ | E |
| IMP-003 | Malformed row | P1 | M | missing required column | clear per-row error; valid rows still import | ✔ | E |
| IMP-004 | CSV edge cases | P1 | M | quoted commas, BOM, CRLF, extra columns | parsed correctly | ✔ | U |
| IMP-005 | XLSX import | P1 | M | .xlsx file | parsed (or a clear "use CSV" message if xlsx is dropped) | ✔ | E |
| IMP-006 | Malicious XLSX | P1 | H | prototype-pollution payload | rejected/sandboxed; no pollution | ✔ | U |
| IMP-007 | Large import | P2 | M | 10 000 rows | completes or streams with progress; no tab freeze | | M |
| IMP-008 | PDF statement parse | P2 | M | real bank PDF | rows extracted | | M |
| IMP-009 | Corrupt PDF | P2 | L | truncated file | clean error, no crash | | E |
| EXP-001 | Export CSV per dataset | P1 | M | — | file downloads with correct headers and values | ✔ | E |
| EXP-002 | Export XLSX | P2 | L | — | opens in Excel | | M |
| EXP-003 | 🔴 Viewer cannot export | P0 | H | `viewer-a` | blocked | ✔ | E |
| EXP-004 | Large export | P2 | M | 20 000 rows | completes without freezing | | M |

## 11. INV — Investments

| ID | Feature | Pri | Sev | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|:-:|:-:|
| INV-001 | Add a holding per asset class | P0 | H | all 9 classes | saved with class-specific fields | ✔ | E |
| INV-002 | Live price — NSE stock | P1 | H | ticker `NSE:RELIANCE` | live price fetched | ✔ | I |
| INV-003 | Live price — mutual fund | P1 | H | scheme `120503` | NAV fetched | ✔ | I |
| INV-004 | 🔴 Missing ticker is signalled | P1 | M | no ticker | UI states the value is not live | ✔ | E |
| INV-005 | 🔴 Provider outage | P1 | M | block `live-price` | stored value shown with a clear indicator; no crash, no random drift | ✔ | E |
| INV-006 | 🔴 Portfolio list default filter | P1 | H | holding saved last month | Portfolio list | holding visible by default | ✔ | E |
| INV-007 | 🔴 Polling volume | P1 | M | 30 holdings, 5 min | ≤ a documented request budget (batched/cached) | ✔ | M |
| INV-008 | Demat ledger types | P1 | M | fund_in/out, buy, sell, dividend | balance moves in the right direction | ✔ | I |
| INV-009 | Demat amount must be > 0 | P1 | M | amount 0 or −1 | rejected | ✔ | I |
| INV-010 | Demat opening balance | P2 | L | set one | no bank transaction created | | E |
| INV-011 | Portfolio donuts | P2 | L | several classes | slices, legend and centre total agree | | E |

## 12. TRIP / INS / NW — Trips, insurance, net worth

| ID | Feature | Pri | Sev | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|:-:|:-:|
| TRIP-001 | Create solo/friends/family trips | P0 | H | each kind | created | ✔ | E |
| TRIP-002 | 🔴 Create an "Other" trip | P0 | H | kind = other | created (currently a constraint violation) | ✔ | E |
| TRIP-003 | Trip expenses and allocation | P1 | M | add expenses | totals and per-companion split correct | ✔ | E |
| TRIP-004 | Archive a trip | P2 | L | archive | status archived, `archived_at` set | | E |
| INS-001 | Add a policy | P1 | M | all categories | saved | ✔ | E |
| INS-002 | Upload a document | P1 | M | 2 MB PDF | stored and retrievable | ✔ | E |
| INS-003 | 🔴 Large document | P1 | M | 20 MB PDF | rejected with a size message, not a silent failure | ✔ | E |
| INS-004 | 🔴 List does not download every document | P1 | M | 3 policies with documents | list payload excludes the base64 blobs | ✔ | M |
| NW-001 | Derived assets | P0 | H | accounts + investments exist | appear as read-only derived rows | ✔ | E |
| NW-002 | Manual entries | P1 | M | add asset and liability | included in totals | ✔ | E |
| NW-003 | 🔴 Trend range filter | P1 | H | 3M/6M/All | operates on real data | ✔ | E |

## 13. PO — Product Owner console

| ID | Feature | Pri | Sev | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|:-:|:-:|
| PO-001 | Password login | P0 | C | valid PO password | reaches `/po` | ✔ | E |
| PO-002 | 16-digit secret login | P0 | C | valid secret | reaches `/po` | ✔ | E |
| PO-003 | Wrong secret | P0 | C | bad secret | rejected, no session | ✔ | E |
| PO-004 | 🔴 Secret brute force is throttled | P0 | H | 100 attempts | throttled/locked | ✔ | I |
| PO-005 | 🔴 Identifier enumeration | P0 | H | PO vs non-PO identifier | identical response | ✔ | I |
| PO-006 | 🔴 PO logins are audited | P0 | H | sign in and fail to sign in | both appear in `audit_log` | ✔ | I |
| PO-007 | Non-PO signing in at `/po/login` | P0 | H | tenant credentials | "not a Product Owner", signed out | ✔ | E |
| PO-008 | Dashboard aggregates | P1 | M | data exists | counts and sums correct; **no raw finance rows** | ✔ | I |
| PO-009 | Tenant list | P1 | M | — | owner email, member count, plan, status | ✔ | E |
| PO-010 | Create a tenant + modules | P1 | M | 2-step wizard | tenant created with the chosen module set (atomically) | ✔ | I |
| PO-011 | Suspend / reactivate | P1 | H | — | status changes; all members notified | ✔ | I |
| PO-012 | Delete a tenant | P1 | H | — | confirmation states the scope; data cascades | ✔ | I |
| PO-013 | Assign a plan | P1 | M | — | applied and audited | ✔ | I |
| PO-014 | Edit plan menus | P1 | M | toggle menus | `plan_menus` reflects it immediately | ✔ | I |
| PO-015 | Edit the pricing page | P1 | M | — | landing updates for anonymous visitors | ✔ | E |
| PO-016 | Edit branding | P1 | M | name + logo | reflected in sidebar, auth, landing, tab title, favicon | ✔ | E |
| PO-017 | Branding logo size | P2 | M | 5 MB image | resized/rejected, not stored raw in jsonb | | E |
| PO-018 | Coupons CRUD | P2 | M | create/deactivate/delete | banner reflects it | | E |
| PO-019 | Audit log viewer | P1 | H | perform actions | all appear with actor and metadata | ✔ | E |
| PO-020 | Rotate the secret | P1 | H | set a new secret | old one rejected, new one works | ✔ | I |
| PO-021 | Set custom identifiers | P1 | M | `po_user_id` / `po_number_id` | usable at login; format rules enforced | ✔ | I |
| PO-022 | 🔴 PoSecurity page has no type errors | P1 | M | `tsc` | clean | ✔ | U |
| PO-023 | PO console on mobile | P2 | M | 375 px | usable (currently a fixed 240 px sidebar) | | E |

## 14. NOTIF / WS — Notifications & workspace management

| ID | Feature | Pri | Sev | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|:-:|:-:|
| NOTIF-001 | Invite creates a notification | P1 | M | invite a member | invitee sees it | ✔ | I |
| NOTIF-002 | Suspension notifies all members | P1 | M | PO suspends | every active member notified | ✔ | I |
| NOTIF-003 | Bell badge count | P1 | L | 3 unread | badge shows 3 | | E |
| NOTIF-004 | Mark all read | P1 | L | open Notifications | badge → 0 | ✔ | E |
| NOTIF-005 | 🔴 Notifications cannot be forged | P0 | H | any user calls `create_notification` | denied | ✔ | I |
| WS-001 | Invite an existing user | P0 | H | target has an account | added as active with the chosen menus | ✔ | E |
| WS-002 | 🔴 Invite a non-existent user | P0 | H | unregistered email | an invite is sent / a pending state is created | ✔ | E |
| WS-003 | Change a member role | P1 | M | admin → viewer | applied; their write access is revoked | ✔ | I |
| WS-004 | Per-member module matrix | P1 | H | toggle modules | `get_effective_menus` matches for that member | ✔ | I |
| WS-005 | Grant all / revoke all | P2 | L | click each | all 14 on / off | | E |
| WS-006 | Remove a member | P1 | M | remove with confirm | membership gone; their rows survive | ✔ | I |

## 15. UI / A11Y / RESP — Interface

| ID | Feature | Pri | Sev | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|:-:|:-:|
| UI-T01 | 🔴 No horizontal overflow, all breakpoints | P0 | H | 320/375/390/414/768/1024/1440/1920 **and post-load resize** | `scrollWidth − clientWidth ≤ 2` | ✔ | E |
| UI-T02 | 🔴 Contrast meets WCAG AA | P1 | H | axe `color-contrast` on every route, in **both reachable themes** — set `finroot.theme` to `obsidian` / `light`; the theme is NOT `prefers-color-scheme`, so `emulateMedia` scans one theme twice | no contrast violations | ✔ | E |
| UI-T03 | 🔴 `<main>` landmark + skip link | P1 | M | every route | exactly one `<main>`; a skip link whose href resolves and which actually moves focus on Enter. Collect every route before failing — the first draft stopped at `/auth` and under-reported by four routes | ✔ | E |
| UI-T04 | 🔴 Tap targets clear **24 px** (WCAG 2.5.8 AA) *(was: ≥ 44 px — see note)* | P1 | M | mobile viewport | every interactive element has a 24×24 **effective** target, measured by hit-testing rather than by rect: Stage 4.7 enlarged several controls with a transparent `::before` that `getBoundingClientRect` cannot see. Overlapping neighbours count against it. 44 px is WCAG 2.5.5 **AAA** and was never what the product committed to — report that reading, do not fail on it | ✔ | E |
| UI-T05 | 🔴 Hero `h1` reads correctly | P1 | M | read the accessible name | "The calm command center for your money." | ✔ | E |
| UI-T06 | 🔴 Hero renders without motion | P1 | M | `prefers-reduced-motion`, JS-throttled | headline visible | ✔ | E |
| UI-T07 | Keyboard-only navigation | P1 | H | Tab through every page | all controls reachable, focus visible, no traps | ✔ | M |
| UI-T08 | Screen reader pass | P1 | H | axe restricted to the announceability rules (names, valid ARIA, landmarks, heading order, tables) on every route — `e2e/ui-a11y.spec.ts`. **Residual, still manual:** whether a name reads *well*, and real AT quirks | every control has an accessible name; ARIA valid; one `main`; headings increase by one; no focusable content inside `aria-hidden` | ✔ | E + M |
| UI-T09 | 🔴 No hardcoded date in the top bar | P0 | H | open any app page | the real current period | ✔ | E |
| UI-T10 | 🔴 Error boundary catches a render throw | P0 | H | force a throw in a widget | fallback UI + report, not a blank page | ✔ | E |
| UI-T11 | 🔴 Friendly error messages | P0 | H | trigger a constraint violation and an RLS denial | human-readable copy, no SQL | ✔ | E |
| UI-T12 | Light and dark themes | P1 | M | toggle on every page | no unreadable or invisible elements | ✔ | E |
| UI-T13 | Empty states | P1 | M | fresh account — ⚠️ the shared fixture is not one, so this is checked as the weaker property it can prove: no route may render a region that is neither content nor a designed empty state | every page has a designed empty state with a CTA; nothing blank | ✔ | E |
| UI-T14 | Loading states | P1 | M | throttle to Slow 3G | skeletons, not zeros-then-jump | ✔ | E |
| UI-T15 | Offline | P1 | M | go offline | shell loads; a clear offline message; no silent write loss | ✔ | E |
| UI-T16 | Cross-browser | P1 | M | Chromium/Firefox/WebKit — `e2e/cross-browser.spec.ts` drives the engines directly rather than adding permanent projects that would triple every run | title, `h1`, landmark and skip-link counts identical; no engine overflows. An engine that will not launch is reported as unavailable, never counted as agreement | ✔ | E |
| UI-T17 | PWA install + standalone | P2 | M | ⚠️ the **production build** — the service worker registers only under `import.meta.env.PROD`. `npm run build`, then `npx playwright test --config e2e/pwa.config.ts`. **Residual, still manual:** installing on a physical Android and iOS device and checking the home-screen icon | manifest is installable; every declared icon exists at the size it claims (checked against the real PNG header, not the manifest's word); the worker activates AND controls the page; the shell loads with the network off; `start_url` is inside `scope` and renders in standalone | | E + M |
| UI-T18 | 🔴 Duplicate realtime toasts | P2 | L | add a transaction | exactly one toast | ✔ | E |
| UI-T19 | 🔴 Preloader unmounts | P2 | L | landing fully loaded | overlay removed from the DOM | ✔ | E |
| UI-T20 | Page container widths | P2 | L | navigate across pages | no width jump | | E |

## 16. OPS — Build, deploy, data

| ID | Feature | Pri | Sev | Steps | Expected | Reg | Auto |
|---|---|:-:|:-:|---|---|:-:|:-:|
| OPS-001 | 🔴 `tsc` is clean | P0 | H | `npx tsc -p tsconfig.app.json --noEmit` | exit 0 | ✔ | U |
| OPS-002 | 🔴 ESLint is clean | P1 | M | `npx eslint .` | exit 0 | ✔ | U |
| OPS-003 | Build succeeds | P0 | H | `vite build` | exit 0 | ✔ | U |
| OPS-004 | 🔴 Bundle budget | P1 | M | measure the main chunk | ≤ 250 kB gzip | ✔ | U |
| OPS-005 | 🔴 `npm audit --omit=dev` | P0 | H | run it | no High with a fix available | ✔ | U |
| OPS-006 | Migrations from scratch | P0 | C | empty DB → all 32 | applies cleanly | ✔ | I |
| OPS-007 | Migrations against seeded data | P0 | C | DB with data | applies without loss | ✔ | I |
| OPS-008 | 🔴 Backup exists and restores | P0 | C | restore into a scratch project | row counts match | ✔ | M |
| OPS-009 | Clean install | P1 | M | fresh clone → install → build → run | works on Windows and Linux | | M |
| OPS-010 | Missing `RESEND_API_KEY` | P1 | M | unset it | `send-email` no-ops; app unaffected | ✔ | I |
| OPS-011 | Missing Paddle token | P1 | M | unset it | Billing degrades with a message; no crash | ✔ | E |
| OPS-012 | 🔴 Types match the schema | P0 | H | regenerate and diff | no drift | ✔ | U |
| OPS-013 | 🔴 `config.toml` does not target live | P0 | H | inspect it | no live `project_id`, or an explicit ref is required | ✔ | U |
| OPS-014 | Volume: 50 000 transactions | P1 | H | seed and load the dashboard | TTI ≤ 3 s | ✔ | M |
| OPS-015 | Scale: 1 000 tenants | P2 | M | seed, load the PO console | `po_list_tenants` ≤ 1 s | | M |
| OPS-016 | Load: 100 concurrent users | P2 | M | k6 | error rate < 1 %, p95 < 1 s | | M |
| OPS-017 | Chaos: DB unavailable mid-write | P2 | M | kill the connection | clear error; no partial state | | M |
| OPS-018 | Memory: 30 min soak | P2 | M | navigate with live prices on | heap stable | | M |

---

## Summary

| Section | Cases |
|---|---|
| AUTH | 23 |
| LOCK | 12 |
| TEN | 10 |
| AUTHZ | 23 |
| SEC (in the master plan) | 20 |
| FIN | 21 |
| TXN | 15 |
| REC | 10 |
| BILL | 18 |
| IMP/EXP | 13 |
| INV | 11 |
| TRIP/INS/NW | 11 |
| PO | 23 |
| NOTIF/WS | 11 |
| UI/A11Y/RESP | 20 |
| OPS | 18 |
| **Total** | **259** |

**P0: 108 · P1: 106 · P2: 40 · P3: 5**
**Expected to fail on the current build (🔴): 48**
