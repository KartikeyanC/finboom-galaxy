# Bug Fix Progress — 2026-08-20

> Companion to [BUG_TRACKER.md](./BUG_TRACKER.md), not a replacement for it. That file has
> accumulated 118 numbered bugs across six weeks of sessions and its own status markers have
> drifted badly in places — several entries still read `OPEN` in its frozen tables long after
> being fixed elsewhere in the same file. This document is the result of one pass, done today,
> that: (1) read every bug's *latest* mention rather than its first, (2) verified a sample against
> the actual source tree rather than trusting the write-up, and (3) fixed what was still genuinely
> open and fixable from this checkout.
>
> **Environment for this pass:** git repository confirmed real (`git log` shows 3 commits), no
> remote configured, no `SUPABASE_ACCESS_TOKEN` in the shell, Docker engine not running. That means
> anything requiring `supabase db push`, `supabase functions deploy`, or a hosted CI run was
> out of reach here — those are marked **BLOCKED (deploy access)** below, matching the same gap
> already documented for BUG-006/007/008/104/109/113/116 in BUG_TRACKER.md.
>
> `tsc` 0 (now under **full `strict: true`**, see BUG-055) · `eslint` 0 errors / 25 warnings
> (unchanged baseline) · `vitest` **640/640** (was 631; +9 from the new `signInLockout.test.ts`) ·
> `vite build` clean.

## Fixed this pass

| Bug | Title | What was done | Verified |
|---|---|---|---|
| BUG-055 | `strict`/`strictNullChecks`/`noImplicitAny` all off | Flipped `strict: true` in both `tsconfig.app.json` and the root `tsconfig.json`. Fixed the 16 real errors that surfaced: 5 Recharts `activeShape` callbacks narrowed at one shared boundary (`chartShapes.tsx`) instead of five; 4 genuine `null`-vs-`undefined` RPC-arg mismatches (`useBudgets.ts`, `useOnboarding.ts` — both were passing `null` to a param whose generated type only allows `undefined`, functionally identical since the RPC has `DEFAULT NULL`); a real latent bug in `pricing.ts`'s `normalizePricing` (`{features: [], ...c}` could have its default silently discarded by a spread that runs *after* it — reordered to `{...c, features: c.features ?? []}`); a real latent bug in `Insurance.tsx`/`insuranceStore.ts` (`documentDataUrl` was typed `string \| undefined` but the code explicitly branches on `=== null` to mean "clear the legacy doc" — widened the type to match the real contract, not just cast around it); a genuine call-site bug in `PoPlans.tsx` (was sending `null` for "clear the Paddle price id" when the RPC's own `NULLIF(trim(...), '')` expects an **empty string**, not null — passing `null` there always fell into "leave unchanged", so a PO trying to clear an id would have failed silently); one signature inconsistency in `po_create_coupon` (`p_description`/`p_discount_percent` are nullable columns but were never given `DEFAULT NULL` like the third param — new migration `20260820130000_bug055_coupon_rpc_optional_args.sql`, no behavior change, plus a temporary cast at the one call site until types.ts is regenerated); and a missing twin declaration for the plain-JS `scripts/storage-purge.mjs` a test imports (`scripts/storage-purge.d.mts`). | `tsc -p tsconfig.app.json --noEmit` exits 0 under the new `strict: true`; full `vitest` run 640/640; `eslint` unchanged at 0 errors/25 warnings; `vite build` clean (see below) |
| BUG-101 | No rate limiting on `signInWithPassword`, for any account | Added `src/lib/signInLockout.ts`: a client-side-only deterrent (localStorage, keyed per email) that locks further attempts after 5 failures in a 15-minute window, with a doubling backoff (30s → 5min cap), mirroring `po-auth`'s real server-side lockout shape so the two read the same to a user. Wired into `Auth.tsx`'s `handleSignIn` — checked before the network call, recorded only on a genuine `invalid login/credentials` error (not on network/other errors), cleared on success. Registered in `deviceLocal.ts` per that file's own guard test. **This is explicitly NOT the real fix** — it's bypassable by clearing storage, private browsing, or calling the API directly. The real fix needs either Supabase Auth's own rate-limit settings (dashboard/Management API access this session doesn't have) or routing sign-in through a custom edge function (deploy-blocked, same as BUG-006). Documented as a deterrent in the module's own header comment so nobody mistakes it for the boundary. | New `signInLockout.test.ts`, 9/9 passing, covering the threshold, the window reset, per-email isolation, and lock expiry |
| BUG-056 | PO console has no mobile layout | `PoShell.tsx`: below `md` the fixed `w-60` sidebar is now hidden and replaced by a top bar with a hamburger button opening a `Sheet` (the same shadcn primitive already used elsewhere in the app — `QuickAddSheet`, `ManageCategoriesSheet`) containing the identical nav list, extracted into a shared `PoNav` component so the desktop and mobile lists cannot drift apart. | `tsc`/`vitest`/`eslint` clean; live-measured the trigger is a real, tappable button; the desktop `<aside>` path (`hidden md:flex`) is visually unchanged — confirmed by reading the diff, not just trusting the class rename |
| BUG-068 | Page container widths inconsistent (1000/1200/1400) | `Reminders.tsx` (was `max-w-[1000px]`) and `Trips.tsx` (was `max-w-[1200px]`) now match the `max-w-[1400px]` every other record-list page uses. Left `Calculator.tsx`, `WorkspaceManage.tsx` and `TripWorkspace.tsx` alone — narrower forms/detail views, not what the bug named, and not an oversight worth guessing at | `tsc` clean; a plain class-string change with no other width-dependent logic in either file |
| BUG-081 | A tenant-level module denial does not bind the workspace owner | `get_effective_menus()` returned the plan's full menu set immediately for `role = 'owner'`, before even reading `tenants.menu_overrides->'deny'` — so a PO restricting a tenant's modules left the owner with full access (and, since Stage 2.15, full RLS-backed data access on the "denied" tables too). New migration `20260820120000_bug081_owner_tenant_deny.sql` moves the tenant-level deny application before the owner short-circuit; member-level `allow` overrides still never apply to the owner (an owner must only be narrowed by the PO's tenant-wide control, never by a collaborator-scoped override). **BLOCKED (deploy access)** — code is correct and self-contained, but cannot be pushed or exercised live from this checkout | Migration reviewed by hand against the original function line-by-line; the only behavioral change is the position of one `IF` block |
| — | 4 more strict-mode findings, folded into the BUG-055 row above rather than filed separately since they were only ever visible *because* of enabling strict mode | See the BUG-055 row | — |

## Investigated, found already fixed (tracker was stale)

These were carrying an `OPEN` marker in BUG_TRACKER.md's frozen tables but the underlying code
already fixes them — verified by reading the current source, not by trusting an intervening note.
No action was needed; they are listed so nobody re-investigates them from a stale starting point.

| Bug | Title | What the code actually shows today |
|---|---|---|
| BUG-028 | 36px horizontal overflow on mobile | Live-measured in a real browser at 375px, both on direct load and on a resize-after-load (the exact repro the bug specifies): `scrollWidth - clientWidth = 0`. The marquee and aurora-blob elements the bug suspected are both correctly clipped by an `overflow-hidden` ancestor. Matches BUG_TRACKER's own 2026-08-12 reconciliation note that this was fixed and covered by `e2e/finroot.spec.ts` |
| BUG-044 | Live prices: one request per holding per minute, unbatched | `livePrices.ts`'s `planBatch()` already dedupes by symbol and `fetchPrices()` sends one POST for the whole outstanding set, with a module-level memo cache honoring each provider's TTL and an `AbortController` cancelling in-flight requests on unmount |
| BUG-045 | Dashboard fetches all history, no pagination | The dashboard's own aggregate now goes through the `dashboard_summary()` RPC (Stage 4.2, and the subject of BUG-114's fix), not a client-side reduction over the full transaction table. `useTransactions()` takes an opt-in `period` window used by every ledger list view (`ExpenseLedger`, `TransactionsTable`); the callers still requesting the unbounded default (`Export`, `GlobalSearch`, `AccountsManager`, `Investments`) do so by design, per the hook's own comment, because a CSV export or a running account balance genuinely needs full history |
| BUG-050 | Hero `h1` reads "commandcenter" | `KineticHeadline.tsx` already inserts real whitespace between the two lines, with a comment crediting the fix to Stage 4.9 |
| BUG-051 | Hero `h1` starts at `opacity: 0` | Same file: a `useReducedMotion()` branch renders the headline immediately and fully opaque, skipping the animation mechanism entirely, also credited to Stage 4.9 |
| BUG-052 | No `<main>` landmark, no skip link | `SkipLink` is now used in 8 files including `Auth.tsx`, `PublicLayout.tsx`, `Landing.tsx`, `DashboardLayout.tsx` and `PoShell.tsx` — this was the side effect of the BUG-093 fix, just never checked off here |
| BUG-072 | `demat_accounts` has no `user_id` column | The migration (`20260701130000_demat_accounts.sql`) already scopes it by `tenant_id` with the same `is_tenant_member()` RLS policies every other tenant table uses — this bug's premise no longer matches the schema |
| BUG-075 | Preloader overlay still mounted after load | `effects.tsx`'s `Preloader` renders `{!gone && (...)}` — once `gone` flips true the component fully unmounts (after its exit animation via `AnimatePresence`), it is not merely hidden with CSS |

## Confirmed still open — not fixable from this checkout

| Bug | Title | Why it's blocked |
|---|---|---|
| BUG-006, 007, 008, 104, 109, 113, 116 | po-auth lockout/disclosure, webhook hardening, recurring double-post, PO audit logging, invite notification, webhook `user_id` fallback | Already fixed in code per BUG_TRACKER.md; **not deployed**. No `SUPABASE_ACCESS_TOKEN` in this session to run `supabase functions deploy` / `supabase db push`. Re-confirmed the token is genuinely absent (`env \| grep -i supabase` empty, `supabase projects list` returns `LegacyPlatformAuthRequiredError`) rather than assumed |
| BUG-081 (this pass) | Owner bypasses tenant-level module deny | Same blocker — migration written, cannot be pushed |
| BUG-115 (frontend half) | Menu-resolution-error UI | Code already landed 2026-08-18 per BUG_TRACKER.md; needs a frontend deploy, not a database one, but still needs *some* hosting target this checkout has none of |
| BUG-030 | No backups configured | Needs a paid Supabase tier and the account owner's own approval — explicitly called out in CLAUDE.md's "no new paid services without explicit approval" rule. Not something to enable unilaterally |
| BUG-031 | No CI actually runs | `.github/workflows/ci.yml` exists and the repo is now real git — confirmed via `git log` (3 commits) — but `git remote -v` is empty. GitHub Actions has nothing to run against without a hosted remote, and creating one and pushing this codebase is a "pushes code / creates shared state" action that needs the user's explicit go-ahead, not something to do on a bug-fixing pass |
| BUG-058 | CSP still Report-Only | Deliberately left alone. The blocking risk is specifically the Paddle checkout flow, which needs a real signed-in session against a live deployment to watch for console violations before flipping an enforcing CSP on a revenue path — not reproducible from an unauthenticated local dev server |
| BUG-111 | `demo@finroot.app` can't complete its own password reset | External to this codebase — looks like a mail-provider bounce-suppression flag on an address that's received dozens of confirmation emails with no real inbox behind it. Needs Supabase Auth dashboard/log access this session doesn't have |

## Not attempted — narrower than a full sweep

| Bug | Title | Note |
|---|---|---|
| BUG-053 | Landing tap targets / text under 44px / 12px | Fixed the one clear, real, non-decorative offender found: the mobile hamburger `Menu` button (36×36 → 44×44, `p-2` → `p-3`). Live-measured the fix. Did **not** touch the `GlassDashboard` mockup's mini nav icons — they are `tabIndex={-1}` by deliberate design (documented in-file as "scenery," matching the same reasoning already applied to the Voices carousel dots in BUG-095) and enlarging them would visibly break the intended miniature-app-preview aesthetic. The original finding's "21/42 landing tap targets" was a 2026-08-04 blind sweep; a full re-audit against the current page is a bigger task than one bug in a mixed pass, and guessing at 20 more small icon/text changes without re-measuring each felt worse than being explicit about the gap |

## New migrations added this pass (undeployed)

- `supabase/migrations/20260820120000_bug081_owner_tenant_deny.sql`
- `supabase/migrations/20260820130000_bug055_coupon_rpc_optional_args.sql`

Both reviewed by hand (no Docker/local Supabase stack available to `supabase db reset --local`
against them this session — same gap CLAUDE.md already documents). Whoever next has
`SUPABASE_ACCESS_TOKEN`: push these two alongside the existing undeployed set, then regenerate
`types.ts` and drop the temporary cast in `PoCoupons.tsx` (search `TODO: drop these two casts`).
