# UX Report — journeys, flows and friction

> Journey-level review. Visual/accessibility findings live in
> [UI_UX_Report.md](./UI_UX_Report.md); rule-level truth in
> [Business_Rules.md](./Business_Rules.md). Audit 2026-08-04.
> The authenticated journeys below are reconstructed from source, not walked live (the app is
> behind login + a mandatory PIN). Marked ⚑ where a live walkthrough is required to confirm.

---

## 1. Journey: discover → sign up → first value

```
/  Landing ──"Start free"──> /auth?tab=signup ──> signUp() ──> "Check your email to confirm"
                                                          ──> (confirm) ──> /app
                                                          ──> PinSetup (mandatory)
                                                          ──> empty dashboard
```

| # | Finding | Sev |
|---|---|---|
| UX-001 | **The pricing shown is not the pricing sold.** The landing sells Roots / Canopy / Heritage at ₹0 / ₹299 / ₹899 (`site_settings.landing_pricing`); the billing system has Free / Pro at $0 / $9 (`plans`). A visitor who buys is charged a different amount for a differently-named plan. | **High** |
| UX-002 | **No onboarding whatsoever.** After the PIN screen the user lands on an empty dashboard with no tour, no checklist, no sample data and no "add your first account" prompt. Everything the product does is behind a sidebar the user has never seen. | **High** |
| UX-003 | **A mandatory PIN is the first thing a new user is asked for**, before they have entered a single rupee of data, with no explanation of what it protects and no way to skip or disable it later (`AppLockSettings` offers "Change PIN" only). This is a hard drop-off point. | **High** |
| UX-004 | **The PIN has no recovery path.** Nothing calls `clearPin`. A user who forgets it must clear site data — a step no consumer will find. | **High** |
| UX-005 | Email confirmation behaviour depends on a Supabase dashboard setting not tracked in this repo, while the UI always says "Check your email to confirm". If confirmation is off, the message is wrong; if SMTP is unconfigured, the mail never arrives and the user is stuck. ⚑ | High |
| UX-006 | No terms/privacy acceptance is presented or recorded at sign-up. | Medium (legal) |

## 2. Journey: sign in → daily use

| # | Finding | Sev |
|---|---|---|
| UX-007 | **"Remember this profile on this device" does nothing to the session.** It only saves the email into `localStorage["valar.profiles"]`. The session-only code path in `useAuth` reads a key nothing ever writes. Users believe they are controlling session lifetime; they are not. | High |
| UX-008 | **Every new tab demands the PIN.** The unlock flag is per-tab (`sessionStorage`). Opening a link in a new tab, or restoring a session, re-prompts. For a tool people keep pinned alongside a banking tab, this is constant friction. | High |
| UX-009 | **Switching tabs re-locks immediately** (`visibilitychange → hidden`) with no grace period. Copying an amount from your bank's tab and returning means re-entering the PIN — on the exact workflow the product exists to serve. | High |
| UX-010 | Saved-profile chips expose previously used email addresses to anyone who opens the app on a shared device, with no "clear all". | Medium |
| UX-011 | The top bar shows a static **"April 2026"** (UI-010) — users read it as the active period. | High |
| UX-012 | Two adjacent buttons, **Lock** and **Sign out**, with similar iconography and no explanation of the difference. | Low |

## 3. Journey: record a transaction

| # | Finding | Sev |
|---|---|---|
| UX-013 | Four different ways in — the header **Add** button, Ctrl+N, `QuickAddSheet`, and the full `TransactionDialog` from Expenses — with different field sets. Users cannot predict which one they will get. | Medium |
| UX-014 | **There is no transfer type.** Moving money between your own accounts must be entered as an expense *and* an income, which then distorts income totals, spending charts, savings rate and the budget. This is the single largest modelling gap for a personal-finance product. | **High** |
| UX-015 | Payment mode and account are stored inside the free-text description (`[UPI\|acc-id] …`). A user who begins a note with `[` corrupts their own account balance silently. | Medium |
| UX-016 | Deleting an account leaves every transaction still tagged with its id; the live balance simply stops being computed, with no warning at delete time. | Medium |
| UX-017 | Ctrl/Cmd+N is hijacked globally (UI-013). | Medium |

## 4. Journey: budgets and goals

| # | Finding | Sev |
|---|---|---|
| UX-018 | **`budgets.spent` is a number the client writes**, not a figure derived from transactions. Users reasonably expect spend to update as they log expenses; it does not, unless a code path happens to write it. Budget utilisation can be silently wrong. ⚑ | **High** |
| UX-019 | The Budget **Planner** tab's inputs live in `localStorage` — invisible to collaborators, lost on browser change, and indistinguishable in the UI from the saved Buckets tab beside it. | High |
| UX-020 | Goal contributions are a client-side increment. Two people contributing at once lose one update, and nothing prevents a goal exceeding its target or going negative. | Medium |
| UX-021 | No confirmation on deleting a goal or a budget bucket, and no undo. | Medium |

## 5. Journey: investments and net worth

| # | Finding | Sev |
|---|---|---|
| UX-022 | **The net-worth trend chart is synthetic.** `netWorthStore.seedHistory` fabricates six months of history, and the 3M/6M/All filter operates on it. Users are shown a wealth trajectory that was invented by the app. In a financial product this is the most serious trust issue in the report. | **Critical (trust)** |
| UX-023 | "Live prices" require a ticker or AMFI scheme code the user must know and type; there is no symbol search. Without one, the holding silently shows its stored value with no indication that it is not live. | High |
| UX-024 | The `live-price` edge function is **not deployed to the dev project**, so the Investments page logs CORS errors and every price falls back to stored values — with no user-visible explanation. ⚑ | High |
| UX-025 | `MatrixFilter` on the Portfolio list defaults to the **"today"** preset filtered by `savedAt`, so a user with older holdings sees an empty portfolio and concludes their data is gone. | High |
| UX-026 | The Investments card subtitle reads "Income + savings" while the value is portfolio value — a mislabelled metric. | Medium |

## 6. Journey: collaboration

| # | Finding | Sev |
|---|---|---|
| UX-027 | **You can only invite someone who already has a FinRoot account.** The error is `No account exists for <email>, ask them to sign up first` — the owner must ask them out-of-band to sign up, then return and invite. There is no invite email, no invite link, no pending state. | **High** |
| UX-028 | Invitation is instant and silent to the owner's expectations — `status` goes straight to `active`, so the invitee is inside the workspace with no acceptance step. | Medium |
| UX-029 | Granting or denying a module changes **only navigation**. A "viewer" you restricted to Dashboard can still pull every table over the API. The permission matrix in Workspace implies enforcement it does not have. | **High** |
| UX-030 | **There is no workspace switcher.** `setCurrentTenantId` exists and nothing calls it. A user in two workspaces is pinned to the first — and because of KI-001 sees both workspaces' data merged in every list and total. | **Critical** |
| UX-031 | The owner's "view as collaborator" shows a "Restricted view" banner but is a client-side simulation only. | Low |
| UX-032 | Removing a member is a hard delete with a confirm but no undo and no notification to the removed person. | Medium |

## 7. Journey: subscription and billing

| # | Finding | Sev |
|---|---|---|
| UX-033 | Coupons can be created, are shown in a banner and can be copied — but **no code applies them to a Paddle checkout**. The user copies a code and has nowhere to paste it. | **High** |
| UX-034 | Plan gating removes menu items with no explanation. A Free user simply does not see Investments; there is no "upgrade to unlock" state, so the paywall never converts. | High |
| UX-035 | The expired-subscription banner says "some features are limited" without saying which. | Medium |
| UX-036 | Expiry is evaluated lazily. `subscriptions.status` can read `active` while the tenant has effectively dropped to Free, so support and the PO console can disagree with the user's experience. | Medium |
| UX-037 | `billing-api` resolves by `user_id` rather than `tenant_id`, so a user owning two workspaces can cancel the wrong subscription from the Billing page. | High |

## 8. Journey: import / export

| # | Finding | Sev |
|---|---|---|
| UX-038 | Import is genuinely good — five datasets, downloadable CSV templates, a column hint, per-broker instructions and a preview. Best-executed flow in the product ✔ | — |
| UX-039 | Import is **append-only with no de-duplication**. Running the same file twice silently doubles every row. The "Write mode" control was removed because it was non-functional; nothing replaced it. | **High** |
| UX-040 | `/app/export` has no `MenuGuard`, so a `viewer` can export the entire workspace. | High |
| UX-041 | A 200-row import fires 200 realtime toasts (PERF-008). | Medium |

## 9. Cross-cutting UX

| # | Finding | Sev |
|---|---|---|
| UX-042 | **Users see raw Postgres errors** — constraint names, table names, "row-level security policy" (UI-012). | High |
| UX-043 | **Several features are silently device-local**: recurring-reminder settings, custom categories and subcategories, account balance history, the budget planner, base currency, dashboard layout. Nothing in the UI distinguishes synced data from device data. Switching browsers loses them with no warning. | **High** |
| UX-044 | No global undo and no soft delete anywhere. Deleting a workspace destroys all financial history immediately and irreversibly. | High |
| UX-045 | Browser refresh, back button and deep links behave correctly ✔ (React Router, no modal-in-URL state). |  ✔ |
| UX-046 | Multiple tabs: data stays consistent via React Query + realtime ✔, but each tab locks independently (UX-008). | Medium |
| UX-047 | Session expiry has no graceful path — in-flight queries fail with generic toasts, then a redirect to `/auth` loses unsaved form state. | Medium |
| UX-048 | Search (Ctrl+K) is discoverable and good ✔; there is no saved-filter or saved-view concept anywhere. | Low |
| UX-049 | No in-app help, no empty-state links to docs, no support contact. The landing footer's contact is the placeholder `hello@finroots.app`. | Medium |

---

## 10. Top 10 UX fixes by value

| # | Fix | Why |
|---|---|---|
| 1 | Replace the synthetic net-worth history with real snapshots, or remove the chart (UX-022) | fabricated financial data destroys trust |
| 2 | Reconcile landing pricing with the `plans` table (UX-001) | you are advertising products you cannot sell |
| 3 | Add a workspace switcher **after** fixing KI-001 (UX-030) | multi-workspace is currently broken, not just awkward |
| 4 | Add a transfer transaction type (UX-014) | closes the biggest modelling gap |
| 5 | Rethink the PIN: optional, explained, with a grace period and a reset path (UX-003/004/008/009) | it is the largest daily friction and the biggest onboarding drop |
| 6 | Invite-by-email with a real invite link and a pending state (UX-027) | collaboration is effectively unusable today |
| 7 | Import de-duplication or an idempotency key (UX-039) | silent data doubling is a support nightmare |
| 8 | Move device-local features to the database, and label anything that stays local (UX-043/019) | users lose work without knowing why |
| 9 | Friendly error mapper + an error boundary (UX-042) | raw SQL errors are not a product |
| 10 | Onboarding: a 3-step checklist and an "upgrade to unlock" state on gated menus (UX-002/034) | activation and conversion |
