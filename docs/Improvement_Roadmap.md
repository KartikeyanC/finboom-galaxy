# Improvement Roadmap

> Sequenced plan derived from the Phase 1 audit (2026-08-04).
> **Nothing here has been implemented** — Phase 1 was documentation only.
> Effort: XS < 2 h · S ½–1 d · M 2–4 d · L 1–2 w · XL > 2 w.

> ⚠️ **Reconstructed 2026-08-12** after a failed write truncated this file to zero bytes. It was
> rebuilt by replaying every recorded edit from the session transcripts onto the original document,
> then re-adding the notes those edits had inserted. The Stage 0–3 tables, Stage 4 notes and the
> whole of Stage 5 are believed complete; a few Stage-4 status cells may read as they did before
> their last small edit. Nothing was invented.

---

## Sequencing principle

Build the safety net **before** touching security, because every security fix lands in a
codebase where `tsc` fails, lint fails, coverage is ~2 %, nothing gates a change and there are
no backups. Fixing the paywall without CI risks trading a known bug for an unknown one.

```
Stage 0  Safety net        →  can we detect a regression?
Stage 1  Stop the bleeding →  close the exploitable holes
Stage 2  Correctness       →  make the numbers true
Stage 3  Durability        →  stop losing user work
Stage 4  Scale & polish    →  make it fast and pleasant
Stage 5  Commercial        →  make it sellable
```

---

## Stage 0 — Safety net · 2–3 days

| # | Task | Effort | Ref |
|---|---|:-:|---|
| 0.1 | Fix the 10 `tsc` errors: 4 template-literal predicates in `importParsers.ts`; regenerate `types.ts` for the 6 in `PoSecurity.tsx` | S | BUG-014/015 |
| 0.2 | Fix the 11 ESLint errors (6 `any`, 1 unused expression, 1 `require`) | S | BUG-054 |
| 0.3 | **Add CI** — typecheck, lint, vitest, `npm audit --audit-level=high`, build, bundle budget, Playwright | M | BUG-031 |
| 0.4 | Add a React `ErrorBoundary` above `<Routes>` | XS | BUG-013 |
| 0.5 | Wire Sentry (or equivalent): client + all five edge functions; alert on error-rate spikes | S | BUG-013 |
| 0.6 | Enable Supabase PITR on live; add a nightly `pg_dump` to object storage; **rehearse a restore** | M | BUG-030 |
| 0.7 | Remove `project_id` from `supabase/config.toml`; require `--project-ref` everywhere in the docs | XS | BUG-033 |
| 0.8 | Reconcile and record the live project's applied-migration state | M | BUG-034 |
| 0.9 | Add `.env*` to `.gitignore`; rotate the `.env.e2e` account password | XS | BUG-069 |
| 0.10 | Create the six dev test accounts + the integration harness (3 role JWTs) | M | QA blockers |

**Exit:** CI green on every push; errors reach a dashboard; a restore has been performed.

## Stage 1 — Stop the bleeding · 1 week

### 1a · One migration closes four findings (XS)

```sql
-- BUG-001  plan self-upgrade
DROP POLICY IF EXISTS sub_update ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;

-- BUG-003 / BUG-004  default PUBLIC EXECUTE
REVOKE EXECUTE ON FUNCTION public.log_audit(uuid,text,text,text,jsonb)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid,uuid,text,text,text,jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_subscriptions()                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_expiring_subscriptions(int)                   FROM PUBLIC, anon, authenticated;

-- BUG-041  orphan tenant creation
DROP POLICY IF EXISTS tenants_insert ON public.tenants;

-- BUG-009  the "Other" trip type
ALTER TABLE public.trips DROP CONSTRAINT trips_kind_check;
ALTER TABLE public.trips ADD  CONSTRAINT trips_kind_check
  CHECK (kind IN ('solo','friends','family','other'));
```

### 1b · Remaining stage-1 work

| # | Task | Effort | Ref |
|---|---|:-:|---|
| 1.1 | **Undeploy `send-email`**, then rebuild it as `{template, tenant_id, params}` with server-resolved recipients + per-user rate limit | M | BUG-005 |
| 1.2 | Rate-limit `po-auth` (per-IP + per-identifier token bucket, lockout, uniform responses) and `resetPasswordForEmail` | M | BUG-006/007 |
| 1.3 | Webhook hardening: 5-minute `ts` freshness window, `processed_webhooks(event_id)` unique table, constant-time HMAC compare | S | BUG-008 |
| 1.4 | Audit-log every PO sign-in attempt, success and failure | S | BUG-006 |
| 1.5 | `npm audit fix`; drop, replace or sandbox `xlsx`; fix its static import in `importParsers.ts` | M | BUG-032/047 |
| 1.6 | Security headers via `vercel.json` / `_headers`: CSP, HSTS, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` | S | BUG-058 |
| 1.7 | Replace `*` CORS with an origin allow-list on all five edge functions | XS | — |
| 1.8 | `MenuGuard` on `/app/export` and `/app/billing` | XS | BUG-022 |
| 1.9 | Make `AccessContext` fail **closed** | S | BUG-042 |
| 1.10 | Write the SEC-T01…T20 negative suite and put it in CI | M | Testing plan §6 |

**Exit:** every SEC-T case passes; no exploit in this audit reproduces.

🔴 **Stage 1b was never finished, and was being reported as complete — corrected 2026-08-12 by
reading the edge functions rather than the tracker.** Still open: **1.1** (`send-email` unrebuilt;
safe only because it is not deployed), **1.2** (`po-auth` has no rate limit, no lockout, and returns
404 vs 200 so it still discloses which identifiers are Product Owners — and the secret it guards
grants platform admin), **1.3** (`payments-webhook` never checks the `ts` freshness window, has no
`processed_webhooks` table, and compares signatures with `hex === h1` rather than in constant time),
**1.4** (no PO sign-in attempt is audited), **1.7** (all five functions still send
`Access-Control-Allow-Origin: *`). **1.5** is partial — `xlsx` is still statically imported in
`importParsers.ts` and has no upstream fix. **1.10** (the SEC-T01…T20 negative suite) was never written either — the SEC module still shows 0 of 20
cases run in [QA_PROGRESS.md](./QA_PROGRESS.md). **1.6, 1.8 and 1.9 are done.** Evidence in
[BUG_TRACKER.md](./BUG_TRACKER.md#reconciliation--2026-08-12).

## Stage 2 — Correctness · 2 weeks

| # | Task | Effort | Ref |
|---|---|:-:|---|
| 2.1 | **Explicit `tenant_id`** — thread `currentTenantId` into every insert and every select; add a `WITH CHECK` on the supplied value; keep the default as a backstop | L | BUG-002 |
| 2.2 | Add a workspace switcher (only after 2.1) | S | UX-030 |
| 2.3 | **Net-worth snapshots** — new `net_worth_snapshots` table + a daily job; remove `seedHistory`. If snapshots are not built, remove the trend chart rather than ship fabricated data | M | BUG-010 |
| 2.4 | Derive `budgets.spent` from `transactions` (view or trigger); stop writing it from the client | M | BUG-024 |
| 2.5 | Add a **transfer** transaction type, excluded from income/spend aggregates | M | BUG-025 |
| 2.6 | Move goal contributions and budget updates into `SECURITY DEFINER` RPCs with invariants (no negative, no overshoot, no lost update) | M | BUG-040 |
| 2.7 | Import de-duplication — per-row content hash or an import batch id with an idempotency check | M | BUG-017 |
| 2.8 | Make workspace suspension real — gate on `tenants.status = 'active'` | S | BUG-016 |
| 2.9 | `billing-api`: key on `tenant_id`, verify membership | S | BUG-023 |
| 2.10 | Reconcile landing pricing with `plans` — ideally drive the section from the table; add a test asserting they agree | M | BUG-019 |
| 2.11 | Coupons: wire to Paddle discounts, or remove the feature | M | BUG-018 ✅ done 2026-08-05 — took the **remove** branch: `PromoBanner`/`usePromo` deleted, PO editor gated behind `usePaymentsGateway()`. Table + RPCs kept so wiring to a real gateway is all that's needed to revive it. |
| 2.12 | Fix `bumpDate()` month-end rollover | XS | BUG-038 |
| 2.13 | Remove the hardcoded "April 2026" | XS | BUG-011 |
| 2.14 | Central error mapper (`toUserMessage`) replacing `toast.error(e.message)` everywhere | M | BUG-012 |
| 2.15 | **Decide and implement** the menu-vs-paywall contract (AZ-001) — document whichever is chosen | M | BUG-021 ✅ done 2026-08-05 — enforced in RLS via `has_menu()` on the 11 tables that map 1:1 to a menu; navigation-only for the `transactions`-backed menus; contract pinned by `src/lib/menuContract.ts` + tests. Exposed BUG-081/AZ-009. |
| 2.16 | Add a test asserting `all_feature_menus()` == `ACCESS_MENUS` ids | XS | AUTHZ-023 |

**Exit:** every FIN and TEN case passes; no user-visible number is derived from synthetic data.

**Stage 2 CLOSED 2026-08-05 — 16 / 16.** Gates at close: `tsc` exit 0 · `eslint` 0 errors / 27
pre-existing warnings · `vitest` **199 / 199** (17 files) · `vite build` green.
⚠️ Before the next FIN/TEN run, **pin the fixture tenant to a paid plan** — 2.15 made plan gating
real, and a fresh signup lands on Roots, which has no `net-worth` menu, so FIN-010 and FIN-011 now
fail against a default-plan fixture. See QA_PROGRESS "session 4".
Carried forward, not blockers: BUG-081/AZ-009 (tenant module denial does not bind the owner) and
BUG-073 (`hello@finroot.app` is still a placeholder, now also used by Billing's "Contact us").

## Stage 3 — Durability · 1–2 weeks

| # | Task | Effort | Ref |
|---|---|:-:|---|
| 3.1 | Migrate the ~~six~~ **five** device-local features to tenant tables: recurring reminders, custom categories, custom subcategories, ~~balance history (the table already exists)~~, budget planner, base currency | L | BUG-026/071 ✅ done 2026-08-06 — migration `20260806120000`. Four JSON-shaped settings → `tenant_settings`; recurring reminders → their own table (FK cascade). **Correction: balance history was never a target** — `account_balance_history` does not exist, its migration was deleted under BUG-071, so "the table already exists" was stale. See the note below. |
| 3.2 | Label anything that intentionally stays device-local | XS | UX-043 ✅ done 2026-08-06 — `src/lib/deviceLocal.ts` registers all 14 with a reason; `deviceLocal.test.ts` fails on any unregistered storage key; user-facing hints on Theme, Dashboard layout and Base currency. |
| 3.3 | Insurance documents and the branding logo → Supabase Storage with size caps and MIME validation | M | BUG-043 ✅ done 2026-08-06 — migrations `20260806130000` + `20260806140000`. Buckets `insurance-docs` (private, 10 MB, PDF/PNG/JPG/WebP) and `branding` (public, 2 MB, images); 8 storage policies; caps and MIME enforced by the bucket, not the client. Measured: the insurance list query went **200,588 → 389 bytes** for one policy with a 200 KB scan. |
| 3.4 | Promote the encoded `[Mode\|accountId]` description scheme to real columns (`account_id uuid REFERENCES accounts`, `payment_mode text`) with a backfill | L | BUG-039 ✅ done 2026-08-06 — migration `20260806150000`. Conservative backfill (strips the prefix only when the uuid resolves in the SAME tenant, or the tag is a known payment mode); balances identical before and after. Exposed and fixed **BUG-088**. |
| 3.5 | Soft-delete for tenants: 30-day window + export before purge | M | UX-044 |
| 3.6 | Retention policy + pruning for `audit_log`, `notifications`, `subscriptions.raw` | S | — |
| 3.7 | Schedule `expire_subscriptions()` and `notify_expiring_subscriptions()` via pg_cron | S | BUG-057 |
| 3.8 | Invite-by-email: pending invitations + a signup link | M | BUG-020 |

**Note on "balance history" (3.1).** The roadmap listed six features and said the table already
existed. It does not: `20260701120000_account_balance_history.sql` was deleted under BUG-071
(never applied anywhere, read by nothing, user-scoped rather than tenant-scoped), and the live
database has no such table. There is also no live localStorage store for it — the key does not
appear anywhere in `src/`. So 3.1 covered the five features that actually exist. **If per-account
balance history is still wanted it is a new feature, not a migration**, and it should be built on
the `net_worth_snapshots` pattern from 2.3 (a daily row per tenant) rather than the deleted design.

**Found during 3.3 — feeds 3.5 (tenant soft-delete).** `storage.objects` has no foreign key to
`tenants`, so deleting a workspace leaves its documents in the bucket forever. Verified: after the
throwaway tenants in the 3.3 test run were deleted, their objects were still present and had to be
removed by hand. Whatever 3.5 does on purge must delete the tenant's `insurance-docs/<tenant_id>/`
prefix explicitly — the database will not cascade it. Tracked as BUG-086.

**🔴 Then 3.5 discovered Postgres cannot do it either.** The first attempt had
`purge_tenant_storage()` run `DELETE FROM storage.objects`. Supabase installs a trigger that
forbids exactly that:

> `ERROR 42501: Direct deletion from storage tables is not allowed. Use the Storage API instead.`
> `HINT: This prevents accidental data loss from orphaned objects.` — `storage.protect_delete()`

The trigger is right: the row is only an index of object storage, so deleting it would orphan the
file. But because the storage step raised *before* the tenant delete, **the whole purge failed** —
a workspace past its 30 days was never purged at all. The test caught it; nothing shipped broken.

Migration `20260806200000` reshapes it: the purge **enqueues** the prefix in
`storage_purge_queue` and deletes the workspace. Draining the queue needs a service-role caller
speaking the Storage API. This is deliberately visible rather than silently swallowed —
`SELECT * FROM storage_purge_queue WHERE completed_at IS NULL` is the list of files that still
exist and should not, and `po_pending_storage_purges()` surfaces it.

⚠️ **BUG-086 is therefore closed in the database and OPEN for the files.** The remaining work is
one drain step — an edge function (they already hold `SUPABASE_SERVICE_ROLE_KEY`) or an operator
script — calling `complete_storage_purge(id)` when done. Until then a purged workspace's documents
survive in the bucket, which matters for a deletion request.

**Also removed while auditing device-local state:** `src/components/permissions/PermissionsCenter.tsx`
was dead code — imported nowhere since Workspace superseded it (2026-06-10) — and was the sole
owner of `finroot.permissions.dateLock`, a "date lock" presented as a permission but stored in the
user's own browser and never enforced server-side. Deleting the file removes the trap; if date
locking is wanted, it belongs in RLS.

## Stage 4 — Scale & polish · 1–2 weeks

| # | Task | Effort | Ref |
|---|---|:-:|---|
| 4.1 | Route-level `React.lazy` + `manualChunks` for recharts/framer-motion/xlsx → main chunk ≤ 250 kB gz | M | BUG-046 |
| 4.2 | Paginate `useTransactions`; `useInfiniteQuery` for the ledger; a `dashboard_summary()` aggregate RPC | L | BUG-045 ✅ done 2026-08-10 — `dashboard_summary()` + `budget_spend()` RPCs (migrations `20260810130000`–`170000`, all applied), and the ledger bounded by an explicit **period selector** rather than infinite scroll (see both notes below). **Measured in the running app: `/app` and `/app/expenses` now issue ZERO unbounded transaction queries** — previously every page did. 44 new tests, including parity tests holding each server aggregate to the client rule it replaced. |
| 4.3 | Batch + cache live prices; pause when the tab is hidden or the page is unmounted | M | BUG-044 ✅ done 2026-08-10, **deployed and verified against real market data.** One POST prices the whole portfolio; symbols deduped; `price_cache` table (migration `20260810120000`, applied) caches upstream by provider TTL — yahoo 60 s, mf 24 h; polling stops while the tab is hidden and on unmount. **30 holdings went from 43 200 invocations/day/tab to 1 440, and mutual funds from 1 440 upstream calls/day to 1.** 9 new hook tests. See the note below — the client and the function must ship together. |
| 4.4 | Composite indexes: `(tenant_id, type, occurred_at DESC)`, `(tenant_id, status)`, `(tenant_id, next_due_date)` | S | — |
| 4.5 | Virtualise lists over ~200 rows | M | PERF-009 ✅ done 2026-08-10 — `@tanstack/react-virtual` behind a **threshold-gated** hook (`hooks/useVirtualRows.ts` + `ui/virtual-spacer-row.tsx`), applied to TransactionsTable and the three import preview tables that can actually get long. **Measured in the app with a 5 000-row CSV: 13–26 rows in the DOM instead of 5 000**, and a 50-row list still renders whole with no scroll container. See the note below for what was deliberately left alone. |
| 4.6 | Fix the 36 px mobile overflow; extend the e2e test to post-load resize | S | BUG-028 |
| 4.7 | Raise `#5f6764` to ≥ 4.5:1; enforce a 12 px minimum body size; 44 px tap targets | S | BUG-029/053 |
| 4.8 | Add `<main>` + a skip link; ARIA for the custom controls (Smart Split, module grids, PIN/secret inputs) | M | BUG-052 |
| 4.9 | Fix the hero `h1` text and its initial visibility | XS | BUG-050/051 |
| 4.10 | Remove the Cmd+N hijack; silence self-originated realtime toasts | XS | BUG-048/049 |
| 4.11 | Self-host and subset fonts; drop the unused DM Serif | S | BUG-066 ✅ done 2026-08-10 — **five families were being fetched, two are actually rendered.** Space Grotesk + IBM Plex Sans are now self-hosted **variable** woff2 in `public/fonts` (`src/fonts.css`), latin + latin-ext only. Fira Sans, Inter and DM Serif Display deleted. **A first visit now fetches one 44 kB font instead of two cross-origin stylesheets and a fan-out of static weights**, and the CSP lost both Google origins. See the note below. |
| 4.12 | Delete dead code (`PermissionsCenter`, `FeatureShowcase`) and unused deps; settle on one lockfile; add `.nvmrc` | S | BUG-061/064/065 |
| 4.13 | Split the nine 30 kB+ files | L | BUG-055 ✅ **done — closed 2026-08-11, row corrected 2026-08-12.** Every hand-written source file is now under 30 kB; re-measured across `src/`, `e2e/` and `supabase/functions/` with 0 files over the line. The row and the note below described the half-finished state of 2026-08-10 for two days after the work was finished. See the note. |

**Fonts (4.11) — three of the five families were never rendered.** The audit only flagged DM Serif.
Counting actual usages found more:

| Family | Loaded from | Verdict |
|---|---|---|
| IBM Plex Sans | `index.html` `<link>` | **kept** — `--font-body`/`--font-display`, so all body text and every heading |
| Space Grotesk | `index.css` `@import` | **kept** — Tailwind's `font-display` class, 214 usages |
| Fira Sans | `index.html` `<link>` | **dropped** — only ever the fallback *behind* IBM Plex Sans, so it could never render |
| Inter | `index.css` `@import` | **dropped** — reachable only via Tailwind's `font-body` class, which has **zero** usages |
| DM Serif Display | `index.html` `<link>` | **dropped** — one decorative `"` on the landing page; a whole webfont for one glyph |

The two survivors are now **variable** fonts (`wght` 300–700 and 100–700) in `public/fonts`, so one
file per subset replaces the five static weights each family used to fan out into. Only `latin` and
`latin-ext` ship; `unicode-range` keeps `latin-ext` off a normal page load — though not for long, as
**₹ is U+20B9 and lives in `latin-ext`**, so any screen showing money pulls it in.

The `@import` was the worse of the two loaders and is the real win here: an `@import` inside the CSS
bundle is discovered only *after* that bundle downloads, so it queued a DNS + TLS + CSS + font chain
on a second origin before any text could paint. Measured on the landing page afterwards: **one font
request, `ibm-plex-sans-latin.woff2`, starting at 50 ms via `rel=preload`**, no duplicate fetch, and
zero requests to `fonts.googleapis.com` / `fonts.gstatic.com`.

Space Grotesk is deliberately **not** preloaded. Walking all 1010 rendered elements on the landing
page found **zero** that resolve to it — it only appears on `/app` — so preloading it would put
21 kB of contention on the LCP page to speed up a route many visitors never open. It loads from CSS
when the first dashboard heading renders, still well ahead of the cross-origin `@import` it replaced.

Two follow-on effects worth knowing: the CSP in `public/_headers` and `vercel.json` dropped
`fonts.googleapis.com` from `style-src` and `fonts.gstatic.com` from `font-src` — **putting any font
back on Google Fonts will now fail closed** — and because `public/` files are not hashed by Vite,
`/fonts/*` gets its own immutable cache rule and a filename must be changed by hand if a file ever is.

**Live prices (4.3) — the client and the edge function must deploy together.** The client now sends
`POST {symbols:[{provider,symbol}]}` and reads `{prices:{"provider:symbol":number|null}}`. The
function deployed before this change only understands the single-symbol `GET ?provider=&symbol=`
and answers `{price}`, so **a client on the new code talking to the old function gets no prices at
all** — every holding silently falls back to its stored book value, which looks like a flat market
rather than an outage. Deploy the function first, or in the same window:

```bash
supabase functions deploy live-price --project-ref ludbntvhagefadfkhrjj --no-verify-jwt --workdir <repo>
```

The GET form is retained in the new function, so the reverse pairing (old client, new function) is
safe — only the forward one is not.

Three caches were considered and only one of them works. An in-memory `Map` inside the edge function
is the obvious choice and is **useless here**: Deno Deploy isolates are ephemeral and numerous, so
with polls a minute apart the isolate has usually been recycled and the cache is cold exactly when
it would have paid off. A client-side memo helps only the tab that already fetched. So the real
cache is a **table**, `price_cache`, keyed `provider:symbol` and written only by the function under
`service_role` — RLS is on with **no policies**, so the browser cannot read it directly. The
client-side memo is kept as well, but only consulted on mount and on visibility-resume; an interval
tick always asks the server, or prices would never actually refresh.

One behaviour worth keeping: on an upstream failure the function serves the **stale** cached price
rather than null. Returning null makes the UI fall back to the stored purchase value, which reads to
a user as "the market did not move" — the least honest of the available answers.

**

**Dashboard aggregates (4.2) — the fetch hid behind two more hooks.** Moving the month totals into
`dashboard_summary()` and rewiring the three obvious widgets changed **nothing measurable**, because
both dashboards also call `useLiveAccountBalances`, which called `useTransactions()` and reduced the
full table for account balances — and `BudgetAllocation` → `useBudgetSpend` did the same again. The
reducers had moved off the fetch; the fetch had not moved. Chasing that to the end took two more
aggregates:

| Aggregate | Replaces | Shape |
|---|---|---|
| `monthly` | month totals + 6-month sparkbars | month × type × currency |
| `categories` | SpendingCategories, cash-flow in/out | category × type × currency, current month |
| `account_deltas` | `useLiveAccountBalances` | one net delta per account, all history |
| `budget_spend()` | `useBudgetSpend` | budget × category, each row's own period window |

`budget_spend` is a separate function because **the window is per budget row** — each carries its
own `period_start` and a weekly/monthly/yearly `period`, so there is no single range to group by.

Three decisions that are easy to get wrong later:

- **Totals come back per currency, unconverted.** The FX table lives in `src/lib/finance.ts`; if SQL
  converted too, that table would exist twice and the SQL copy is the one nobody would update.
- **Months bucket in the CALLER'S timezone.** `occurred_at` is timestamptz and the client buckets in
  local time. Proven, not assumed: `2026-07-31T19:00Z` buckets as **July under UTC and August under
  IST**, so a late-night transaction on the last of the month would land in the wrong month for
  every Indian user. The client sends `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **`account_deltas` and `budget_spend` sum currency-agnostically**, because the client code they
  replaced does. That is arguably wrong, but silently changing displayed balances inside a
  performance change is how people stop trusting the numbers. Fix it as its own piece of work, both
  sides together.

Measured payload for the dashboard's transaction data: the old `select *` costs **~558 bytes per
transaction** and grows forever; the two RPCs together return **736 bytes** and do not grow with row
count. At 5 000 transactions that is roughly 2.7 MB versus under 1 kB. **Caveat: this was measured
on 4 real rows** — seeding volume into the project was not authorised, so the per-row figure is
extrapolated rather than observed at scale.

**Still open — the ledger.** `useInfiniteQuery` for ExpenseLedger and TransactionsTable is NOT done,
because both filter, search, cross-filter and chart entirely on the client over the full result set.
Paginating them naively does not just show fewer rows: the search box would search only loaded
pages, the category dropdown would list only loaded categories, the pie chart would chart a
fraction, and "N entries in view" would be wrong. Doing it correctly means pushing every filter to
the server — or replacing infinite scroll with an explicit period selector, which keeps every
client-side filter honest within a stated window. That is a product decision, so it is recorded here
rather than made unilaterally.

**

**The ledger got a period selector, not infinite scroll (4.2).** ExpenseLedger and TransactionsTable
filter, search, cross-filter and chart **entirely on the client, over whatever they were handed**.
`useInfiniteQuery` would not simply have shown fewer rows: the search box would search only loaded
pages, the category dropdown would offer only loaded categories, the pie chart would chart a
fraction of the spending, and "N entries in view" would be a lie. Every one of those failures is
silent, which makes them worse than the slowness they fix.

So the bound is explicit instead. `lib/ledgerPeriod.ts` defines **This month / Last 3 months / This
year / All time**, applied as a `gte` at the server and surfaced as a control next to the ledger
heading, which now reads "142 entries in view · last 3 months". Every client-side filter stays
exactly correct *within a window the user can see and change*. "All time" remains available and is
labelled as the slow option rather than hidden.

The default is **3 months, not this month**: an empty ledger on the 2nd of a month reads as a broken
page. That is not hypothetical — with the demo data (July only) "This month" correctly renders
**"0 entries in view · this month"**, which is honest precisely because the header names the window.

The window is remembered per device and registered in `lib/deviceLocal.ts`: how much history to pull
is a fact about this browser and connection, not about the workspace, and syncing it would impose a
phone's answer on a desktop.

**And one more hiding place.** After all of the above, `/app` still fetched the whole table on every
page view — `GlobalSearch` is mounted by `DashboardLayout` on **every** page and called
`useTransactions()` eagerly. Its comment even said "only load when dialog is open"; nothing enforced
it. `useTransactions` now takes an `enabled` flag and search defers its fetch until the palette is
actually opened. Verified in the running app afterwards: `/app` issues **zero** requests to
`/rest/v1/transactions`, and `/app/expenses` issues exactly one, carrying `occurred_at=gte`

**Virtualisation (4.5) is threshold-gated, and not every list got it.** Windowing is not free: rows
that are not in the DOM cannot be found by the browser's find-in-page, cannot be selected and
copied, and do not print. On a table of financial figures those are features people actually reach
for. So `useVirtualRows` only engages **above 200 rows** — under that it returns `enabled: false`
and the table renders exactly as it did before, with no scroll container and no sticky header.

The audit named five lists. Only some of them can genuinely get long:

| List | Windowed? | Why |
|---|---|---|
| Import preview (expenses, income, asset queue) | **yes** | A bank or broker CSV is thousands of rows, and **every row here carries editable inputs** — the heaviest case in the app |
| `TransactionsTable` | **yes** | Long on "All time"; 4.2's period selector bounds the common case, this covers the rest |
| Import preview (goals, budgets) | no | Nobody imports two hundred savings goals |
| `RecurringList`, `PortfolioList` | no | Bounded by human behaviour — you do not have 200 recurring bills |
| `ExpenseLedger` | no | See below |

`ExpenseLedger` is the one worth explaining. It is not a flat list: rows are grouped into
collapsible day sections, each with `framer-motion` `layout` animations inside an `AnimatePresence`
with `mode="popLayout"`. Virtualising variable-height rows nested in animated collapsibles is a
fight that tends to produce measurement jank and scroll drift, and the payoff is smaller than it
looks because 4.2 already bounds that page to three months by default. Left alone deliberately; if
"All time" on a very long history becomes a real complaint, the day GROUP is the right unit to
window, not the row.

**Verified in the running app, not just reasoned about.** A 5 000-row CSV was fed to the importer
(client-side only — nothing was committed; the table still held its original 4 rows afterwards):

| Scroll position | Rows in DOM | Indices mounted | Spacers |
|---|---|---|---|
| Top | 13 | 0–12 | 1 (below) |
| Middle | 26 | 2486–2511 | 2 |
| Bottom | 13 | 4987–4999 | 1 (above) |

The spacer rows reserved 245 269 px of scroll height against a 466 px viewport. The control matters
as much as the measurement: the same table loaded with **50 rows rendered all 50**, with zero
spacers and no scroll container — the gate works in both directions.

**

**File splitting (4.13) is finished — and the size drop was not the point.**

> **Corrected 2026-08-12.** What follows was written on 2026-08-10, when four files were split and
> nine were still over the line. The rest were split on 2026-08-11 and **no hand-written source
> file exceeds 30 kB today** — re-measured across `src/`, `e2e/` and `supabase/functions/`. The
> first pass is kept below because the reasoning is still the useful part; the "still over 30 kB"
> list at the end of it is history, not a to-do.

The first four files were split along seams that already existed:

| File | Was | Now |
|---|---|---|
| `pages/Landing.tsx` | 73.8 kB | 63.1 kB |
| `components/import/TransactionImporter.tsx` | 47.7 kB | 38.2 kB |
| `components/accounts/AccountsManager.tsx` | 46.9 kB | 43.2 kB |
| `pages/Trips.tsx` | 41.7 kB | **29.6 kB** |

Seven modules came out: `landing/content.ts` (marketing copy, which changes on a completely
different cadence from the code it was wedged between), `landing/effects.tsx` (preloader, cursor,
aurora — also now the one place PERF-010 needs to look), `import/brokers.ts` (180 lines of pure
data), `import/AssetPreviewTable.tsx`, `trips/tripMeta.ts`, `trips/NewTripDialog.tsx`,
`trips/BucketRow.tsx`, and `accounts/accountMeta.ts`.

**The best of those was not about size at all.** `fromStored`/`toStored` in `accountMeta.ts` are the
single point where a saved account's fields can quietly go missing on the way to or from the
database, and they were buried a thousand lines inside a component where no test could reach them.
They now have 11, including one that fails if a field is added to one direction of the mapping and
not the other, and one that pins every text field to `""` rather than `undefined` — the difference
between a controlled and an uncontrolled input, which React warns about exactly once before
silently dropping the field.

**Still over 30 kB *at that point*:** Landing (63.1), AccountsManager (43.2), TransactionDialog
(39.0), TransactionImporter (38.2), PoTenants (35.7), Export (34.3), WorkspaceManage (32.6),
SmartSplit (31.3), PoSecurity (31.0). Landing and AccountsManager had obvious remaining seams (page
sections; `BalanceHistorySheet`). `TransactionDialog` was the awkward one — 900 lines of a single
component with no internal boundaries, so it needed actual redesign rather than extraction. **All
nine were dealt with on 2026-08-11**; today the largest of them is Landing at 23.6 kB.

A refactor that only typechecks proves nothing, so all three affected surfaces were re-checked in a
running browser: Landing renders every content section and its effects, Trips opens the extracted
`NewTripDialog` with its bucket rows intact, and the import page still lists the broker catalogue
from its new module. A fresh tab showed a clean console.

**

**Custom-control ARIA (4.8) — what was actually broken.** Every one of these was a control built
from `<button>` and bare `<input>` where the *state* lived only in a CSS class:

| Control | Defect | Fix |
|---|---|---|
| Smart Split "Split by" | three buttons, selection carried by background colour | `role="group"` + `aria-labelledby`, `aria-pressed` per option |
| Smart Split bucket kind (You/Office/Shared) | selection carried **only** by `background: km.color` — also a 1.4.1 failure | named group per bucket + `aria-pressed` |
| Smart Split inputs (×6) | **no accessible name at all** — "edit text" ×6 | `aria-label`, including the unit, since one box means ₹ / % / × by mode |
| PO module grid | 14 toggles with no pressed state; the count changed silently | `role="group"`, `aria-pressed`, `aria-live="polite"` on the counter |
| PinSetup | labels had **no `htmlFor`** and inputs no `id` — unassociated | `htmlFor`/`id`, `maxLength`, `aria-describedby` hint, `aria-pressed` on 4/6 |
| PO secret code | live `n/16` counter unassociated | `aria-describedby` |

Two judgement calls worth recording. **`aria-pressed`, not `role="radiogroup"`**: a real radio group
must implement arrow-key navigation and a roving tabindex, and declaring the role without them is
worse than leaving it off — it promises keyboard behaviour that is not there. Pressed toggles keep
native Tab order and still answer "which one is on". And the PO secret counter is
`aria-describedby`, **not** a live region: it changes on every one of sixteen keystrokes, so
announcing each change would talk over the typing it exists to help with.

**Verified against the browser, because reading markup proves nothing here.** After the fix Smart
Split reports **0 unnamed inputs** (was 6, two of which — the source vendor and total — were only
found *because* the accessibility tree was queried rather than the source); the module grid exposes
a named group of 14 pills whose `aria-pressed` flips `true → false → true` on toggle while the live
region reads "13 / 14 modules enabled"; and `input.labels` on the PIN field returns `["New PIN"]`,
which is the browser's own association and the authoritative check.

⚠️ **The read_page tree shows the *placeholder* as the name for password inputs even when a label
is correctly associated.** That looked like a bug in the fix and is not one — `input.labels` and a
duplicate-id check settled it. Do not trust that serialization for accessible names.

**

---

## Stage 5 — Commercial & compliance · ongoing

| # | Task | Effort | Status |
|---|---|:-:|---|
| 5.1 | Privacy policy and terms pages, linked from the footer and recorded at sign-up | M | ⚠️ **mostly done 2026-08-11** — `/privacy` and `/terms` are live public routes (the footer links were `#`), and the sign-up form carries the consent notice with both linked. **Two things remain:** the acceptance migration is written but NOT applied (needs a Supabase token), and neither document has had legal review — entity name, registered address, grievance officer and seat of jurisdiction are marked as blanks inside the pages. |
| 5.2 | Data export and account deletion (DPDP / GDPR) | L | ⚠️ **export DONE, deletion PARTIAL — 2026-08-11.** Export ships: one JSON bundle of all 25 personal-data tables, read through RLS as the user, verified against the real database (25 tables, 0 unavailable, no cross-workspace rows). Deletion ships the honest half — Settings explains exactly what is removed and composes the request — while the queue migration `20260811130000` and `docs/runbooks/account-deletion.md` wait to be applied. |
| 5.3 | Onboarding: 3-step first-run checklist, optional sample data | M | ✅ **done 2026-08-11** — the checklist ticks itself off the workspace's real rows, retires permanently once all three are satisfied, and the optional sample workspace is 18 labelled rows that can be removed exactly. No migration: the state is a `tenant_settings` key. See the note below. |
| 5.4 | Make the PIN optional/explained with a recovery path and a grace period | M | ✅ **done 2026-08-11** — the PIN is offered rather than imposed, a forgotten one is reset with the account password (BUG-036), and hiding the tab starts a grace clock instead of locking instantly. Both screens now say what the lock is *not*. See the note below. |
| 5.5 | "Upgrade to unlock" states on plan-gated menus (conversion) | S | ✅ **done 2026-08-12** — a feature outside the plan is now shown locked in the navigation and its route sells instead of redirecting. A feature the *owner* switched off stays hidden, because paying more would not bring it back. No migration: `plans.menu_set` is public catalogue data. See the note below. |
| 5.6 | Rewrite `README.md`; correct `CLAUDE.md`; add runbooks and an ADR log | M | ✅ **done 2026-08-12** — the root README was a three-line Lovable stub; it is now the front door. Six runbooks in [docs/runbooks/](./runbooks/) and eight decision records in [docs/adr/](./adr/). `CLAUDE.md` was corrected on 2026-08-11. See the note below. |
| 5.7 | Support channel + a real contact address; a status page | S | ✅ **done 2026-08-12** — one real address (BUG-073 closed), a public `/support` page that pre-fills the details a reply needs, and a public `/status` that checks the API and sign-in live from the visitor's own browser with a PO-editable incident notice. No migration. See the note below. |
| 5.8 | Product analytics (activation, retention, conversion funnels) | M | ⚠️ **done 2026-08-12, one migration pending** — a new `/po/analytics` console measures the product **without an analytics script, an events table, or a cookie**: every number is derived from records already stored. Growth, conversion, MRR and the plan mix work today; activation, liveness and cohort retention need `20260812120000_stage5_analytics.sql`, and until it is applied the page says so instead of showing zeroes. Recorded as [ADR-0009](./adr/0009-analytics-without-tracking.md). See the note below. |
| 5.9 | Cost monitoring and alerting on edge invocations | S | |

### 5.3 · Onboarding without a single stored flag

The checklist records nothing about what the user has *done*. It counts rows —
one transaction, one budget, one goal — so it cannot claim a workspace is set up
when it is empty, and it cannot walk an invited collaborator through creating a
first transaction in a workspace that already holds four hundred. A step whose
menu the plan does not include is dropped rather than shown as impossible, and
an empty list is never treated as "complete", so a later upgrade still gets its
checklist.

Sample data is the one part that could have made the checklist lie. It creates
**real rows** — that is the point of it; they appear in the ledger, the charts
and the export — so a workspace whose only transactions came from a demo button
would otherwise read as fully set up. The loader records the primary key of
every row it creates, and the count queries exclude exactly those ids: after
loading the sample the card still says **0 of 3**, and it ticks to 1 of 3 the
moment a real transaction is added. Both were verified against the live database
on a workspace created for the purpose.

**Removal deletes by recorded id, never by the label.** Sample rows carry a
visible `Sample · ` prefix, but the prefix is for the human reading the ledger;
matching on it would delete a row the user typed themselves that happened to
start with that word. The offer to load is made only while no step is done —
otherwise the budget upsert (`budget_set_allocation`, keyed on
tenant+bucket+period) could overwrite an allocation someone had already set.
Because the checklist can be dismissed and retires itself, the remove button
also lives permanently in Settings; a card that hides the only way to delete a
dozen invented transactions would be worse than no card.

🔴 **The dating bug the live run caught.** The sample ledger was first written
as "days ago", which on the 11th of the month put the salary in the *previous*
month and left three small expenses in the current one — so the dashboard, which
shows the current month, greeted a brand-new user with **monthly savings
−₹5,849** and no income at all. It is now anchored to the calendar (this month,
last month, day-of-month, clamped to today), and a test builds the plan on the
1st, 3rd, 11th, 17th and 28th and asserts income exceeds spending in the current
month every time. The test was proven to fail against the old shape before being
kept.

No migration was needed: the state is an `onboarding` key in `tenant_settings`
(the Stage 3.1 key/value store), which also means `legacyKey` there is now
optional — a setting written after 3.1 has no localStorage predecessor to
import, and inventing one would point the importer at a slot nothing ever wrote.

### 5.4 · A lock people can live with

Three separate complaints, one cause: the PIN behaved as though it were protecting the data.

It was **mandatory** — a new account could not reach the app without creating one. It re-locked on
**every** visibility change, so glancing at another tab for two seconds meant typing it again, which
is exactly how people end up choosing 1111. And a forgotten PIN had **no way out** except clearing
site data (BUG-036), which for most users is indistinguishable from losing their account.

None of that bought any security. The Supabase session stays valid the whole time the app is
"locked"; RLS is what protects the rows. The lock is a curtain over the screen of a device somebody
is already signed in on, and every screen now says so in as many words — stored on this device as a
one-way hash, hides the screen, does not encrypt anything, cannot stop someone who has your
password. A lock people trust further than it goes is worse than no lock.

**The grace period** is the behavioural change: hiding the tab records the moment, and returning
locks only if the chosen interval (Immediately / 1 / 5 / 15 minutes, default 5) has elapsed.
"Immediately" is kept, and still locks on the way *out*, because that is what puts the lock screen
into a task-switcher preview rather than the balances.

🔴 **A default that would have silently restored the old behaviour.** `graceMinutes()` read the
setting with `Number(localStorage.getItem(key))` — and `Number(null)` is `0`, which is a *valid*
option meaning "Immediately". Every user who never opened the setting would have got lock-on-every-
tab-switch back, with a Settings page cheerfully showing "After 5 minutes". A unit test asserting
the default caught it before it ever ran in a browser.

**Recovery** is "Forgot your PIN?" on the lock screen → the account password → the PIN is cleared
and a new one requested. That hands back exactly what was lost and nothing more: the password is
the credential that actually proved something. One wrinkle found while testing it live — for
anyone who set a PIN under the old rules the choice is only *inferred* from a PIN existing, so
clearing it made the app forget they ever wanted the lock and greet them with "Add a PIN?" instead
of "Choose a new PIN". Recovery now records the choice explicitly first.

Also in passing: the four e2e specs each carried their own copy of the sign-in-and-unlock helper,
and this change rewords every screen in that gate — four identical edits, or three passing specs
and one signing in against copy that no longer exists. It now lives in `e2e/auth.ts`.

### 5.5 · Two reasons a menu is missing, and only one of them is for sale

`get_effective_menus()` returns the final list and nothing else, so the app could not tell the
difference between "your plan does not include Trips" and "the owner of this workspace switched
Trips off for you". Those need opposite responses. The first is a sales conversation. The second is
somebody else's decision about this account, and an "Upgrade to unlock" button on it would be a
lie — paying more changes nothing.

The distinction is recovered client-side by comparing the effective list with the plan's own
`menu_set`, both of which the browser can already read (`plans` is public catalogue data — no
migration, no new RPC). Presentation only: the paywall itself is still `plan_menus()` / `has_menu()`
in RLS, and nothing here can grant anything.

**Plan-locked** now means: the row stays in the sidebar, muted, with a padlock and an
`sr-only` "included in Canopy" (the padlock is otherwise invisible to a screen reader), and the
route renders an upgrade page in place — naming the feature, what it does, the plan and the price.
Deep links and bookmarks therefore land somewhere that explains itself instead of being bounced to
the dashboard, which taught the visitor nothing. **Permission-locked** keeps the old behaviour
exactly: hidden, and redirected.

🔴 **The failure mode worth designing against is showing a paywall to somebody who has already
paid.** Every uncertainty in `menuLock()` therefore resolves to `unknown` — render neither the
feature nor a pitch — rather than to `plan`. That covers the moment before the access list arrives,
the moment before the catalogue arrives, and an empty catalogue. `MenuGuard` waits on the same
signal rather than redirecting on incomplete information. Verified live from both sides: a Roots
workspace shows six locked rows and "Investments is part of Canopy · ₹299/mo", and the demo
workspace on the top plan shows none, with an e2e test pinning the absence.

Two things the live run surfaced, both pre-existing and neither fixed here:

* **`billing` is itself plan-gated**, so a Roots workspace cannot open the page where you would pay
  us. Locking the door to the shop is not a paywall. For now the upgrade page carries its own
  action rather than linking to Billing (and while no gateway is configured that action is the
  Stage 2.11 "contact us" mail, which is the honest one), and `billing` is excluded from the locked
  rows — advertising it as a paid feature would be absurd. Whether it should be always-allowed is a
  product decision, and it changes a documented 2.15 contract, so it is not being made in passing.
* **An owner never sees a permission lock at all**: `get_effective_menus()` short-circuits an owner
  to `plan_menus()` before applying tenant or member overrides (the BUG-081/AZ-009 product
  decision). So for an owner every unavailable menu is a plan lock by definition, which is what
  makes the sidebar upsell safe for them; the permission branch only ever renders for a
  non-owner member.

### 5.6 · Writing down what only existed in somebody's head

The root `README.md` was **three lines of Lovable boilerplate** — "TODO: Document your project
here" — on a repository with 32 tables, 62 migrations and 498 tests. Everything a new contributor
needed was either in `CLAUDE.md` (which briefs agents, not people), spread across 30 audit documents
dated 2026-08-04, or in nobody's head at all.

Three deliverables, and one rule for all of them: **only claims that were checked**. The table
counts come from the generated types, the test counts from a run, the commands from the ones
actually used on this machine.

**The README** is now the front door: what the product is, the two-command start, the gate commands
with the reason `npm run typecheck` is not optional (SWC strips types without checking them — that
once hid 17 real errors in code that touched money), the three-layer access model, the rules that
matter, and a "known state, stated plainly" section that says the two pending migrations, the
absent payment gateway, the absent backups and the undeployed `send-email` out loud rather than
letting someone discover them.

**Runbooks** for the things done rarely and under pressure: applying a migration (the session
pooler, the URL-encoded password, the `--workdir`, the types regen and the BOM check — each of which
has cost an hour), deploying (including the 4.3 lesson that a new client against an old edge
function looks like a flat market rather than an outage), deleting and restoring a workspace
(including the storage drain that is still manual), account erasure, declaring an incident (5.7),
and credential rotation with a full inventory of what breaks and what the blast radius is.

**Eight ADRs**, reconstructed from the migrations and code that implemented them: membership-based
tenancy, menus as a real paywall, Postgres for shared state, cloud-only Supabase development,
deferring the payment gateway, deriving money rather than storing it, the app lock as a curtain
rather than a control, and one implementation per rule. Each records the alternatives and what the
choice **costs** — a decision with no cost was not a decision.

Two documents were corrected rather than rewritten. `Deployment_Checklist.md` carries a banner
naming its three statements that are no longer true (the hosting config exists, `config.toml` no
longer defaults to live, and the dev project it names was deleted in the rebuild), and points at the
runbook. `docs/README.md` — the audit index — now lists the runbooks and ADRs above its reference
tables. The rest of the 2026-08-04 audit stands as a dated snapshot, which is what it is.

### 5.7 · A real address, and a page that says whether it is us

Three copies of a contact address existed — in `payments.ts`, in `legal.ts` and hardcoded in the
landing footer — all of them placeholders on a branded domain with **no mailbox** (BUG-073). Every
"contact us" in the product went nowhere, including the one the privacy policy offers for a
data-rights request, which is a promise with a legal clock on it rather than a nicety.

The user chose the address the project already uses over the branded one: **a real inbox beats a
nice-looking dead end.** It now lives in `src/lib/support.ts` and nowhere else, guarded by a test
that fails when a second address appears in `src/` (input placeholders like "you@company.com" are
exempt — they are example text for the user's own address, not somewhere we ask anyone to write).
Swapping it for a branded address when mail is hosted is a one-line edit.

**`/support`** and **`/status`** are public and sessionless on purpose: somebody who cannot sign in
is exactly the person who needs them. The support page pre-fills a mail with the things that turn
"it doesn't work" into something answerable — workspace id, plan, route, build stamp, browser — and
**shows the user the block before they send it**. Nothing is collected or transmitted by the app;
their own mail client sends whatever they choose to send, and a test asserts the block carries no
financial data. A build stamp is injected by Vite for the same reason: "which version are you on?"
is the first question of most support threads and the one users can never answer.

The status page answers the only question that matters during an outage: **is it me or is it them?**
It runs its probes **in the visitor's own browser** — the only way to tell somebody their own
network is the problem — against endpoints that work signed-out (the public plan catalogue and the
auth health endpoint), because a probe that fails for a signed-out visitor would paint the page red
for everyone reading it during an incident. It says all of this on the page, including what it
cannot see.

🔴 **The rule worth keeping: the worse of the two wins.** A green operator notice can never hide a
failing probe, and a green probe can never hide what an operator declared — they can see a data
problem or a provider incident that no browser probe can. Verified live from both directions: with
both probes green and a "degraded" notice published, the banner went amber and used the operator's
own words; with a probe forced to fail, it went red regardless of the notice.

The notice is one `site_settings` row written through the audited PO RPC — no migration. Its key is
`landing_status` because the RLS policy allows anon to read only `landing_*`, and a status page a
signed-out visitor cannot read is not a status page. A test asserts that prefix, since it is easy to
rename and impossible to notice.

Two things fixed in passing: the dashboard footer's "Privacy / Terms / Help" were three `<span>`s
styled to look like links and wired to nothing, and the legal pages' chrome moved into a shared
`PublicLayout` so Support, Status and both documents cannot drift apart.

**Left alone deliberately:** `LEGAL_VERSION` was not bumped. Correcting a contact detail is not a
material change to the terms, and bumping it would invalidate every recorded acceptance to no
purpose. **Also still true:** nothing alerts anyone — the operator has to know before they can
declare. That is 5.9 (cost/error alerting) and 0.5 (Sentry, needs approval).

### 5.8 · Measuring the product without measuring the user

The decision this stage really made was **not** which chart to draw. It was whether to collect
anything. Four options were put to the user — a vendor, a first-party events table, a middle option
adding only anonymous landing-page counters, and deriving everything from records already stored —
and the last was chosen. Recorded as [ADR-0009](./adr/0009-analytics-without-tracking.md).

It works because every row in this database already carries `created_at`. Activation is "did a
first transaction ever appear"; retention is "which months did this workspace write anything in";
conversion is "which plan is actually in force". Two `SECURITY DEFINER` functions reduce those to
counts and timestamps before they leave Postgres — the Product Owner has no RLS access to a finance
table and is not given one here. The reviewable claim is the `SELECT` list: **no amount, no
description, no category, ever.**

🔴 **The blind spot is stated on the page itself.** This can see nothing an anonymous visitor does:
there is no landing-page → sign-up funnel and no per-screen drop-off. A dashboard that does not
admit what it cannot answer gets trusted for questions it cannot answer, so `/po/analytics` ends
with a paragraph saying exactly this. The second admission is subtler: **reading leaves no trace**,
so a workspace opened every morning and never edited would look dormant. `last_sign_in_at` is
carried beside `last_activity_at` and liveness uses the later of the two.

Definitions were the real work, and each one is pinned by a test:

- **Activation uses the same three steps as the first-run checklist**, asserted equal to
  `ONBOARDING_STEPS`. If they drift, the product and the console disagree about what "set up"
  means, and only one of them is talking to the user.
- **Time-to-activate ignores workspaces younger than a week.** Without that, a good week of signups
  drags activation *down*, because the newest workspaces have not had the chance — ten fresh
  signups would read as 0%.
- **A cohort's retention row stops at the current month.** Padding it with zeroes would show a
  brand-new cohort as having churned completely. A blank cell is "not yet", not "nobody".
- **Month zero is not automatically the whole cohort.** Signing up and never returning is a real
  outcome and has to be visible.
- **Paying goes through `resolveCurrentPlan()`**, so an expired Canopy subscription counts as free —
  exactly as `plan_menus()` already treats it. Reading the plan name off the subscription would
  bill a lapsed customer in the dashboard while the app had already dropped them.
- Months are bucketed in **UTC** on both sides, because `date_trunc` runs in UTC on Supabase.

🔴 **The privacy policy had to change, and `LEGAL_VERSION` did not.** The old sentence — "we do not
currently run product analytics" — would have become false. It now says plainly that usage is
measured by counting records already held, that nothing new is collected, and that no new record of
behaviour is created. Since nothing new *is* collected, this is not a material change and bumping
the version would invalidate every recorded acceptance for nothing. The summary bullet a
prospective customer reads first — *no analytics or tracking script* — stays true, and
`analytics.test.ts` now fails if a vendor snippet appears in `src/`, in `index.html` or in
`package.json`.

🔴 **The e2e run caught the Stage 5.2 bug a second time.** `const rpc = supabase.rpc` detaches the
method from its client, `this` is lost, and every call dies inside PostgrestClient with *"Cannot
read properties of undefined (reading 'rest')"* — the page reported it as an ordinary query error.
`.bind(supabase)` fixes it. **The same mistake was already shipped in
`src/lib/legalAcceptance.ts`**, where it is worse: the throw is synchronous, so
`void rpc(...).then(...)` never swallows it and sign-up creates the account and then dies before
its own success toast. Fixed there too.

**Pending:** `20260812120000_stage5_analytics.sql` is the third unapplied migration. Verified live
against `ludbntvhagefadfkhrjj` in the degraded state — growth, conversion, MRR and the plan mix
correct; the engagement-derived sections naming the migration instead of showing zeroes.

### Backlog pass · 2026-08-12

Three old defects closed, and a fourth found while checking whether the first three were real.

**BUG-087 — "Invalid Date" / "NaN DAYS" on an insurance card.** `insurance.due_date` is nullable
and the row mapper turned a null into `""`, so `daysUntil` returned `NaN`. The visible half was
ugly; the invisible half was worse — `NaN < 0` and `NaN >= 0` are *both* false, so the policy
vanished from the overdue count **and** the renewing-soon count while sitting on screen unusable.
`daysUntil` now returns `null`, which forces each caller to say what "no date" means for it, and
`policyUrgency()` makes `unknown` a fourth state rather than a flavour of "fine". The thresholds had
been written out three times in `Insurance.tsx`, which is how one bug managed to be wrong in three
places (ADR-0008). **Verified live** by inserting a real null-date policy through RLS and deleting it
afterwards. A second bug fell out: `new Date("2026-03-09")` is parsed as UTC midnight, so west of
UTC every renewal countdown would be a day short — India hides it completely, so it is pinned by a
test now rather than found from a second market.

**BUG-027 — the portfolio looked empty.** `MatrixFilter` opens on "today", which is right for a
ledger and wrong for the investments list, whose date is `savedAt` — *when the holding was
recorded*, not when anything happened. Somebody with twelve holdings entered last month was shown an
empty state, which reads as data loss. The filter now takes a `defaultPreset` and the portfolio asks
for `all`; the ledger's default is untouched, and a test asserts both so the fix cannot leak.

**BUG-086 — purged workspaces' documents outlived them.** Postgres cannot delete a storage object,
so a purge only enqueues the prefix; nothing drained the queue. `scripts/storage-purge.mjs` does
(`npm run drain:storage`). **Dry run is the default and `--apply` is the only way to delete**,
because the script's whole job is irreversible deletion of other people's files. It refuses a queue
row whose prefix is not exactly `<tenant-uuid>/`, refuses any listed object outside it, and re-lists
after deleting before it marks the row complete — all three fail closed, since the failure that
matters is not "the drain did not run" but "the drain deleted a live workspace's documents".

**Found while reconciling `BUG_TRACKER.md`: Stage 1b was never finished** — see the note under
Stage 1 above. Three of those are security defects in edge functions that are deployed today.

**Also:** the e2e suite signed in afresh for every authenticated test, and adding one more route
pushed it past Supabase's per-IP auth rate limit — at which point unrelated specs fail as "the app
didn't render". The authenticated block now signs in once and runs serial: 8 sign-ins became 1, and
the suite went from 1.9 min to 53 s.

---

## Deliberately deferred

| Item | Why | Revisit when |
|---|---|---|
| Multi-region / failover | cost-first; single-region Supabase is adequate | enterprise or EU-residency requirement |
| i18n / l10n | single market (India), single currency | second market |
| MFA for tenant users | PO MFA matters far more | any B2B customer |
| GraphQL / API versioning | PostgREST is sufficient at this scale | public API |
| Microservices | ~200 files, one team | never, at this scale |
| Mutation testing | coverage must exist first | after Stage 0 |

---

## Effort summary

| Stage | Duration | Blockers closed |
|---|---|---|
| 0 Safety net | 2–3 d | 5 |
| 1 Stop the bleeding | 1 w | 6 |
| 2 Correctness | 2 w | 4 |
| 3 Durability | 1–2 w | 1 |
| 4 Scale & polish | 1–2 w | 0 |
| 5 Commercial | ongoing | 1 |
| **To launch-ready** | **≈5–7 weeks** | **16 / 16** |
