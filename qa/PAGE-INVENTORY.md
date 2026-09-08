# FinRoot — Page / Route Inventory

Source: `src/App.tsx` (routing), `src/components/AppSidebar.tsx` + `src/components/DashboardLayout.tsx` (nav), `src/pages/**`.
Tested live at `http://localhost:5188` on 2026-09-07, commit `2a4b0d3`, signed in as `demo@finroot.app` (owner + platform admin), plan **Canopy**.

Legend — STATUS: **PASS** (loaded, rendered, no console errors), **PASS\*** (loaded; feature depends on an external service not exercised), **NOT TESTED** (could not exercise — reason given), **FAIL** (see BUGS.md).

## A. Public routes (no auth)

| PAGE ID | NAME | ROUTE | ACCESS | SOURCE | STATUS |
|---|---|---|---|---|---|
| P-01 | Landing | `/` | Public | App.tsx:147, sidebar logo, sign-out redirect | **PASS\*** — renders (hero, nav, product, pricing, FAQ, stats show real values); deep-scroll interaction could not be verified in the automated pane, see BUG-014 |
| P-02 | Auth (sign in / sign up) | `/auth` | Public (redirects to `/app` if authed) | App.tsx:148 | **PASS** — tabs, email/password, show-password, forgot-password, Google button, saved-profiles all render; validation works |
| P-03 | Privacy Policy | `/privacy` | Public | App.tsx:151 | **PASS** — h1 "Privacy Policy", full content (~7 KB) |
| P-04 | Terms of Service | `/terms` | Public | App.tsx:152 | **PASS** — h1 "Terms of Service", full content |
| P-05 | Support | `/support` | Public | App.tsx:156 | **PASS** — h1 "Get help", mailto builder, `finroot95@gmail.com` |
| P-06 | Status | `/status` | Public | App.tsx:157 | **PASS** — live checks: DB & API / Sign-in / Web app all "Operational" |
| P-07 | Accept Invite | `/invite/:token` | Public (stashes token, sends to sign-in) | App.tsx:161 | **PASS** — bogus token → "This link didn't work / not valid"; wrong-email token → "sent to a different email address" |
| P-08 | Reset Password | `/reset-password` | Public (expects recovery session) | App.tsx:162 | **PASS\*** — renders "Set a new password" form; direct access with no recovery token still shows the form (see BUG-015); h1 is "FinRoot" not the page purpose |
| P-09 | 404 Not Found | `*` (any unmatched) | Public | App.tsx:229 | **PASS** — "404 / Oops! Page not found / Return to Home" |

## B. Authenticated app routes (`/app/*`, `ProtectedRoute` → onboarding → PinSetup → LockScreen → page)

| PAGE ID | NAME | ROUTE | ACCESS | SOURCE | STATUS |
|---|---|---|---|---|---|
| A-01 | Dashboard | `/app` | menu `dashboard` | App.tsx:190, sidebar | **PASS (with defect)** — all sections render; but the "Wealth Overview" net-worth figure contradicts the top metric card (BUG-017) |
| A-02 | Income | `/app/income` | menu `income` | App.tsx:192, sidebar | **PASS** — streams + Recurring Income tabs, metrics, chart toggle, transactions table with Income/Expense toggle + filters |
| A-03 | Expenses | `/app/expenses` | menu `expenses` | App.tsx:193, sidebar | **PASS** — 4 tabs (Spending Overview, Smart Split, Recurring Expenses, Subscriptions), cross-filter widget; minor: "N entries in view" vs filtered count (BUG-016) |
| A-04 | Investments | `/app/investments` | menu `investments` | App.tsx:194, sidebar | **PASS** — portfolio metrics, net-worth widget, demat accounts, empty states |
| A-05 | Budget | `/app/budget` | menu `budget` | App.tsx:195, sidebar | **PASS** — Buckets + Planner tabs, summary cards, budgets table; CRUD works but no positive-value validation (BUG-005) |
| A-06 | Goals | `/app/goals` | menu `goals` | App.tsx:196, sidebar | **PASS** — active/completed metrics, goal cards; CRUD + contribute all work; icon buttons unlabeled (BUG-007) |
| A-07 | Calculator | `/app/calculator` | menu `calculator` | App.tsx:197, sidebar | **PASS** — 7 calculators (Average Down, Step-Up SIP, SWP, CAGR, Stock Split, Rule of 72, Percentage), live compute; client-only |
| A-08 | Calendar | `/app/calendar` | ALWAYS-ALLOWED (navigation-only) | App.tsx:201 | **PASS** — month grid, money-in/out/net/entries, legend, day detail panel, month nav + Today |
| A-09 | Reminders | `/app/reminders` | menu `reminders` | App.tsx:203, sidebar | **PASS** — empty state, "New reminder" |
| A-10 | Settings | `/app/settings` | ALWAYS-ALLOWED | App.tsx:204, sidebar | **PASS** — theme (5), dashboard layout, density, category visibility, App Lock (PIN), help, delete-account. Theme + PIN toggles verified working |
| A-11 | Profile | `/app/profile` | ALWAYS-ALLOWED | App.tsx:205, sidebar footer, header | **PASS** — user card, plan, personal details form (name/phone/base currency), "Save changes"; "Upgrade to Pro ₹199/mo" card mismatches real plan catalog (BUG-009) |
| A-12 | Notifications | `/app/notifications` | ALWAYS-ALLOWED | App.tsx:206, header bell | **PASS** — empty state "You're all caught up" |
| A-13 | Import | `/app/import` | menu `import` | App.tsx:207, sidebar | **PASS\*** — dataset + broker pickers, drag-drop upload (.csv/.xls/.xlsx/.pdf); no `<h1>` (BUG-011). File parse/commit not exercised |
| A-14 | Export | `/app/export` | menu `export` | App.tsx:212, sidebar | **PASS\*** — PDF/CSV/Excel, date ranges, section checkboxes, "Download all my data" JSON. Downloads not exercised (pane blocks file saves) |
| A-15 | Workspace | `/app/workspace` | menu `settings` | App.tsx:213, sidebar | **PASS** — Team & Permissions / Recurring Income / Recurring Expenses tabs; member list; **Invite Member verified** (creates link, email-locked) |
| A-16 | Accounts | `/app/accounts` | ALWAYS-ALLOWED (navigation-only) | App.tsx:214 | **PASS** — always-visible inline add/edit form, Transfer, live preview; CRUD verified; delete has NO confirm (BUG-006); edit button mislabeled "Add Account" (BUG-010) |
| A-17 | Billing | `/app/billing` | menu `billing` | App.tsx:215, sidebar | **PASS\*** — current plan, Cancel subscription, Refresh, plans list, payment history. `billing-api` GET works; Cancel not exercised (would change live plan state) |
| A-18 | Bill Scan | `/app/bill-scan` | menu `bill-scan` | App.tsx:216, sidebar | **PASS\*** — upload UI, Document/Lumpsum toggle, verification ledger. AI extraction (`scan-receipt` / Gemini) not exercised (needs real receipt + server key) |
| A-19 | Insurance | `/app/insurance` | menu `insurance` | App.tsx:217, sidebar | **PASS** — empty state, "Add New Policy"; metric counters render "00" (BUG-013) |
| A-20 | Net Worth | `/app/net-worth` | menu `net-worth` | App.tsx:219, sidebar | **PASS** — total, trend chart w/ range + Customize, Assets/Liabilities with auto-synced accounts, Add Entry/Asset/Liability |
| A-21 | Trips | `/app/trips` | menu `trips` | App.tsx:221, sidebar | **PASS** — empty state, "New Trip"; h1 has leading space (BUG-012) |
| A-22 | Trackers | `/app/trackers` | menu `trackers` | App.tsx:222, sidebar | **PASS** — Active/Completed/Archived tabs, summary; CRUD verified (2-step create wizard, informative delete confirm); `?id=` deep-link works |

### App redirects (all PASS)

| From | To | Source |
|---|---|---|
| `/app/calculators` | `/app/calculator` | App.tsx:198 |
| `/app/budget-allocator` | `/app/budget` | App.tsx:218 |
| `/app/subscriptions` | `/app/expenses` | App.tsx:220 |
| `/app/<anything-else>` | `/app` | App.tsx:223 (catch-all) |

## C. Product Owner console (`/po/*`, `PoShell`, platform-admin only)

Accessed directly with the demo account's platform-admin status (no `/po/login` secret prompt for an already-authenticated admin). All read-only navigation; **no PO mutations performed** (shared live platform data).

| PAGE ID | NAME | ROUTE | SOURCE | STATUS |
|---|---|---|---|---|
| O-01 | PO Login | `/po/login` | App.tsx:163 | **PASS** — redirects to `/po` when already an authed admin |
| O-02 | PO Dashboard / Overview | `/po` | App.tsx:169 | **PASS** — tenants/users/subs/plan-breakdown, all-tenant financial summary (aggregates only), recent activity |
| O-03 | PO Tenants | `/po/tenants` | App.tsx:170 | **PASS** — list, counts, "Add tenant", per-tenant module pill/chevron. Mutations NOT TESTED |
| O-04 | PO Analytics | `/po/analytics` | App.tsx:171 | **PASS** — activation/retention/paying/MRR, signups-by-month; "derived, never tracked" |
| O-05 | PO Plans | `/po/plans` | App.tsx:172 | **PASS** — per-plan menu visibility, price, Paddle price id. Save NOT TESTED |
| O-06 | PO Pricing Page | `/po/pricing` | App.tsx:173 | **PASS** — landing pricing-section editor. Save NOT TESTED |
| O-07 | PO Branding | `/po/branding` | App.tsx:174 | **PASS** — app name + logo editor, preview. Save NOT TESTED |
| O-08 | PO Coupons | `/po/coupons` | App.tsx:175 | **PASS** — gracefully disabled ("no payment gateway configured") |
| O-09 | PO Status Page | `/po/status` | App.tsx:176 | **PASS** — state (Operational/Maintenance/Degraded/Outage) + headline editor. Save NOT TESTED |
| O-10 | PO Audit Log | `/po/audit` | App.tsx:177 | **PASS** — When/Action/Tenant/Actor/Detail table, live rows |
| O-11 | PO Security | `/po/security` | App.tsx:178 | **PASS** — 16-digit secret (rotate/enter/revoke), change password. Mutations NOT TESTED (would alter admin credentials) |
| — | PO catch-all | `/po/*` | App.tsx:179 | redirects to `/po` |

## D. Route-level gates observed

- Signed-out access to any `/app/*` → redirect to `/auth` (**verified** with `/app/income`).
- Sign out → redirect to `/` and session cleared from `localStorage` (**verified**).
- `/auth` while authed → redirect to `/app` (**verified**).
- PIN gate: fresh device shows "Add a PIN to this device?" (declinable "Not now"); when enabled, `LockScreen` intercepts (**verified** enable → lock → unlock → disable).
- Onboarding wizard gate: not seen — demo account is backfilled `onboarding_completed = true`. **NOT TESTED** (needs a fresh signup).
- `MenuGuard`: every gated page rendered because the Canopy plan + owner role grants them. A plan/menu **denial** path was **NOT TESTED** (single account, can't remove own menus without PO mutation).
