# Business Rules

> The rules the system actually implements, extracted from code — not from intent.
> Where the implemented rule differs from the apparent intent, that is called out.
> Audit date 2026-08-04.

---

## 1. Accounts, workspaces and membership

| # | Rule | Where enforced |
|---|---|---|
| BR-001 | Every new auth user automatically gets a profile, a personal workspace named `"<name>'s Workspace"`, an `owner` membership, and an **active Free subscription** — atomically. | `handle_new_user()` trigger |
| BR-002 | A workspace has exactly one owner. Owners cannot be demoted, revoked or have their menus overridden. | `update_member_role` / `set_member_menus` / `revoke_member` all filter `role <> 'owner'` |
| BR-003 | Collaborators may only be `admin` or `viewer`. | `invite_member`, `update_member_role` |
| BR-004 | **An invitee must already have a FinRoot account.** Inviting an unregistered email raises `No account exists for <email>, ask them to sign up first`. | `invite_member` |
| BR-005 | Invitation is immediate — the new member's `status` is `'active'`, not `'invited'`. There is no accept/decline step, despite `tenant_members.status` supporting `'invited'`. | `invite_member` |
| BR-006 | Re-inviting an existing member updates their role and menus in place. | `ON CONFLICT (tenant_id,user_id) DO UPDATE` |
| BR-007 | Revoking a member **hard-deletes** the membership row; their authored rows remain (`user_id` FK is `ON DELETE SET NULL`, and the row is not deleted). | `revoke_member` |
| BR-008 | Deleting a workspace hard-deletes **all** of its finance data via cascade. No soft delete, no export, no grace period. | `po_delete_tenant` + `ON DELETE CASCADE` |
| BR-009 | A user in multiple workspaces is pinned to their first membership; there is no switcher. | `TenantContext`, no caller of `setCurrentTenantId` |
| ⚠️ BR-010 | **Implemented, not intended:** all writes land in the user's *first* workspace and all reads merge every workspace, regardless of which workspace the UI shows. | `current_tenant_id()` default + no client `tenant_id` filter — see KI-001 |

## 2. Roles and capabilities

| Capability | viewer | admin | owner | Product Owner |
|---|:-:|:-:|:-:|:-:|
| Read workspace data | ✔ | ✔ | ✔ | aggregates only |
| Create/edit/delete data | ✖ | ✔ | ✔ | ✖ |
| Manage members & permissions | ✖ | ✖ | ✔ | ✔ |
| Rename / delete the workspace | ✖ | ✖ | ✔ | ✔ |
| Suspend a workspace | ✖ | ✖ | ✖ | ✔ |
| Read the workspace audit log | ✖ | ✖ | ✔ | ✔ (all) |
| Assign a plan | ✖ | ✖ | ⚠️ (bug SEC-001) | ✔ |
| Edit plans / pricing page / branding / coupons | ✖ | ✖ | ✖ | ✔ |

## 3. Plans, feature access and billing

| # | Rule | Where |
|---|---|---|
| BR-011 | Two seeded plans: **Free** (`dashboard, income, expenses, budget, goals, calculator, reminders, accounts`) and **Pro** (`["*"]` = every feature menu). Both are PO-editable. | migration `20260604210000`, `po_set_plan_menus` |
| BR-012 | The 14 canonical feature menus are `dashboard, income, expenses, investments, budget, goals, reminders, calculator, bill-scan, import, insurance, net-worth, trips, billing`. | `all_feature_menus()` ↔ `src/lib/accessMenus.ts` (duplicated by hand) |
| BR-013 | Effective menus = **plan menu_set** (ceiling) **− tenant deny-list** **∩ member allow-list**. Owners bypass both override layers but not the plan. | `get_effective_menus()` |
| BR-014 | A subscription is "active" only when `status ∈ {active, trialing}` **and** (`current_period_end IS NULL` or `> now()`). Otherwise the tenant falls back to the **Free** menu set. | `plan_menus()` |
| BR-015 | Expiry is evaluated **lazily at read time**; `expire_subscriptions()` exists but is never scheduled, so `subscriptions.status` can read `'active'` while the tenant is effectively expired. `tenant_subscription_status()` derives the display status `'expired'` from dates. | `plan_menus`, `tenant_subscription_status` |
| BR-016 | Exactly one subscription row per tenant (`UNIQUE(tenant_id)`); the Free row created at signup is upgraded in place by the Paddle webhook. | migration `20260604240000`, `payments-webhook` |
| BR-017 | A plan is offered for self-serve upgrade only if `is_active AND price_cents > 0 AND paddle_price_id IS NOT NULL`. | `upgradeable_plans()` |
| BR-018 | Paddle checkout carries `customData: {user_id, tenant_id}`. The webhook resolves the tenant from `custom_data.tenant_id`, falling back to the user's *first owner membership*. | `Billing.tsx`, `payments-webhook` |
| BR-019 | Cancellation takes effect at the end of the current billing period (`effective_from: "next_billing_period"`). | `billing-api` |
| ⚠️ BR-020 | **Coupons are display-only.** The PO can create codes and they render in the promo banner, but no code path applies a discount to a Paddle checkout. | `PoCoupons`, `PromoBanner`, `Billing.tsx` |
| ⚠️ BR-021 | Plan gating restricts navigation only; the underlying data remains readable and writable over the REST API. The paywall is not enforced. | SEC-002 |
| ⚠️ BR-022 | The landing page's pricing cards (Roots / Canopy / Heritage, ₹0 / ₹299 / ₹899) are **`site_settings` marketing copy with no link to the `plans` table** (Free / Pro, $0 / $9). A visitor is sold plans that do not exist in the billing system. | `site_settings.landing_pricing` vs `plans` |

## 4. Money and currency

| # | Rule | Where |
|---|---|---|
| BR-023 | Amounts are `numeric(14,2)` (net worth `16,2`) — never floating point. | migrations |
| BR-024 | Display currency is hardcoded **INR / `en-IN`** (lakh–crore digit grouping). | `lib/finance.ts`, `components/ui/money-input.tsx` |
| BR-025 | Income streams and recurring items carry a per-record FX rate (`exchange_rate_to_inr`, `fx_rate`) entered **manually by the user**. There is no FX feed. | `income_streams`, `recurring_items` |
| BR-026 | `plans.price_cents` is in **USD** while the marketing site quotes **₹** — no conversion exists. | `plans`, `site_settings` |

## 5. Transactions

| # | Rule | Where |
|---|---|---|
| BR-027 | A transaction is `income` or `expense`; there is no transfer type. Moving money between accounts must be modelled as an expense + income pair. | `transactions.type` CHECK |
| BR-028 | Payment mode and account are encoded **into the description**: `[UPI\|<accountId>] subcategory · note`. | `TransactionDialog`, `useLiveAccountBalances` |
| BR-029 | Live account balance = `opening_balance + Σ income − Σ expense` for transactions whose description carries that account id. | `useLiveAccountBalances` |
| BR-030 | Friend-split state is encoded in the description by a second scheme (`paid_full` / `settled` / `owe`). | `lib/splitMeta.ts` |
| BR-031 | Smart Split posts **one** expense transaction for the "mine" bucket only; office/shared buckets are informational and are never recorded as receivables. | `components/expenses/SmartSplit.tsx` |
| BR-032 | A split must reconcile exactly to the source total before it can be saved (amount / percent / shares modes). | `SmartSplit` |

## 6. Recurring items and reminders

| # | Rule | Where |
|---|---|---|
| BR-033 | Recurring items are **templates**; nothing is generated automatically. The user taps "Mark received/paid", which inserts a transaction and advances `next_due_date`. | `useMarkRecurring` |
| BR-034 | `one-time` recurring items are deactivated (`is_active = false`) after being marked. | `useMarkRecurring` |
| BR-035 | Frequencies: `monthly`, `weekly`, `yearly`, `one-time`. Date bumping uses JS `setMonth`/`setFullYear` — **a 31st-of-month item rolls into the next month** (31 Jan → 3 Mar). | `bumpDate()` |
| BR-036 | The dashboard reminder panel merges `reminders` rows with active `recurring_items` due within 30 days. | `ActionableReminders` |
| ⚠️ BR-037 | Per-item reminder settings (enabled, days-before, note) live **only in `localStorage`** — lost on browser change and invisible to collaborators. | `lib/recurringReminders.ts` |
| BR-038 | Reminder contexts: `fixed_due`, `balance_buffer`, `maturity`. Status is `scheduled` or `completed`. | `reminders` CHECK |

## 7. Budgets and goals

| # | Rule | Where |
|---|---|---|
| BR-039 | Budgets are per `(bucket, period_start)`, monthly by default, with a 7-bucket micro-allocation model. | `budgets` |
| BR-040 | `budgets.spent` is a **stored column written by the client**, not derived from `transactions`. It can drift from reality and has no server-side reconciliation. | `useUpdateBudget` |
| BR-041 | Budget utilisation tones: green < 85 %, amber ≥ 85 %, red > 100 %. | `BudgetAllocation` |
| BR-042 | Adding funds to a goal increments `current_amount` client-side and auto-completes the goal when it reaches `target_amount`. No server validation, and concurrent contributions can lose updates. | `GoalManager` / `ContributeDialog` |
| BR-043 | The planner tab's inputs are **device-local** (`localStorage`), not part of the workspace. | `BudgetPlanner` |

## 8. Investments

| # | Rule | Where |
|---|---|---|
| BR-044 | Nine asset classes: `stocks, mutual_funds, bonds, fd, rd, pf, gold, real_estate, crypto`. Class-specific fields live in a `fields jsonb` blob with no schema validation. | `investments` |
| BR-045 | Live pricing covers stocks (Yahoo), crypto (Yahoo `-USD`) and mutual funds (AMFI scheme code via mfapi.in). Everything else uses the stored value. | `lib/livePrices.ts` |
| BR-046 | Ticker resolution: `NSE:X → X.NS`, `BSE:X → X.BO`, plus LSE/TSE/TSX/ASX/HKG/FRA/EPA suffixes; bare US symbols pass through. MF requires a ≥4-digit scheme code. | `resolveSymbol()` |
| BR-047 | When a quote is unavailable the **exact stored value** is shown (no synthetic drift). Prices refresh every 60 s per holding. | `useLivePrices` |
| BR-048 | Demat cash ledger types: `fund_in`, `fund_out`, `buy`, `sell`, `dividend`; amount must be `> 0`. Opening balance is recorded without creating a bank transaction. | `demat_ledger`, migration `20260701150000` |
| BR-049 | An investment can be linked to a bank account via `fields._accountId` (JSON, no FK). | `AddInvestmentDialog` |

## 9. Net worth

| # | Rule | Where |
|---|---|---|
| BR-050 | Assets are auto-derived from `accounts` (live balance) + `investments` (current value); manual entries can be added alongside and are marked `derived:` vs manual. | `pages/NetWorth.tsx` |
| BR-051 | Net worth = assets − liabilities (`debts` + manual liability entries). | `netWorthStore` |
| ⚠️ BR-052 | **The net-worth history sparkline and its 3M/6M/All filter run on a synthetic seed**, not on real snapshots. There is no `net_worth_snapshots` table. The trend shown to users is fabricated. | `netWorthStore.seedHistory` |

## 10. Product Owner

| # | Rule | Where |
|---|---|---|
| BR-053 | Platform admins are seeded **manually via service role**; there is no self-service or RPC path. | `platform_admins` has no INSERT policy |
| BR-054 | The PO may sign in with email / profile username / mobile / `po_user_id` / `po_number_id`, plus a password **or** a 16-digit secret. | `po_resolve_identifier`, `po_verify_secret` |
| BR-055 | `po_user_id` matches `^[a-zA-Z0-9_\-]{3,30}$`; `po_number_id` matches `^[0-9]{6,20}$`; both unique. The secret must be exactly 16 digits, bcrypt-hashed, one per admin, and can never be displayed again. | migrations `20260610120000`, `20260610130000` |
| BR-056 | The PO sees only aggregates — counts, plan breakdown, and platform-wide income/expense sums — never individual finance rows. | `po_dashboard_stats` |
| BR-057 | Every PO mutation writes an `audit_log` entry. Suspending or reactivating a workspace notifies all of its members. | `po_*` RPCs, `po_set_tenant_status` |
| ⚠️ BR-058 | Suspending a workspace sets `tenants.status = 'suspended'` and notifies members, but **no RLS policy or RPC checks `tenants.status`** — a suspended workspace keeps working exactly as before. | `po_set_tenant_status` vs all policies |

## 11. Notifications

| # | Rule | Where |
|---|---|---|
| BR-059 | Events that create notifications: member invited, workspace suspended/reactivated, subscription expiring (function exists but is unscheduled). | `invite_member`, `po_set_tenant_status`, `notify_expiring_subscriptions` |
| BR-060 | The bell polls every 60 s, caps at 100 rows, and opening the Notifications page marks everything read. | `useNotifications`, `pages/Notifications.tsx` |
| BR-061 | Email is best-effort and no-ops entirely when `RESEND_API_KEY` is unset. | `send-email` |

## 12. Access gate

| # | Rule | Where |
|---|---|---|
| BR-062 | A device PIN (4 or 6 digits) is **offered** on a device that has none, and can be declined or switched off later. The choice is per device and per user. *(Stage 5.4 — it used to be mandatory.)* | `ProtectedRoute`, `AppLockSettings`, `lockChoice()` |
| BR-063 | Unlock is per browser tab. Hiding the tab starts a **grace period** (Immediately / 1 / 5 / 15 min, default 5); the lock applies on return only once it has run out. "Immediately" still locks on the way out. *(Stage 5.4 — it used to re-lock on every tab switch.)* | `shouldLockOnReturn()`, `ProtectedRoute` |
| BR-064 | More than 12 hours since the last password login → the lock screen demands the **password**, not the PIN. | `needsPassword()` |
| BR-065 | A forgotten PIN is reset with the account password ("Forgot your PIN?"), which clears the PIN and asks for a new one. Nobody can look the old one up — it is only ever stored as a hash, on the device. *(Stage 5.4 — there used to be no reset at all.)* | `LockScreen` recover mode, `clearPin()` |
| BR-066 | Turning the lock off deletes the stored PIN, so switching it back on later never expects a PIN nobody remembers. | `AppLockSettings`, `PinSetup` |

---

## Rules that are stated but not enforced

| Claim | Reality |
|---|---|
| "Plans gate features" | navigation only — data is fully reachable (BR-021) |
| "Suspend a workspace" | status is cosmetic (BR-058) |
| "Coupons" | never applied to a purchase (BR-020) |
| "Net-worth trend" | synthetic seed data (BR-052) |
| "Remember this profile on this device" | only saves the email; sessions are always persistent |
| Landing pricing (₹299 / ₹899, Canopy / Heritage) | no matching rows in `plans` (BR-022) |
| "Product Owner reads aggregates only" | ✅ true |
| "Owners cannot be removed" | ✅ true |
