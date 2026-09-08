```
FINROOT QA AUDIT
STAGE 1  (+ STAGE 2 fix outcome, appended 2026-09-08)

================================================================
STAGE 2 OUTCOME — branch fix/qa-stage-2 · PR #6
  FIXED (typecheck 0 · lint 0 · 813 tests green; key ones re-verified live):
    BUG-002, 003, 004, 005, 007, 008, 010, 011, 012, 013, 015, 016, 017, 018
  NOT BUGS (investigated, confirmed):
    BUG-006  account edit button label is correct
    BUG-009  quick-add sheet closes ~700ms after save (Stage-1 reading was a hidden-tab timer throttle)
    BUG-014  landing sets scroll-behavior:smooth; automation pane can't animate it — real scroll is fine
  BLOCKED — MIGRATION NOT APPLIED:
    BUG-001  interim frontend fix is SHIPPED (stops new orphans). The structural fix
             (supabase/migrations/20260907190000_bug001_link_recurring_to_income_stream.sql —
             FK + ON DELETE CASCADE + backfill + orphan cleanup) is written and reviewed SAFE,
             but CANNOT be applied here: no SUPABASE_ACCESS_TOKEN, no DB password, CLI not logged in.
             Target is the LIVE project ludbntvhagefadfkhrjj (no backups) — applying it is
             production-affecting. Full blocker + apply steps: qa/BUGS.md §BUG-001.
             ↳ do NOT mark BUG-001 FIXED until the migration is applied and the repro re-tested.
================================================================

Date:                         2026-09-07
Application version / commit: 2a4b0d3  (master — "Merge pull request #5 from KartikeyanC/docs/gate-counts")
Repo:                         KartikeyanC/finboom-galaxy   (working copy: F:\Movie\AK\FinRoot\_extracted)

  ⚠ Working tree was NOT clean at `2a4b0d3` — it carries ~25 uncommitted files of in-progress
    branding/logo rework (AppSidebar, Auth, Landing, FloatingNav, effects, BudgetPlanner,
    useBranding, index.css, favicons, brand assets, …). The audit therefore tested
    `2a4b0d3 + that uncommitted work`, not the clean commit. None of it was modified by QA.

Environment:
  Frontend:   Vite 5.4.21 dev server, http://localhost:5188  (launch.json asks 8080; auto-picked 5188)
  Backend:    Supabase project ludbntvhagefadfkhrjj (LIVE), region Seoul — DB & API + Sign-in reported "Operational"
  Account:    demo@finroot.app  (owner + platform admin, plan Canopy)  — the only usable account
  Browser:    in-app Chromium pane driving the dev server (see limitations note)
  No application code, database schema, or configuration was modified. All QA test rows created
  during the audit were deleted afterwards; the demo account is back to its starting state.

================================

PAGES
Total:       45   (22 app + 10 PO + 9 public + 4 redirects)
Passed:      44   (loaded, rendered intended content, navigation works)
Failed:       0
Not Tested:   1   (first-run onboarding wizard — demo account already onboarded; needs a fresh sign-up)
  Note: ~6 pages are "PASS*" — page renders but its headline feature was not exercised
        (Landing deep-scroll, Reset-password w/ token, Import commit, Export download,
         Billing mutations, Bill-Scan AI). PO pages: navigation only, no mutations.
  Cross-cutting: ZERO React errors / hydration errors / unhandled rejections across the whole sweep.

================================

BUTTONS
Total:      ~120 catalogued (qa/BUTTON-INVENTORY.md)
Passed:      ~55  (clicked live, correct result observed)
Failed:       0   (no button was dead / no-action)
Not Tested:  ~65  (present and correctly wired in code, but not clicked — mostly PO mutation
                   buttons, secondary controls, and controls with no demo data to act on)
  Defects found on working buttons: 4 icon-only buttons with no accessible name
  (goal add-funds/edit/delete, account archive/delete) — see BUG-002/003/004.

================================

LINKS
Total:      ~45  (20 sidebar nav + 3 header + 4 footer + ~10 landing anchor/nav + misc)
Passed:      ~35  (every sidebar route reached; header, footer, 404, invite, back-to-site links correct)
Failed:       0
Not Tested:  ~10  (landing-page anchor links Product/Workflow/Voices/Pricing/FAQ — scroll could not
                   be driven in the automated pane, see BUG-014; landing footer links)

================================

FORMS
Total:       34  (qa/FORM-INVENTORY.md)
Passed:      14  (positive + at least one negative path verified)
Partial:      6  (positive path or dialog verified, some negative cases not)
Failed:       0  (BUG-005 is a missing-validation DEFECT inside an otherwise-passing form)
Not Tested:  14  (sign-up, OAuth, reset-with-token, investments, insurance, reminders, net-worth,
                  trips, transfer, import/scan upload, profile save, delete-account, PO editors)

================================

CRUD
Total:       12 modules with create/read/update/delete
Passed:       6  (transactions, income streams, budgets, goals, trackers, accounts — every step
                  verified to persist through a full page reload)
Failed:       0
Not Tested:   6  (investments, insurance, reminders, net-worth entries, trips, demat accounts —
                  all sit on empty states on the demo account; not exercised)
  Defects (all addressed in Stage 2): BUG-001 (income-stream delete orphans its recurring item —
           interim fix shipped, DB migration BLOCKED), BUG-003 (account delete has no confirmation —
           FIXED), BUG-005 (budget accepts a ₹0 allocation — FIXED).

================================

WORKFLOWS
Total:       15 defined and run  (qa/WORKFLOW-INVENTORY.md)
Passed:      15  (5 of them "PASS with defect")
Failed:       0
Not Tested:  ~14 journeys (onboarding, sign-up→confirm, reset email, OAuth, Bill-Scan pipeline,
                  Import commit, Export download, billing changes, multi-role permission boundary,
                  account deletion, PO tenant lifecycle, offline/PWA, session expiry)

================================

API
Edge functions:  9 entries — 1 verified working (billing-api GET), 1 reached (scan-receipt UI),
                 7 not tested (billing mutations, po-auth, live-price, payments-webhook, send-email[undeployed])
RPCs:            43 referenced — ~18 verified via UI (dashboard_summary, budget_set_allocation,
                 budget_spend, goal_contribute, tracker_spend, create_invitation, accept_invitation
                 [negative], list_tenant_members, tenant_subscription_status, get_effective_menus,
                 po_dashboard_stats/recent_activity/list_tenants/tenant_engagement/tenant_activity_months/
                 audit_log/list_coupons/is_platform_admin)
                 — ~25 not tested (all PO mutations, member admin, mark_*, upgradeable_plans, …)
Tables:         26 referenced — 7 verified writable+persistent via CRUD (income_streams, recurring_items,
                 transactions, budgets, goals, trackers, accounts)
Failed:          0
  Supabase calls are cross-origin and were NOT captured by the network panel — verified via UI
  state, localStorage, success/error toasts and direct fetch probes.

================================

DATABASE
Persistence:    Passed — every CRUD write (7 tables) survived a full page reload.
RLS / tenancy:  Passed for the owner role — writes scoped to the demo tenant, reads correct.
Multi-role RLS: Not Tested — no second account; the SEC/AUTHZ negative suites are unreachable
                (autoconfirm off, no service-role key in the repo).
PO aggregate boundary: Consistent with design — /po pages show counts/timestamps/totals only,
                never raw finance rows.

================================

AUTHENTICATION
Passed:      Sign in (valid), wrong password (rejected + client attempt-counter), invalid email
             (blocked), sign out (session cleared, → /), protected route while signed out (→ /auth),
             /auth while authed (→ /app), session persistence across reload, App-Lock PIN
             (set / lock / wrong / unlock / disable), invite redemption email-lock.
Failed:       0
Not Tested:  Sign-up, Google OAuth, password-reset email + token flow, password-fallback lock mode,
             5-attempt lockout trip, session expiry handling, onboarding wizard.

================================

AUTHORIZATION
Passed:      Owner + platform-admin has full access, consistently, across all 22 app menus and the
             10 PO pages; plan (Canopy) menu resolution correct.
Failed:       0
Not Tested:  The entire allowed/forbidden boundary — admin and viewer roles, per-member menu
             overrides, plan-lock/upsell rendering, and API-level refusals — because only one
             account (a full-access owner) is usable. This is the single biggest coverage gap.

================================

RESPONSIVE
Passed:      Mobile 375×812 on Dashboard, Accounts, Income, Budget, Settings, Calendar —
             no horizontal page scroll, wide tables scroll inside an overflow-x container,
             sidebar goes off-canvas with a working hamburger trigger.
             Desktop 1440×900 — primary test size, all pages fine.
Failed:       0 observed
Not Tested:  Tablet 768/1024 and the 1280/1920 desktop steps (spot checks only); modal/drawer
             layouts at mobile; touch-target sizing (covered by the project's own tap-targets
             e2e spec, not re-run here).

================================

BUG SUMMARY   (status as of Stage 2, 2026-09-08)
P0:  0
P1:  0
P2:  2    BUG-001  income-stream delete orphans its recurring item — interim fix SHIPPED;
                   structural DB migration BLOCKED (not applied — no Supabase credentials). See above.
          BUG-017  dashboard showed two contradictory net-worth figures — FIXED. Real root cause was
                   NetWorthTrend's useMemo missing `liveBalances` from its deps; new useNetWorthSummary
                   hook is the single source. Verified live: all three figures now read −₹8,128.
P3:  6 (all FIXED)  BUG-002 command palette a11y · BUG-003 account delete confirm + aria-label ·
          BUG-004 goal icon button labels · BUG-005 budget rejects ₹0 · BUG-007 Profile plan card
          uses the real catalogue · BUG-018 removed the mock "Archive" button
P4:  9 (7 FIXED, 2 not bugs)  BUG-008 reset-password recovery guard ✓ · BUG-010 quick-add time ✓ ·
          BUG-011 Import <h1> ✓ · BUG-012 heading whitespace ✓ · BUG-013 Insurance counters ✓ ·
          BUG-015 Expenses count wording ✓ · BUG-016 pending-invite list+revoke ✓ ·
          BUG-009 not a bug · BUG-014 not a bug
NOT A BUG: BUG-006 (account edit button label) — re-verified, code + live both correct.
+ 5 observations (negative "total assets", budget summary spent=0, dev-server restarts,
  realtime WS drops, lingering closed Radix dialogs) — see qa/BUGS.md.

================================

CONSOLE ERRORS
Critical:  0   (the 400s in the buffer are this audit's own deliberate wrong-password attempts)
Warnings:  2 real, repeating —
             • `DialogContent requires a DialogTitle …`  (GlobalSearch / CommandDialog) — BUG-002
             • `Missing Description or aria-describedby for {DialogContent}` (same dialog)
           3 × `net::ERR_CONNECTION_CLOSED` over the session — no user-visible effect, consistent
             with the Supabase realtime WebSocket dropping in the pane (OBS-4).
Informational: React DevTools notice, Vite HMR connect logs.

================================

DATABASE (addendum): a legacy-localStorage vs server-data split still exists — the dashboard
  "Wealth Overview" panel reads `lib/*Store.ts` (localStorage) while the rest of the app reads
  Supabase. This is documented as in-progress migration work and is the cause of BUG-017.

================================

FINAL STATUS:  PARTIAL

  The single-account owner surface is thoroughly covered and healthy: all 45 routes render with
  zero runtime errors, full CRUD on 6 modules persists correctly, and authentication + app-lock
  are solid. What Stage 1 could NOT reach — multi-role authorization from the UI and at the API,
  a fresh sign-up + onboarding pass, billing/checkout, the AI/import/export pipelines, and every
  PO mutation — is a large slice of the product, so this is a partial pass, not a full one.

================================

PRODUCTION READY?  NO — not yet (but close)

REASON (updated after Stage 2):
  1. BUG-017 and the whole P3 batch are FIXED and on PR #6.
  2. BUG-001 is only half-closed: the interim fix stops new orphans, but the structural migration
     (and the cleanup of orphans already in the live DB) is BLOCKED on Supabase credentials. Apply
     that migration, re-test the repro, then it can be marked FIXED.
  3. Coverage gaps unchanged from Stage 1: a genuine multi-role permission test (owner vs admin vs
     viewer, UI and RLS), a fresh sign-up + onboarding run, and a billing path check — all need
     infrastructure this audit didn't have (service-role key / provisioned test accounts / a
     second real user).

  813 passing tests, 0 tsc/eslint errors. Once the BUG-001 migration lands and the multi-role +
  fresh-signup passes run, this is launch-ready.

================================
Full detail: qa/PROJECT-OVERVIEW.md · qa/PAGE-INVENTORY.md · qa/BUTTON-INVENTORY.md ·
             qa/FORM-INVENTORY.md · qa/WORKFLOW-INVENTORY.md · qa/API-INVENTORY.md · qa/BUGS.md
```
