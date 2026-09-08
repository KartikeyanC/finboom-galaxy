# UI Review Checklist

A gate to run **before merging any UI change**, and in full before a release that
touches the front end. Sibling of [Deployment_Checklist.md](./Deployment_Checklist.md);
that one covers shipping, this one covers what you are shipping.

This is deliberately **not** a generic WCAG list. Every item below is either a
trap this codebase has already fallen into, or a check that would have caught a
bug in [BUG_TRACKER.md](./BUG_TRACKER.md). Items marked 🔴 have bitten us more
than once.

The point-in-time findings live in [UI_UX_Report.md](./UI_UX_Report.md) and
[UX_Report.md](./UX_Report.md). Those are reports. This is the recurring gate.

---

## 0. Before you start

- [ ] 🔴 **Know that there are five themes, not two.** `obsidian` (default),
      `light`, `cyber`, `mint`, `copper`. The four dark ones inherit from
      `:root`; only `light` and the three tinted ones override.
- [ ] 🔴 **The theme is `finroot.theme` in localStorage, not `prefers-color-scheme`.**
      Playwright's `emulateMedia({ colorScheme })` changes *nothing* — a
      "checked both themes" that uses it has silently checked one theme twice.
      Use `applyTheme()` from `e2e/ui-a11y.spec.ts`.
- [ ] If you are measuring or clicking anything on `/`, wait out the landing
      preloader — it covers the viewport and is hit-testable for ~2.8 s
      (`settle()`, same file).

---

## 1. Colour and theming

- [ ] 🔴 **No raw Tailwind colour class on anything that carries meaning.**
      Money, status, categories and chart marks read from tokens
      (`--success`, `--destructive`, `--warning`, `--bucket-*`, `chartColor()`),
      never `text-emerald-500`.
      *Why: the light-theme override map in `index.css` only remaps `-200`/`-300`/`-400`.
      Anything at `-500` or `-600` renders dark-theme colour on white — currently
      138 instances, `text-emerald-500` alone 55 times at 2.5:1.*
- [ ] New token added? Define it in **`:root` AND `[data-theme="light"]`.**
      The three tinted dark themes inherit `:root`; light never does.
- [ ] 🔴 **Measure contrast against the lightest surface the text actually sits
      on**, not just `--background`. Secondary text sits on `--muted` (lighter
      than the page) — measuring against the page said 4.75 and hid a 3.81
      failure. That was BUG-094.
- [ ] Text ≥ **4.5:1**. Icons, borders that are the only boundary, focus rings,
      chart marks ≥ **3:1**.
- [ ] A colour that is both a text colour and a fill must clear 4.5 **in both
      directions** — contrast is symmetric, so one value satisfies both or
      neither. (This is why light `--primary` is `26%`.)
- [ ] 🔴 **Colour is never the only channel.** Every state that colour encodes
      also carries a word, an icon, a label or a position. Check the pair under
      deuteranopia before shipping — `sky-500` and `fuchsia-500` were 8 apart
      out of 255 and nobody noticed for months.
- [ ] `--accent` stays neutral. Do not tint it with the theme's own primary, or
      primary-on-accent collapses (cyber/mint/copper are at 2.9–3.2:1 today).
- [ ] Screenshot the change in **light** and **obsidian** at minimum. If it
      touches tokens, all five.

---

## 2. Type and numbers

- [ ] No text below **12 px**.
- [ ] Every aligned figure column has `tabular-nums`. (Coverage is good — 95
      uses against 92 `formatMoney` call sites. Keep it that way.)
- [ ] Money renders through `formatMoney` / `formatCompact`, never a raw
      `toFixed`, so currency and locale stay consistent.
- [ ] Each page has exactly one `<h1>` and no skipped heading level.
      *`Landing.tsx` still starts at `<h2>` — do not copy that page.*

---

## 3. Controls, touch and reach

- [ ] 🔴 **Every icon-only control has an accessible name, and the name carries
      the subject** — `aria-label={`Delete ${row.name}`}`, not `"Delete"`.
      A list of twenty rows all announcing "Delete" tells you nothing about
      which row you are about to lose.
- [ ] 🔴 **No control exists only on hover.** `opacity-0 group-hover:opacity-100`
      does not exist on a phone, and this is a web **and mobile** product.
      Reveal on `:focus-within` too, or keep it visible at low opacity.
- [ ] Hit targets ≥ 24 px (WCAG 2.2 floor). Aim 44 px for anything used
      one-handed on mobile — pickers especially, where a mis-tap becomes a
      mis-categorised transaction the user has to go find later.
- [ ] Interactive things look interactive. Static text that looks like a control
      is a bug — see `UI-010`, the header period label that is
      `new Date().toLocaleDateString()` and does nothing.
- [ ] Menu and listbox items show hover **and** keyboard focus through more than
      a background tint. `--accent` on `--popover` is 1.14:1 in light.

---

## 4. Keyboard and assistive tech

- [ ] Tab through the whole change. Focus order matches visual order, nothing is
      reachable-but-invisible, nothing is visible-but-unreachable.
- [ ] Focus is always visible — `focus-visible`, never bare `focus` on pointer
      controls.
- [ ] New `DialogContent` has a `DialogDescription`. Radix warns without one and
      the screen reader gets no context. *(Twelve dialogs are currently missing it.)*
- [ ] A new bare-letter shortcut checks `isContentEditable`, input tags, and
      enclosing `dialog` / `menu` / `listbox` roles before firing — copy the
      guard in `DashboardLayout.tsx`. Never take a browser chord (that is why
      Ctrl+N became `n`).
- [ ] Anything conveyed by an icon alone also has `sr-only` text. The locked
      sidebar rows are the pattern to copy.
- [ ] New landmark region has an `aria-label` if the page could have two of them.
- [ ] `prefers-reduced-motion` disables any animation you added.

---

## 5. The four states every surface needs

Most FinRoot pages ship only the third one. Check all four:

- [ ] **Loading** — a `Skeleton`, not a flash of zeros. 🔴 A net-worth dashboard
      that paints ₹0 before data arrives reads as *my money is gone*.
      `DashboardWealth` composes seven hooks and handles `isLoading` for none.
- [ ] **Empty** — says what this is and offers the first action, not "No data".
- [ ] **Error** — says what failed and what to do, with a retry. Never a blank card.
- [ ] **Offline** — the banner already exists; make sure your new figures are
      covered by it if they are stale-able.

---

## 6. Data integrity in the UI

- [ ] 🔴 **Destructive action is reversible or confirmed — pick one, and prefer
      reversible.** Soft-delete plus a sonner `action: { label: "Undo" }` beats a
      modal: it is safer *and* faster. Today there are 96 delete handlers, 14
      `AlertDialog` files and zero undo anywhere.
- [ ] A deleted or edited row that changes a balance says so.
- [ ] Validation errors render **inline, on the field**, with `aria-invalid` and
      `aria-describedby`, and focus moves to the first bad field. Report *all*
      issues, not `issues[0]`. Keep the toast for submit-level failures only.
      *(There are currently 0 uses of `aria-invalid` in 216 components.)*
- [ ] Read-only / viewer role genuinely disables the control, not just hides it.
- [ ] Plan-locked feature shows the lock and routes to upgrade — and a menu the
      **owner** switched off shows nothing at all. `lib/menuUpsell.ts` decides;
      anything uncertain renders nothing rather than a paywall aimed at someone
      who already paid.

---

## 7. Codebase rules that are easy to trip

- [ ] Menu ids come from `src/lib/accessMenus.ts`. Do not invent strings.
- [ ] 🔴 Never gate `transactions` by menu — `menuContract.test.ts` fails on it
      and every aggregate reads that table.
- [ ] New localStorage key is registered in `src/lib/deviceLocal.ts`, or its
      guard test fails. That is the point of the test.
- [ ] No new `lib/*Store.ts`. New modules use a React Query hook against
      Supabase (`useTransactions.ts`, `useBudgets.ts` are the models).
- [ ] No hand-written source file over 30 kB. If it is heading there, extract the
      pure part — mappers, arithmetic, parsing — which is where the untestable
      logic is hiding.
- [ ] No second support address anywhere; `src/lib/support.ts` is the one place,
      and a test enforces it.
- [ ] No analytics snippet. `analytics.test.ts` fails if one appears in `src/`,
      `index.html` or `package.json` — see [ADR-0009](./adr/0009-analytics-without-tracking.md).

---

## 8. Before you merge

```bash
npm run typecheck        # must be 0
npm run lint             # baseline 2026-08-30: 3 errors, 25 warnings — see note
npm run test             # baseline 2026-08-30: 796 passing, 55 files
npx playwright test --workers=1     # 🔴 serially — see below
```

> **Lint baseline note.** `CLAUDE.md` says "0 errors / 27 known warnings"; the
> actual state on 2026-08-30 is **3 errors, 25 warnings**. All three errors are
> `no-useless-escape` on one line of `e2e/tracker-tagging.spec.ts:136` and are
> unrelated to app code. Fix them or update the claim — a stated gate that is
> already red teaches everyone to ignore it.

- [ ] 🔴 **Playwright runs serially.** `fullyParallel: false` is set but no
      worker count is, so spec *files* still run at once and all sign in as the
      same demo account. A parallel run fails on contention and reads as a
      product bug it is not.
- [ ] PWA suite needs the production build — the service worker only registers
      under `import.meta.env.PROD`:
      `npm run build && npx playwright test --config e2e/pwa.config.ts`
- [ ] If you added a token, grep the built CSS to confirm Tailwind emitted the
      utility. A class the JIT never saw fails silently and looks like nothing
      happened:
      `grep -c "bg-your-token" dist/assets/*.css`
- [ ] If you removed a colour or token, grep for stragglers. Dead tokens are how
      the design system ends up with two sources of truth — `--chart-1`, `-3`,
      `-4`, `-5`, `-6` are unused today and `--chart-2` survives only in avatar
      gradients.

---

## Quick triage: is this finding worth fixing now?

| Signal | Ship-blocker |
|---|---|
| Text below 4.5:1 on a figure the user reads to make a decision | Yes |
| A control with no accessible name that deletes something | Yes |
| Colour as the only channel for a state | Yes |
| A control that does not exist on touch | Yes |
| Non-text contrast 2.5–3.0:1 on a border that is not the only boundary | No — log it |
| Hit target 24–44 px on a desktop-only surface | No — log it |
| Dead token, unused variant | No — sweep periodically |
