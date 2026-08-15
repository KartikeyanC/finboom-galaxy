# Module Map

> Every module in the repository, with responsibilities, contracts, failure modes and scores.
> Scores are 1–5 (5 = best). **M** = maintainability, **S** = scalability, **Q** = code quality.
> Audit date 2026-08-04.

## Inventory

| Area | Files | LOC-ish |
|---|---|---|
| `src/pages` | 27 | ~400 kB |
| `src/components` (feature) | 60 | ~480 kB |
| `src/components/ui` | 55 | ~180 kB |
| `src/hooks` | 14 | ~40 kB |
| `src/lib` | 22 | ~120 kB |
| `src/contexts` | 3 | ~13 kB |
| `supabase/migrations` | 32 | 103 kB |
| `supabase/functions` | 5 | 17 kB |
| **Total TS/TSX in `src`** | **199** | — |

---

## 1. Platform & shell

### 1.1 `src/App.tsx` — routing & provider composition
- **Purpose:** mount providers, define all three route trees.
- **Inputs:** none. **Outputs:** rendered app.
- **Dependencies:** every page (all statically imported), all providers.
- **Failures:** any page module that throws at import time kills the whole bundle; no error
  boundary means a render throw yields a blank screen.
- **Perf risk:** static imports of 27 pages defeat code splitting — the root cause of the
  2.5 MB main chunk.
- **Refactor:** `React.lazy` + `Suspense` per route; add an `ErrorBoundary` above `<Routes>`.
- **M 3 · S 2 · Q 4**

### 1.2 `src/hooks/useAuth.tsx` — session provider
- **Purpose:** expose `{user, session, loading, signOut}`; stamp app-lock timestamps on
  `SIGNED_IN`.
- **Failures:** the "remember me / session-only" branch reads `finroot.session_only`, which
  **nothing ever writes** (`Auth.tsx` only removes it) → dead code; the sign-up checkbox
  labelled "Remember this profile" does not affect session lifetime.
- **Security:** session persists in `localStorage` (supabase-js default) → readable by any XSS.
- **Refactor:** delete the dead branch or wire the checkbox to it; consider
  `storage: sessionStorage` when "remember me" is off.
- **M 4 · S 4 · Q 3**

### 1.3 `src/contexts/TenantContext.tsx` — membership & current workspace
- **Purpose:** load `tenant_members` for the signed-in user; hold `currentTenantId`
  (persisted to `localStorage`).
- **Inputs:** `useAuth().user`. **Outputs:** memberships, current, role.
- **Note:** correctly filters `.eq("user_id", user.id)` — necessary because the
  `tm_select` policy also allows platform admins to read every row.
- **Failures:** on query error it silently sets `[]`; the user sees "no workspace" with no
  message. **No UI anywhere calls `setCurrentTenantId`** — there is no workspace switcher, so
  multi-workspace users are pinned to `memberships[0]`.
- **M 4 · S 3 · Q 4**

### 1.4 `src/contexts/AccessContext.tsx` — effective menus & members
- **Purpose:** call `get_effective_menus` + `list_tenant_members`; expose
  `canAccess`/`canWrite`/`isReadOnly` and the owner-only "view as" preview.
- **Failure (fail-open):** if the RPC errors, `effectiveMenus` stays `null`, and
  `canAccess` returns `true` for everything. A transient network failure grants full nav.
- **Failure:** `ALWAYS_ALLOWED` (`accounts`, `settings`, `profile`, `notifications`) is
  unconditional — these pages can never be restricted by plan or by owner.
- **M 4 · S 4 · Q 4**

### 1.5 `src/components/ProtectedRoute.tsx` + `src/lib/appLock.ts` — device PIN gate
- **Purpose:** mandatory 4/6-digit PIN, per-tab unlock, re-lock on tab hide, password
  re-auth after 12 h.
- **Contract:** PIN hash `SHA-256("finroot:<uid>:<pin>")` in `localStorage`; unlock flag in
  `sessionStorage`.
- **Security:** unsalted, un-stretched SHA-256 over a ≤10⁶ keyspace — an attacker with
  `localStorage` access recovers the PIN instantly. `isUnlocked()` returns **`true`** when
  storage throws (fail-open). The PIN is a UX convenience, not a security control, and is not
  documented as such to users.
- **Correctness:** `hasPin` is computed synchronously during render — this is deliberate and
  fixes an earlier bug where users were re-prompted to create a PIN on every login.
- **M 4 · S 5 · Q 3**

### 1.6 `src/components/DashboardLayout.tsx` — app chrome
- **Purpose:** sidebar + top bar, Ctrl+K search, Ctrl+N quick-add, notification badge,
  read-only banner, expired-subscription banner, cosmic background on `obsidian`.
- **Bug:** the period label is the **hardcoded string `"April 2026"`** (line 135).
- **Bug:** Ctrl+N / Cmd+N is captured globally and `preventDefault`ed, overriding the browser's
  "new window" shortcut with no way to opt out.
- **M 3 · S 4 · Q 3**

### 1.7 `src/components/MenuGuard.tsx` — route-level feature gate
- **Purpose:** block a route when `canAccess(menuId)` is false; redirect to `fallbackPath`
  or render "no modules assigned".
- **Gap:** 6 of 20 `/app` routes are ungated (`settings`, `profile`, `notifications`,
  `export`, `workspace`, `accounts`, `billing`) — `billing` is in `all_feature_menus()` and
  `ACCESS_MENUS` but its route has no guard, so plan-gating `billing` has no effect.
- **M 4 · S 5 · Q 4**

---

## 2. Data-access modules

### 2.1 `src/hooks/useTransactions.ts` (also `useBudgets`, `useGoals`, `useRecurring`)
- **Purpose:** CRUD over the four original Lovable tables.
- **Inputs:** typed `*Input` objects. **Outputs:** typed rows + toasts.
- **Contract gap:** insert sets `user_id` only; `tenant_id` comes from the DB default.
  Select applies **no** `tenant_id` filter. This is the KI-001 tenancy defect.
- **Perf:** `useTransactions` selects `*` with **no date range, no pagination, no limit** —
  every page load fetches the tenant's entire transaction history and filters in JS.
- **Refactor:** accept `tenantId` explicitly; add `.eq("tenant_id", currentTenantId)`;
  paginate by `occurred_at` range.
- **M 4 · S 2 · Q 3**

### 2.2 `src/lib/*Store.ts` (accounts, investments, debts, insurance, netWorth, trips, reminders, subscriptions)
- **Purpose:** keep the pre-migration hook API (`{items, add, update, remove}`) while writing
  to Supabase; run a one-time localStorage import guarded by
  `finroot.migrated.<store>.<tenantId>`.
- **Failures:** the importer is fire-and-forget — a failed import still sets the "migrated"
  flag in some paths, permanently orphaning local data. jsonb columns are written through
  `as unknown as Json` casts, so shape errors surface only at runtime.
- **Consistency:** each store re-implements filtering/sorting/optimistic update slightly
  differently; `insuranceStore` stores documents as **base64 data URLs in a `text` column**
  rather than Supabase Storage.
- **M 3 · S 2 · Q 3**

### 2.3 `src/hooks/useIncomeStreams.ts`
- **Purpose:** income streams, migrated to Postgres in migration `20260627120000`.
- **Defect:** accesses the table through `const db = supabase as unknown as SupabaseClient`
  because `income_streams` is **absent from the generated `types.ts`** — the migration was
  never reflected in regenerated types. All type safety on this table is off.
- **M 2 · S 3 · Q 2**

### 2.4 `src/hooks/useLiveAccountBalances.ts` + the description-encoding scheme
- **Purpose:** derive live bank balances as `openingBalance + Σincome − Σexpense` for
  transactions whose `description` starts with `[PaymentMode|accountId]`.
- **Design risk:** **structured data is encoded inside a free-text `description` column**
  (`[UPI|acc-id] subcategory · note`). Any user who types a `[` at the start of a note
  corrupts the parse; there is no DB constraint, no index, and no way to query balances in
  SQL. Split metadata (`lib/splitMeta.ts`) uses the same trick.
- **Refactor:** promote to real columns (`account_id uuid`, `payment_mode text`) with a
  backfill migration.
- **M 2 · S 1 · Q 2**

### 2.5 `src/hooks/useRealtimeSync.tsx`
- **Purpose:** invalidate query caches on `postgres_changes`.
- **Defect:** filters `user_id=eq.<uid>`, so a collaborator's changes never reach co-members —
  inconsistent with the tenancy model. Also fires a toast on **every** INSERT, including the
  user's own, producing duplicate notifications alongside the mutation's own toast.
- **M 3 · S 3 · Q 2**

### 2.6 `src/lib/livePrices.ts`
- **Purpose:** poll live quotes for stocks / crypto / mutual funds via the `live-price` edge fn.
- **Perf:** one HTTP request **per holding, every 60 s, per open tab**, unbatched and
  uncached. 30 holdings = 43 200 edge invocations/day/tab.
- **Note:** the earlier pseudo-random price drift has been removed; missing quotes now fall
  back to the exact stored value.
- **M 4 · S 1 · Q 3**

---

## 3. Feature modules (pages)

| Page | Menu id | Backing store | Notes / risks |
|---|---|---|---|
| `Index` → `DashboardClassic` \| `DashboardWealth` | `dashboard` | many hooks | layout chosen by `localStorage`; every widget re-queries independently |
| `Income` | `income` | `income_streams`, `recurring_items`, `transactions` | untyped `db` handle (2.3) |
| `Expenses` | `expenses` | `transactions`, `recurring_items`, `tracked_subscriptions` | hosts Smart Split, ledger, subscriptions panel |
| `Investments` | `investments` | `investments`, `demat_*` | live-price polling (2.6); demat tables absent from `types.ts` |
| `Budget` | `budget` | `budgets` + `BudgetPlanner` (localStorage) | planner state is device-local |
| `Goals` | `goals` | `goals` | contribution dialog mutates `current_amount` client-side; no server validation |
| `Reminders` | `reminders` | `reminders` | recurring-reminder settings are **localStorage-only** |
| `Calculator` | `calculator` | none | pure client, 20 kB |
| `BillScan` | `bill-scan` | `transactions` | image handled client-side; no OCR backend |
| `Import` → `TransactionImporter` | `import` | 5 datasets | 46 kB component; `dangerouslySetInnerHTML` on static broker copy (safe but avoidable) |
| `Export` | *(ungated)* | all | 35 kB; `xlsx` dynamic import defeated by a static import in `importParsers.ts` |
| `Insurance` | `insurance` | `insurance` | base64 documents in a text column |
| `NetWorth` | `net-worth` | `net_worth_entries` + derived | **history sparkline is synthetic seed data**, not real snapshots |
| `Trips` | `trips` | `trips` | **`TripKind` includes `"other"`; the DB CHECK constraint does not** → insert fails |
| `Accounts` | *(ungated)* | `accounts` | balance history is localStorage-only |
| `Billing` | `billing` | `subscriptions`, Paddle.js | route has no `MenuGuard` |
| `WorkspaceManage` | *(ungated, `settings`)* | member RPCs | 30 kB; full invite/permission matrix |
| `Settings`, `Profile`, `Notifications` | always allowed | mixed | base currency is localStorage |
| `Landing` | public | `site_settings` | **71 kB single file** — largest in the repo |
| `Auth`, `ResetPassword` | public | GoTrue | saved profiles under legacy key `valar.profiles` |

**Cross-cutting page risks:** no page implements pagination or virtualisation; every list
renders the full dataset. Empty/error/loading states are present but inconsistent in style.

---

## 4. Product Owner console (`src/pages/po/`)

| Module | Purpose | Risk |
|---|---|---|
| `PoLogin` | password or 16-digit-secret sign-in; forgot-password | calls the **unauthenticated** `po-auth` fn → identifier enumeration + unthrottled reset-mail trigger |
| `PoShell` | route guard via `is_platform_admin()` | client-side only; the real gate is each RPC's own check (correct) |
| `PoDashboard` | `po_dashboard_stats`, `po_recent_activity` | aggregates only ✔ |
| `PoTenants` | list/create/suspend/delete tenants, per-tenant module grid | `po_create_tenant` return value is assumed; delete is hard-delete with cascade |
| `PoPlans` | edit `plans.menu_set` | no validation that menu ids are real |
| `PoPricing` / `PoBranding` | CMS over `site_settings` | branding logo stored as an inline data URL (unbounded size in a jsonb column) |
| `PoCoupons` | coupon CRUD | coupons are **display-only** — never applied to a Paddle checkout |
| `PoAudit` | `po_audit_log` | read-only ✔ |
| `PoSecurity` | rotate secret, set identifiers, change password | **6 of the 10 current `tsc` errors live here** — its 4 RPCs are missing from `types.ts` |

**M 3 · S 4 · Q 3**

---

## 5. Backend modules

### 5.1 Migrations (`supabase/migrations`, 32 files)
Append-only, well-commented, phased (1 tenancy → 2a–2j data → 3 permissions → 4 plans →
5 PO → 6 notifications → 7 Paddle → ad-hoc). See
[Database_Architecture.md](./Database_Architecture.md) and
[Database_Report.md](./Database_Report.md).
**M 4 · S 4 · Q 4**

### 5.2 Edge functions
| Function | Assessment |
|---|---|
| `po-auth` | correct crypto, but public + unthrottled; enumeration oracle |
| `payments-webhook` | HMAC verified, but **non-constant-time compare** and **no timestamp freshness check** → replayable |
| `billing-api` | queries by `user_id` not `tenant_id` — inconsistent with the tenancy model |
| `live-price` | unauthenticated third-party proxy, no cache, no rate limit |
| `send-email` | **accepts arbitrary `to`/`subject`/`html` from any signed-in user** → open relay |

**M 4 · S 3 · Q 3**

---

## 6. Shared libraries

| Module | Purpose | Note |
|---|---|---|
| `lib/finance.ts` | `formatMoney` (en-IN), FX helpers | **11 unit tests — the best-covered module** |
| `lib/importParsers.ts` | CSV/XLSX/PDF parsing for 5 datasets | 11 tests; **4 of the 10 current `tsc` errors**; statically imports `xlsx` |
| `lib/categories.ts`, `expenseSubcategories.ts` | category taxonomy + custom categories | custom entries are localStorage-only |
| `lib/chartColors.ts`, `chartShapes.tsx` | theme-aware 12-colour deck + shared donut active shape | single source of truth ✔ |
| `lib/accessMenus.ts` | canonical menu ids | **drifts from `all_feature_menus()`** — DB list and client list must be kept in sync manually |
| `lib/appLock.ts` | PIN gate (see 1.5) | |
| `lib/splitMeta.ts`, `dashboardLayout.ts`, `recurringReminders.ts`, `incomeSeed.ts`, `subscriptionBrands.ts`, `utils.ts` | small helpers | |

---

## 7. Score summary

| Module group | M | S | Q | Headline concern |
|---|---|---|---|---|
| Routing/shell | 3 | 2 | 4 | no code splitting, no error boundary |
| Auth & lock | 4 | 4 | 3 | dead remember-me branch; weak PIN hash |
| Tenancy/access | 4 | 3 | 4 | client never uses `tenant_id`; fail-open menus |
| Data hooks | 4 | 2 | 3 | no pagination; no tenant filter |
| `lib/*Store.ts` | 3 | 2 | 3 | duplicated logic; fragile importers |
| Encoded-description layer | 2 | 1 | 2 | structured data in free text |
| Pages | 3 | 2 | 3 | oversized files, no virtualisation |
| PO console | 3 | 4 | 3 | type drift, unthrottled public auth fn |
| Migrations | 4 | 4 | 4 | grants never revoked from `PUBLIC` |
| Edge functions | 4 | 3 | 3 | open mail relay, replayable webhook |
| Shared libs | 4 | 4 | 4 | menu-id list duplicated client/server |
