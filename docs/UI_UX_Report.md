# UI & Accessibility Report

> **Method.** Findings marked **[measured]** come from a live dev server (Vite 5188) driven
> through the browser on 2026-08-04 — DOM inspection, computed styles and contrast maths.
> Findings marked **[code]** come from source review.
> **Coverage limit:** the authenticated app (`/app/*`) is behind login **and** a mandatory
> device PIN, so only the public surface (`/`, `/auth`) was measured live. Everything about the
> dashboard and feature pages below is `[code]` and should be re-verified by an operator with
> test credentials — see [Testing_Master_Plan.md](./Testing_Master_Plan.md).
> Journey-level findings: [UX_Report.md](./UX_Report.md).

---

## 1. Design system

| Aspect | State |
|---|---|
| Tokens | HSL CSS custom properties in `src/index.css`; **5 themes** — `obsidian` (default dark), `light`, cyber, mint, copper |
| Theme switch | `ThemeContext`; the top bar exposes only a light ↔ obsidian toggle, so **three of the five themes are unreachable from the UI** |
| Typography | `--font-display` / `--font-body` both resolve to IBM Plex Sans → Fira Sans → system. **DM Serif Display is loaded from Google Fonts but never used** [code] |
| Primitives | 50 shadcn/Radix components + 5 project-specific (`icon-chip`, `money-input`, `category-chart`, `date-picker-field`, `password-input`) |
| Charts | single source of truth — `lib/chartColors.ts` (12-colour theme-aware deck, ~50 % greens) + `lib/chartShapes.tsx` (shared active-slice renderer). Genuinely consistent ✔ |
| Money formatting | `lib/finance.ts`, `en-IN` lakh/crore grouping, applied through `MoneyInput` everywhere except FX rates, trip days, coupon % and the calculator — a deliberate, documented exception list ✔ |
| Cosmic surface | `.fr-cosmic` glass treatment scoped to `obsidian` only; other themes untouched ✔ |

**Strengths:** the chart system, the money-input system and the icon-chip system are each
single-sourced and applied consistently. That is unusual and worth preserving.

---

## 2. Measured findings — public surface

### UI-001 · Horizontal overflow on mobile — **High** [measured]
Resizing the loaded landing page to a mobile viewport produces **36 px of horizontal
overflow at both 375 × 812 and 390 × 844** (`scrollWidth 411/426` vs `clientWidth 375/390`).
Full-bleed fixed layers (`Aurora`, `FloatingNav`, the toast viewport) stretch to the wider
document width, so they are symptoms; the true offender needs a bisect — the `w-[48vw]`
aurora blob at `right-[2%]` and the ×3-repeated marquee groups are the likely candidates.

**Important nuance:** the existing e2e test *does* check this — but it calls
`setViewportSize()` **before** `goto()`, and passes. The overflow reproduces on **resize /
orientation change** after load, which the test does not cover. Add a post-load resize
assertion.

### UI-002 · Body text below WCAG AA contrast — **High** [measured]
Against the landing background `rgb(8,9,13)`:

| Colour | Size | Occurrences | Ratio | AA needs | Verdict |
|---|---|---|---|---|---|
| `rgb(95,103,100)` (`#5f6764`) | 11 px | **96** | **3.42:1** | 4.5:1 | ✗ fail |
| `rgb(95,103,100)` | 12 px & 14 px | 6 | 3.42:1 | 4.5:1 | ✗ fail |
| `rgb(47,54,51)` | 11 px | 3 | **1.61:1** | 4.5:1 | ✗ severe fail |

`#5f6764` is the landing palette's tertiary text colour and is used ~100 times. Raising it to
roughly `#8b9a94` reaches 4.5:1 while staying visually muted.
*(Two other low-ratio entries in the raw scan are CTA label colours sitting on an emerald
button, not on the page background — those were excluded as false positives.)*

### UI-003 · 121 text nodes below 12 px — **Medium** [measured]
On the landing page alone, 121 leaf elements render text under 12 px. Combined with UI-002 this
compounds into a readability problem for anyone over ~40 or on a bright screen.

### UI-004 · 21 of 42 interactive elements below the 44 × 44 tap target — **Medium** [measured]
Half the landing page's buttons and links miss the WCAG 2.5.5 / platform HIG minimum on mobile.

### UI-005 · Hero headline text is broken for assistive tech and copy/paste — **Medium** [measured]
The kinetic split-text animation wraps each line in nested spans with no whitespace between
them, so the `h1` accessible name and any text selection read:

> "The calm **commandcenter** for your money."

Fix: add a trailing space (or `&nbsp;`) to each line span, or expose the intended string via
`aria-label` on the `h1` and `aria-hidden` on the decorative spans.

### UI-006 · Hero headline starts at `opacity: 0` — **Medium** [measured]
Computed style on the first paint is `opacity: 0; transform: translateY(110%)`; visibility
depends entirely on framer-motion running. If JS fails, is blocked, or a crawler renders
without executing animation, the primary headline of the marketing site is invisible.
Fix: animate **from** a visible base state, or gate on `useReducedMotion` to render statically.

### UI-007 · Preloader remains mounted after load — **Low, verify** [measured]
`div.fixed.inset-0.z-[100]` (the preloader curtain) is still in the DOM and not
`display:none` after the page has fully settled. It may be transparent/`pointer-events-none`
and harmless, but a full-viewport top-layer element is worth confirming — it is a plausible
cause of stray tap-blocking on mobile.

### UI-008 · No `<main>` landmark and no skip link — **Medium** [measured]
`main: 0`, no `a[href^="#main"]`. Keyboard and screen-reader users must tab through the entire
nav and hero on every page. `nav`, `header`, `footer` and `h1`/`h2`/`h3` hierarchy are all
present and correct ✔; `<html lang="en">` is set ✔; every `<img>` has `alt` ✔; no unlabelled
buttons ✔.

### UI-009 · React Router v7 future-flag warnings in console — **Low** [measured]
`v7_startTransition` and `v7_relativeSplatPath` warnings on every load. Harmless now, but they
are the upgrade blockers to plan for.

---

## 3. Code-review findings — authenticated app

### UI-010 · Hardcoded period label — **High** [code]
`src/components/DashboardLayout.tsx:135` renders the literal string **`"April 2026"`** in the
top bar of every app page. Today is 2026-08-04. Users see a stale, wrong date presented as
current context.

### UI-011 · No React error boundary — **High** [code]
Nothing in the tree catches render errors. Any throw in any widget blanks the whole app with
no message and no recovery. For an app that renders user-entered financial data through several
`as unknown as` casts, this is a realistic failure path.

### UI-012 · Raw database errors shown as user-facing toasts — **High** [code]
Every mutation ends `onError: (e) => toast.error(e.message)`. Real strings a user can hit:
- creating an "Other" trip → `new row for relation "trips" violates check constraint "trips_kind_check"` (DB-004)
- duplicate budget → `duplicate key value violates unique constraint "budgets_user_id_bucket_period_start_key"`
- viewer attempting a write → `new row violates row-level security policy for table "transactions"`

### UI-013 · Global Ctrl/Cmd+N hijack — **Medium** [code]
`DashboardLayout` captures Cmd/Ctrl+N and `preventDefault()`s it, overriding the browser's
"new window" with no opt-out. Cmd+K is a safe, conventional choice; Cmd+N is not.

### UI-014 · Three of five themes are unreachable — **Low** [code]
`ThemeContext` supports cyber, mint and copper; the only exposed control toggles
light ↔ obsidian. Dead surface area to either expose or remove.

### UI-015 · Inconsistent page container widths — **Low** [code]
The canonical container is `px-6 sm:px-8 py-8 space-y-8 max-w-[1400px]`. `Trips` uses 1200 and
`Reminders` uses 1000. Content jumps width during navigation.

### UI-016 · Oversized components hurt maintainability — **Medium** [code]
`Landing.tsx` 71 kB · `TransactionImporter.tsx` 46 kB · `AccountsManager.tsx` 43 kB ·
`Trips.tsx` 43 kB · `TransactionDialog.tsx` 38 kB · `Export.tsx` 35 kB ·
`SmartSplit.tsx` 32 kB · `PoTenants.tsx` 31 kB · `PoSecurity.tsx` 31 kB.
Nine files exceed 30 kB; several are single components with a dozen local sub-components.

### UI-017 · Accessibility instrumentation is thin — **Medium** [code]
84 `aria-*` occurrences across 199 files, and roughly half of those live inside the shadcn
primitives rather than in feature code. Radix gives correct roles and focus traps for dialogs,
tabs, popovers and selects — a strong baseline — but custom controls (the drag-to-reorder
income cards, the Smart Split node graph with SVG connectors, the 16-digit PIN/secret progress
bars, the module grids) have no ARIA and no described keyboard path.

### UI-018 · Realtime duplicate toasts — **Low** [code]
`useRealtimeSync` toasts on every INSERT including the user's own, so each add produces two
toasts; a 200-row CSV import produces 200. See PERF-008.

---

## 4. State coverage (from code)

| State | Coverage |
|---|---|
| Loading | ✔ present on most pages, but styled inconsistently — bare "Loading…" text in `ProtectedRoute`/`PoShell` vs skeletons elsewhere |
| Empty | ✔ genuinely good — Smart Split, dashboard widgets, Investments, Trips and Reminders all have designed empty states with a clear CTA |
| Error | ✖ per-call toasts only; no page-level error state, no retry affordance |
| Offline | ⚠ the service worker serves the cached shell, but the app then fails every Supabase call with generic toasts — no offline banner, no queued writes |
| Success | ✔ consistent `toast.success` |
| Slow network | ✖ no skeleton for the initial full-history transaction fetch — the dashboard shows zeros, then jumps |
| Destructive confirms | ⚠ mixed — member removal and tenant delete confirm ✔; transaction/goal/budget delete generally do not |

---

## 5. Responsive posture

| Breakpoint | Assessment |
|---|---|
| Mobile ≤ 480 | ⚠ UI-001 overflow on resize; UI-004 tap targets; the PO console has **no mobile layout** — `PoShell` uses a fixed `w-60` sidebar with no collapse |
| Tablet 768–1024 | ✔ sidebar collapses; Smart Split's SVG connectors are correctly hidden below `lg` and the cards stack |
| Desktop 1280–1600 | ✔ the design target; verified clean at 1270 px [measured] |
| Ultra-wide ≥ 1920 | ⚠ `max-w-[1400px]` caps content, leaving large empty margins; acceptable but untuned |

---

## 6. Prioritised UI actions

| # | Finding | Sev | Effort |
|---|---|---|---|
| 1 | UI-010 hardcoded "April 2026" | High | XS |
| 2 | UI-011 add an `ErrorBoundary` | High | XS |
| 3 | UI-012 error-message mapper | High | S |
| 4 | UI-002 raise `#5f6764` to ≥ 4.5:1 | High | XS |
| 5 | UI-001 bisect and fix the 36 px overflow; extend the e2e test to post-load resize | High | S |
| 6 | UI-005 / UI-006 hero headline text + initial visibility | Medium | XS |
| 7 | UI-008 `<main>` landmark + skip link | Medium | XS |
| 8 | UI-004 / UI-003 tap targets ≥ 44 px, minimum body size 12 px | Medium | S |
| 9 | UI-013 drop the Cmd+N hijack | Medium | XS |
| 10 | UI-017 ARIA for custom controls; keyboard path for Smart Split | Medium | M |
| 11 | UI-016 split the nine 30 kB+ files | Medium | L |
| 12 | UI-007 confirm the preloader unmounts | Low | XS |
| 13 | UI-014 / UI-015 / UI-018 hygiene | Low | S |
