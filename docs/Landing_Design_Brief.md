# Design brief — FinRoot public landing page

> Written 2026-09-20 to be pasted into Lovable (or handed to any designer). It describes the
> "Ledger Editorial" direction. Every claim in it is one the product can back up — see §8 before
> changing any copy.
>
> The existing landing page (`src/pages/Landing.tsx`) is the dark "glass dashboard" design and is
> unchanged by this document.

## 1. What this is
FinRoot is a personal-finance tracker for households, built for India first (₹). Visitors land here to decide whether to trust it with their money. Build the public marketing landing page only — a single scrolling page plus a sticky header and footer. Stack: React + Vite + TypeScript + Tailwind (shadcn/ui is fine for primitives). No backend work.

Primary action: "Open your ledger" → /auth?tab=signup. Secondary: "See the method" (in-page anchor).

## 2. Aesthetic direction: "Ledger Editorial"
The page should feel like a private bank's annual report, not a SaaS dashboard screenshot. Warm paper, one deep ink, one saffron accent, a serif for the words that matter, tabular numerals for every figure. Calm, precise, trustworthy.

Do NOT: dark glassmorphism, aurora/mesh gradients, purple-on-white, neon green glows, floating pill nav, cursor effects, preloaders, marquees, scroll-progress bars, generic rounded-2xl card grids, stock illustrations.

The memorable anchor (if the logo were removed, this is what identifies the page): a hero "ledger page" — an example month printed like a page from a cash book, with a saffron margin rule, seven ruled rows, a double-underlined total, and a "FULLY ALLOCATED" rubber stamp that lands once.

Two recurring motifs:
- Double rule — an accountant's double underline (border-bottom: 3px double). Use it on the eyebrow glyph (two thin lines before every section label), under the active nav item, and under the ledger total.
- Stamp — used once, in the hero.

## 3. Design system
Colours (define as CSS variables; the page sets its own background and must not inherit any app theme):
- paper #F3EFE6 (page) · paper-raised #FBF9F3 (ledger page/cards) · paper-sunk #E9E3D4 (footer)
- ink #0F2A22 (text, dark bands, primary buttons) · ink-soft #33463E · ink-mute #54645D
- on-ink #F3EFE6 · on-ink-mute #B4C0B9 (text on dark bands)
- saffron #D98A1F — decoration ONLY (never text; it is 2.5:1 on paper). saffron-on-ink #EBA845 for text/rules on dark.
- ochre #8A5300 (eyebrow text, warning figures on paper) · credit green #0B6B4E (positive amounts)
- rules: rgba(15,42,34,.16) hairline, rgba(15,42,34,.6) strong; on dark rgba(243,239,230,.18)

Use ONE dominant tone (paper) with alternating dark ink bands for rhythm. Add a 4% paper-grain overlay (tiny inline SVG feTurbulence tile) — no image request.

Typography:
- Display/serif: Fraunces (variable, light 300–350, optical sizing on, tight tracking −0.025 to −0.035em, italic for one emphasised word per headline)
- Body/UI: IBM Plex Sans, 17px/1.65 body; eyebrows 12px uppercase, tracking .18em, weight 500
- Every number: tabular-nums lining-nums. Serif for big figures (₹1,20,000), sans for table figures.
- Scale: hero clamp(3.1rem, 7.6vw, 6.9rem)/0.95 · h2 clamp(2.1rem, 4.4vw, 3.75rem)/1.04 · h3 1.5rem serif · minimum text size 12px (never smaller)
- Fonts must be self-hostable later (no runtime dependency beyond Google Fonts for now).

Shape and controls: near-square stationery corners (2px radius). Primary button = solid ink, paper text, 44px min height; hover lifts (−2px,−2px) with a hard 4px saffron offset shadow (no blur). Ghost button = 1px ink border. On dark bands, invert (paper button, saffron-on-ink shadow).

Layout: max width 1240px, 24px/40px gutters. 12-column grid, deliberately asymmetric (7/5 hero split; the ledger overhangs the grid by ~24px on the right). Section padding 96px mobile / 128px desktop. Hairline rules between sections; generous negative space.

## 4. Page structure (in order)
1. **Header** — sticky, solid paper, 1px bottom rule. Left: FinRoot logo (use a placeholder wordmark "FINROOT" in Fraunces). Nav: Method · Product · Privacy · Pricing · FAQ, active section shown by a double underline. Right: "Sign in" (text) + "Start free" (ink button). Mobile: hamburger with full-width serif links.

2. **Hero** — left (7 cols): eyebrow "A private ledger for your household"; H1 "Give every rupee a place to *belong.*"; lede "FinRoot divides each month across seven buckets, then keeps the books — income, spending, investments and goals in one ledger you own."; buttons "Open your ledger →" and "See the method"; small note "Free plan available · No tracking cookies". Right (5 cols): the ledger page (see §5).

3. **Facts strip** — four cells separated by hairlines, big serif figure + one line each:
   7 — buckets for every paycheck · 5 — currencies: INR, USD, EUR, GBP, AED · 0 — tracking cookies or analytics scripts · RLS — row-level security on every finance table

4. **The method** (dark ink band, id=method) — headline "Seven buckets. One rule: every rupee gets *a place.*" plus lede: "You decide how each month is divided. Log an expense and it lands in the right bucket by category — Rent counts toward Needs, Travel toward Play — so what you have left in each one is always current." Then seven columns (stacked rows on mobile), each: index 01–07, allocated amount, an engraved bar (diagonal hatching under a solid top edge — NOT a solid slab; bar height proportional to allocation, growing from a shared baseline on reveal; horizontal on mobile), serif name, one-line purpose. Hover: bar turns saffron-on-ink. Caption: "Bars show one illustrative month · ₹1,20,000 of income".

5. **The product** (id=product) — headline "Everything in the book, and *nothing you have to tend.*" A contents-page list (left, 5 cols) with six entries; selecting one shows an illustrative "specimen" panel (right, 7 cols, sticky). On mobile the panel opens inline under the selected entry. Entries:
   - 01 One ledger for everything — Income and expenses in five currencies, categorised as you go. Every row is yours to edit. (panel: 5 transactions with category → bucket, one in AED)
   - 02 Budgets by bucket — Allocate each month across the seven buckets. Expenses roll into the right one by category, so "used" is always current. (panel: 4 bars with % used)
   - 03 Goals with a pulse — Set a target and a date, then watch progress move as money is put aside. (panel: 3 progress rings)
   - 04 Investments, in context — Portfolio value, dividends and interest drawn from your own transactions, with live price refresh. (panel: sparkline + 3 holdings)
   - 05 Bills and imports — Scan a bill or import a statement. Rows arrive categorised and ready for you to review. (panel: receipt → extracted fields)
   - 06 A calendar of your money — A month at a glance: what came in, what went out, and on which day. (panel: month grid with dots)

   Every panel is labelled "Illustrative".

6. **Privacy** (dark band, id=privacy) — headline "Private by *architecture,* not by promise." Lede: "A finance app is only as trustworthy as what it cannot do. These are the things FinRoot is built so that it cannot." Button "Read the privacy policy ↗" → /privacy. Right: numbered list of six commitments (serif title + one sentence):
   - 01 Row-level security — Every finance table is scoped to your workspace inside the database itself — not merely hidden by the interface.
   - 02 Encrypted at rest — Your rows are stored encrypted. Sign-in and data travel over TLS.
   - 03 No tracking — No analytics scripts, no ad pixels, no tracking cookies. Our own usage figures are counted from records already stored, never from watching you.
   - 04 Blind admin tools — The platform's own admin views return counts and dates only — never an amount, a description or a category.
   - 05 Yours to take — You can export your records at any time, and ask us to delete your account. The privacy policy spells out how.
   - 06 Never sold — Your numbers are never sold, and never mined.

7. **Pricing** (id=pricing) — a ruled three-column table (not floating cards): top and bottom strong rules, vertical rules between columns. Middle plan inverted (ink background) with a saffron "Most chosen" tab. Serif price, one-line blurb, checklist, full-width button. Use these as placeholder data (prices come from a database later — keep them in a single data array):
   - Roots — Free — "For anyone starting the habit." — Unlimited transactions · 1 budget cycle · 3 active goals · Email digests — "Start free"
   - Canopy — ₹299/mo — "For households serious about wealth." — Everything in Roots · Unlimited budgets & goals · Multi-currency portfolio · Screenshot → transaction AI · Insurance carryover engine — "Start 14-day trial" (highlighted, badge "Most chosen")
   - Heritage — ₹899/mo — "For families and advisors." — Everything in Canopy · Up to 5 linked profiles · Advisor seat · Priority support — "Talk to us"

   Section heading: "Quietly priced. Loudly worth it."

8. **FAQ** (id=faq) — left: "Answers, before you *ask.*"; right: numbered native `<details>` list with serif questions and a plus that rotates to a cross:
   - Is my financial data safe? — Every row is encrypted at rest, scoped to you with row-level security, and never sold. You can export your records at any time, and ask us to delete your account.
   - Do you track me? — No. There is no analytics script, no ad pixel and no tracking cookie on this site or in the app. The privacy policy says so where you read it first.
   - Do you support multiple currencies? — Yes — INR, USD, EUR, GBP and AED out of the box, with smart aggregation to your home currency.
   - Can I cancel anytime? — Yes. Plans are monthly. Cancel in one click — your data stays.
   - Do you replace my bank? — No. FinRoot sits on top of your accounts as a calm, opinionated lens — not another transactional ledger.

9. **Closing band** (dark) — giant serif "Open your *ledger.*" left; right: "Two minutes to set up. Seven buckets to fill. One place where every rupee is accounted for." + button "Start free →".

10. **Footer** (paper-sunk) — logo + tagline "The calm, intelligent wealth OS for modern households."; columns Product (Method, Features, Pricing) · Company (Privacy, FAQ, Support /support, Status /status) · Legal (Privacy policy /privacy, Terms /terms); bottom bar "© 2026 FinRoot. All rights reserved." and "Made in India" (text only — no flag emoji; it renders as "IN" on Windows).

## 5. The hero ledger (build this with care)
A real `<table>` with a screen-reader caption, on a paper-raised "page" with a 1px strong border, a soft lifted shadow, and a 1px saffron vertical margin rule ~2.6rem from the left.
- Top line, small caps: "JUNE · EXAMPLE MONTH" left, "ILLUSTRATIVE FIGURES" right.
- "INCOME RECEIVED" label, then ₹1,20,000 in large serif (counts up from ₹0, en-IN grouping), "Salary credited" in credit green.
- Columns: Bucket · Allocated · Used (Used column hidden on phones). Seven rows, hairline-separated:
  Needs ₹52,000 71% · Financial Freedom ₹18,000 40% · Education ₹8,000 55% · Play ₹12,000 88% · Long-Term Savings ₹14,000 30% · Giving ₹6,000 100% · Agri ₹10,000 22%
- Used bars: ink fill; saffron at ≥85%; ochre at 100%.
- Total row: "TOTAL ALLOCATED" ₹1,20,000 in serif, then a double rule that draws left→right.
- Below the total, in its own band (so it never covers a figure): the stamp — "FULLY ALLOCATED / every rupee placed" in ochre, double border, rotated −7°, mix-blend-mode multiply.

Entrance (one strong sequence, CSS-only): rows rise in with a 90ms stagger, bars fill left→right, total rule draws, then the stamp lands (scale 1.7→0.95→1 with rotation, cubic-bezier(.3,1.4,.5,1)) at ~1.55s.

## 6. Motion rules
Sparse and purposeful. The hero entrance above; a once-only fade/rise (18px, 0.7s) as sections scroll in; bucket bars grow from the baseline; button hover lift. Nothing loops. The H1 must never be animated in or hidden behind motion — it is the largest paint and must be visible immediately. Respect prefers-reduced-motion: drop every animation and show the finished state.

## 7. Accessibility and quality bar
- WCAG AA contrast on the listed pairings (ink on paper ≈13:1, ink-mute on paper ≈5.4:1, ochre on paper ≈5.5:1, saffron-on-ink on ink ≈7:1). Saffron is never used for text on paper.
- One `<main id="landing-main">` and a "Skip to main content" link as the first focusable element. Semantic headings (one h1).
- All tap targets ≥44px tall; footer links ≥24px. Visible focus rings (2px ink, 3px offset; saffron-on-ink on dark bands).
- No text below 12px. Decorative bars/SVGs aria-hidden; their values also appear as text.
- Product panels: plain buttons with aria-current (NOT role="tablist"), live region on the desktop panel.
- No horizontal scroll at 375px. Test at 375, 768, 1280, 1440.

## 8. Content rules (important)
Every claim must be true of the product. Do NOT invent: user counts, "tracked" totals, star ratings, app-store badges, press logos, testimonials, or customer names. If a section would normally have social proof, leave it out. All ledger/panel figures are illustrative and must be labelled so. Use these exact bucket names: Needs, Financial Freedom, Education, Play, Long-Term Savings, Giving, Agri. Do not say a salary "auto-splits" — the user sets the allocation themselves.

Bucket purposes (one line each):
- Needs — Rent, food, transport, health — whatever keeps the month running.
- Financial Freedom — Money set aside to buy your own independence, one month at a time.
- Education — Courses, fees, books — learning treated as a line, not a leftover.
- Play — Spend it without guilt. It was planned for.
- Long-Term Savings — The slow money: the house, the retirement, the rainy decade.
- Giving — What you share, decided before the month can talk you out of it.
- Agri — Land, inputs and farm goals — the bucket most apps forget.

## 9. Deliverable
One responsive landing page with the sections above, data (buckets, plans, FAQ, commitments, product entries) in separate typed constants so copy can change without touching layout, and a single CSS file/section holding the design tokens.
