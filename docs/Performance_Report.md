# Performance Report

> Measured from a real production build on 2026-08-04 (`node_modules/.bin/vite build`) plus
> static analysis of query patterns. No RUM or Lighthouse run was performed — those are
> recommended next steps, not results claimed here.

---

## 1. Bundle — measured

```
dist/assets/index-DDreR0tR.js       2,562.09 kB  │ gzip: 735.29 kB   ← single main chunk
dist/assets/pdf-BBO_BrAh.js           458.48 kB  │ gzip: 136.00 kB   ← lazy ✔
dist/assets/pdf.worker.min-*.mjs    1,232.30 kB                      ← lazy ✔
dist/assets/index-*.css               149.26 kB  │ gzip:  24.11 kB
dist/index.html                         2.39 kB
✓ 3959 modules transformed · built in 28.96 s
```

Vite's own warning: *"Some chunks are larger than 500 kB after minification."*

### PERF-001 · No route-level code splitting — **High**
`src/App.tsx` statically imports all 27 pages. Every visitor — including someone who only ever
sees the marketing page — downloads and parses **735 kB gzip**, which includes:

| Passenger | ~size | Needed on `/`? |
|---|---|---|
| `recharts` | ~400 kB raw | no |
| `xlsx` | ~430 kB raw | no |
| `framer-motion` | ~120 kB raw | yes (landing uses it) |
| 25 Radix packages | ~200 kB raw | partly |
| all 9 PO console pages | ~120 kB | no |
| `Landing.tsx` alone | 71 kB source | only on `/` |

**Fix:** `React.lazy()` + `<Suspense>` for every route; `manualChunks` for
`recharts`/`framer-motion`/`xlsx`. Expected main chunk: **≈200–250 kB gzip** — a 65 % cut.

### PERF-002 · `xlsx` dynamic import is defeated — **Medium**
Build warning: *"`xlsx.mjs` is dynamically imported by `Export.tsx` but also statically
imported by `importParsers.ts` — dynamic import will not move module into another chunk."*
Making the `importParsers.ts` import dynamic recovers ~430 kB from the main chunk.

### PERF-003 · Render-blocking fonts — **Low/Medium**
`index.html` loads three families (DM Serif Display, Fira Sans 5 weights, IBM Plex Sans
5 weights) from Google Fonts in a blocking `<link>`. `--font-display` and `--font-body` resolve
to IBM Plex Sans + Fira Sans, so **DM Serif Display appears to be unused**.
**Fix:** self-host, subset to the weights actually used, drop DM Serif, add `font-display: swap`.

---

## 2. Data-fetching patterns

### PERF-004 · No pagination anywhere — **High**
`useTransactions` issues `select("*")` with no `limit`, no `range`, and no date window, then
filters and aggregates in JavaScript. It is consumed by the dashboard (several widgets),
Expenses, Income, Export, GlobalSearch and NetWorth.

| Rows | Payload (est.) | Effect |
|---|---|---|
| 500 | ~150 kB | fine |
| 5 000 | ~1.5 MB | noticeable jank on mid-range mobile |
| 20 000 | ~6 MB | multi-second freeze on every dashboard load |

For a daily-use finance app, 20 000 transactions is ~5 years of normal activity — this is a
foreseeable state, not an edge case.
**Fix:** `.range()` + `occurred_at` window; `useInfiniteQuery` for the ledger; a
`SECURITY DEFINER` aggregate RPC for dashboard tiles.

### PERF-005 · Dashboard fan-out — **Medium**
`DashboardClassic` / `DashboardWealth` mount 6–8 widgets that each call their own hook:
`useTransactions`, `useAccounts`, `useInvestments`, `useDebts`, `useGoals`, `useRecurring`,
`useBudgets`, `useIncomeStreams`. React Query dedupes identical keys, so the request count is
fine — but the app still fetches **every row of eight tables** to render a handful of totals.
**Fix:** one `dashboard_summary(tenant_id)` RPC returning pre-aggregated numbers.

### PERF-006 · Live-price polling is O(holdings) per minute — **High (cost + rate limits)**
`lib/livePrices.ts` fires one `fetch` **per holding, every 60 s, per open tab**, unbatched and
uncached:

| Holdings | Requests/hour/tab | Requests/day/tab |
|---|---|---|
| 10 | 600 | 14 400 |
| 30 | 1 800 | 43 200 |

Each is a Supabase edge-function invocation *and* an outbound call to Yahoo/mfapi. Two tabs
double it. Mutual-fund NAV updates once daily, yet is polled 1 440 times.
**Fix:** batch symbols into one request; cache server-side (60 s equities, 24 h NAV); back off
when the tab is hidden; stop polling when the Investments page is not mounted.

### PERF-007 · Base64 documents in list queries — **Medium**
`insuranceStore` selects `*` from `insurance`, which includes `document_data_url` — the full
base64 payload of every uploaded policy document — on **every** load of the Insurance page.
Three 2 MB PDFs = ~8 MB transferred to render a list of policy names.
**Fix:** move to Storage (DB-007); until then, select explicit columns and fetch the document
only on open.

### PERF-008 · Realtime toast storm — **Low**
`useRealtimeSync` subscribes to three tables and toasts on **every** INSERT, including the
user's own — so each added transaction produces two toasts (the mutation's and realtime's).
A CSV import of 200 rows produces 200 realtime toasts.
**Fix:** filter out self-originated events; debounce; drop the toast entirely.

---

## 3. Rendering

### PERF-009 · No list virtualisation — **Medium**
`ExpenseLedger`, `TransactionsTable`, `PortfolioList`, `RecurringList` and the import preview
render every row. A 5 000-row ledger creates 5 000+ DOM subtrees.
**Fix:** `@tanstack/react-virtual` for any list that can exceed ~200 rows.

### PERF-010 · Heavy landing animation — **Medium**
`Landing.tsx` (71 kB) runs a preloader, a custom cursor, three animated aurora blobs, a mouse
spotlight via `useMotionTemplate`, a scroll-progress bar, a marquee, count-ups, magnetic CTAs
and a 3D-tilt glass dashboard — all on the first paint of the highest-traffic page.
Mitigations already present: everything is `useReducedMotion`-gated. Still: continuous
`requestAnimationFrame` work on mobile drains battery and delays TTI.
**Fix:** defer non-hero animation until after `load`; use `IntersectionObserver` to pause
off-screen loops; consider dropping the custom cursor.

### PERF-011 · Chart re-render cost — **Low/Medium**
Five recharts donuts use `isAnimationActive={false}` (good) but recompute their colour ramps
and slice arrays inside `useMemo` chains that depend on `dark` and the full dataset. Acceptable
today; watch it if datasets grow.

### PERF-012 · No React error boundary — **High (availability)**
Any render throw unmounts the tree and shows a blank page with no recovery path. This is an
availability problem as much as a UX one.

---

## 4. Database performance

| Issue | Detail |
|---|---|
| Indexes | Every table has a `tenant_id` index ✔. **None** support the filters the UI runs (`type`, `category`, `status`, date ranges) or keyset pagination. |
| `po_list_tenants` | Correlated `count(*)` subquery per tenant — O(n) scans of `tenant_members`. Fine at 50 tenants, poor at 5 000. |
| `po_dashboard_stats` | 10 aggregate subqueries including `sum(amount)` over **all** transactions platform-wide, unindexed, on every PO dashboard load. |
| `get_effective_menus` | Called on every `AccessContext` refresh; `STABLE` so it is cached within a statement, but it runs 3 queries per call. Cheap now. |
| `REPLICA IDENTITY FULL` | On `transactions`, `budgets`, `goals` — every UPDATE writes the full old row to WAL. Doubles WAL volume on the hottest table. |
| Connection model | PostgREST pooling, managed. No app-side pool to tune. ✔ |

---

## 5. Caching

| Layer | State |
|---|---|
| React Query | `staleTime` 60 s, `gcTime` 5 min, `retry` 1, no refetch on focus — **well configured ✔** |
| Service worker | app shell network-first, hashed assets cache-first, cross-origin never intercepted — **correct ✔** |
| HTTP headers | not controlled by the app (no hosting config in the repo) |
| Server-side | none — no materialised views, no Redis, no edge cache |
| Live prices | **no cache at all** (PERF-006) |

---

## 6. Prioritised actions

| # | Action | Impact | Effort |
|---|---|---|---|
| 1 | Route-level `React.lazy` + `manualChunks` | −65 % initial JS | S |
| 2 | Paginate `useTransactions`; dashboard summary RPC | removes the main scaling cliff | M |
| 3 | Batch + cache live prices; pause when hidden | −95 % edge invocations | S |
| 4 | Add an `ErrorBoundary` | availability | XS |
| 5 | Make the `xlsx` import dynamic in `importParsers.ts` | −430 kB | XS |
| 6 | Insurance documents → Storage | −MBs per page load | M |
| 7 | Composite indexes: `(tenant_id, type, occurred_at DESC)`, `(tenant_id, status)`, `(tenant_id, next_due_date)` | query latency at scale | S |
| 8 | Virtualise long lists | mobile smoothness | M |
| 9 | Self-host + subset fonts; drop unused DM Serif | LCP | S |
| 10 | Silence self-originated realtime toasts | UX + renders | XS |

## 7. Recommended budgets (to enforce once CI exists)

| Metric | Target |
|---|---|
| Initial JS (gzip) | ≤ 250 kB |
| LCP (mobile, 4G) | ≤ 2.5 s |
| CLS | ≤ 0.1 |
| INP | ≤ 200 ms |
| Dashboard TTI with 5 000 transactions | ≤ 3 s |
| Edge invocations per active user per day | ≤ 200 |
