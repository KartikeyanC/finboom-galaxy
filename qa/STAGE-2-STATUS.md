# FinRoot — Stage 2 (Fix + Regression) status

Branch: `fix/qa-stage-2` (off `master` @ `2a4b0d3`) · started 2026-09-07 · **round 2 added 2026-09-08**.
Round 1 scope: P2 + P3 + the P4 batch. Round 2 (user asked): BUG-006, 009, 014, 016 and the full BUG-001.

## Gates after the fixes

| Gate | Result |
|---|---|
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 23 warnings (baseline was 24 — all pre-existing) |
| `npm run test` (vitest) | **813 / 813 passing**, 57 files |
| Live smoke (dev server) | BUG-017, BUG-002, BUG-003, BUG-005, BUG-007 re-verified in the browser; no console errors on `/app`, `/app/accounts`, `/app/goals`, `/app/investments`, `/app/profile` |

## Fixed

| Bug | Sev | Commit subject | Verified |
|---|---|---|---|
| BUG-017 | P2 | fix(dashboard): one source of truth for the net-worth figure | ✅ live — top card, Wealth Overview and `/app/net-worth` all read −₹8,128 |
| BUG-001 | P2 | fix(income): remove the paired recurring item when a stream is deleted | code + tests (`useRecurring.test.ts` green); needs a manual add-stream→delete-stream check |
| BUG-002 | P3 | fix(a11y): give the command palette dialog an accessible name | ✅ live — `aria-labelledby` → "Search", no console error on Ctrl+K |
| BUG-003 | P3 | fix(accounts): confirm before deleting … | ✅ live — AlertDialog "Delete "HDFC Savings"?", trigger `aria-label` |
| BUG-018 | P3 | … drop the mock archive button | ✅ live — 0 archive buttons on the card |
| BUG-004 | P3 | fix(a11y): label the goal card action buttons | code — aria-labels added |
| BUG-005 | P3 | fix(budget): reject a blank or zero allocation | ✅ live — "Enter an allocation greater than zero", no ₹0 row |
| BUG-007 | P3 | fix(profile): plan card reflects the real plan catalogue | ✅ live — Canopy user sees "Manage plan", no "Upgrade to Pro ₹199" |
| BUG-008 | P4 | fix(auth): only open the reset form for a genuine recovery link | code |
| BUG-010 | P4 | fix(quick-add): stamp a sensible time on date-only entries | code |
| BUG-011 | P4 | fix(a11y): page headings — add the missing `<h1>` … | code (Import) |
| BUG-012 | P4 | … drop stray whitespace | code (Trips, Calculator, Reminders, Billing, Settings, Notifications, Profile) |
| BUG-013 | P4 | fix(insurance): don't zero-pad the KPI counts | code |
| BUG-015 | P4 | fix(expenses): clarify the ledger entry count | code |

## Round 2 (2026-09-08)

| Bug | Outcome | Detail |
|---|---|---|
| **BUG-006** | **Not a bug — retracted** | Re-verified a 3rd time: "Edit account" → heading "Edit Account", button "Save Changes" + Cancel. Correct in code and live. No change. |
| **BUG-009** | **Not a bug** | Verified live in a foreground pane: the Quick Add sheet closes ~700 ms after "Record Expense" (the deliberate checkmark delay) and re-opens empty. The Stage 1 "stayed open" reading was hidden-tab `setTimeout` throttling. No change. |
| **BUG-014** | **Not a bug** | Root cause found: `Landing.tsx` sets `document.documentElement.style.scrollBehavior = "smooth"`. The automated pane doesn't animate CSS smooth-scroll, so programmatic `window.scrollTo` looked frozen. `window.scroll({behavior:"instant"})` works, `/privacy` scrolls fine in the same pane, and every landing section (hero → product → pricing → FAQ → CTA) renders. A real user's wheel/keyboard scroll is unaffected by `scroll-behavior`. No change. |
| **BUG-016** | **Fixed** | `feat(workspace): pending-invitations list with revoke`. Uses the already-shipped `list_invitations` / `revoke_invitation` RPCs — **no migration**. Verified live: the section listed the leftover Stage 1 invite, Revoke removed it, persisted through reload. |
| **BUG-001 (full)** | **Migration written** | `supabase/migrations/20260907190000_bug001_link_recurring_to_income_stream.sql` — FK + `ON DELETE CASCADE`, backfill, orphan cleanup. **Not applied** (no `SUPABASE_ACCESS_TOKEN` this session). The round-1 interim fix (`useIncomeStreams.remove()` deletes the twin by name+amount) already prevents new orphans and stays correct until the migration lands. |

## Carried forward

| Item | Reason |
|---|---|
| **Apply the BUG-001 migration** | Needs `SUPABASE_ACCESS_TOKEN` + `supabase db push` + `supabase gen types`, then a 1-line follow-up to drop the now-redundant manual delete in `useIncomeStreams.remove()`. |
| OBS-1 / OBS-2 / OBS-3 | Product / environment questions, not code defects. |

## Notes for the reviewer

- **BUG-001** is the interim fix (delete the twin recurring item on stream delete). The fuller fix — an `income_stream_id` FK on `recurring_items` with `ON DELETE CASCADE` — needs a migration + `types.ts` regen, which needs a `SUPABASE_ACCESS_TOKEN` and a write to the live project. See `qa/FIX-GUIDE.md` §BUG-001 Option B. **Existing orphans** in the live DB are not cleaned by this change; run the SELECT-then-DELETE snippet in the FIX-GUIDE once.
- **BUG-017** also introduced `src/hooks/useNetWorthSummary.ts` and made `NetWorthTrend` presentational. `DashboardWealth` was already internally consistent (its memo has the right deps) and was left untouched.
- The `fix/qa-stage-2` branch also carries the pre-existing uncommitted branding WIP that was in the tree — those files are **not** part of any Stage 2 commit. Rebase/cherry-pick accordingly if the branding work lands separately.
