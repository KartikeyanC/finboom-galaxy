# ADR-0009 — Product analytics is derived from existing records, not tracked

**Status:** Accepted (2026-08-12, roadmap 5.8).

## Context

Stage 5.8 asked for activation, retention and conversion funnels. The obvious ways to get them all
involve collecting something new:

1. **A third-party vendor** (PostHog, Plausible, Mixpanel, Umami). Richest dashboards, fastest to
   stand up. Adds a script to the page, a new sub-processor to the privacy policy, and — even on a
   free tier — a service the project does not control.
2. **A first-party events table.** Named events with properties, written from the app. Full funnels
   including per-screen drop-off. Costs a migration, RLS, a retention policy, an entry in the
   Stage 5.2 export inventory, and a privacy-policy rewrite with a `LEGAL_VERSION` bump — which
   invalidates every acceptance already recorded.
3. **Derive it.** Every finance row already carries `created_at`; workspaces carry `created_at`;
   `auth.users` carries `last_sign_in_at`; subscriptions carry a plan and a status. Activation is
   "did a first transaction ever appear", retention is "which months did this workspace write
   anything in", conversion is "which plan is actually in force".

Stage 5.1 shipped a privacy policy whose summary — the part a prospective customer reads first —
says there is no analytics or tracking script and no advertising cookies. For a product that holds
someone's entire financial life, that sentence is worth more than a drop-off chart.

## Decision

**Option 3.** Two `SECURITY DEFINER` functions, `po_tenant_engagement()` and
`po_tenant_activity_months()`, return **aggregates and timestamps only** — counts, first-write
dates, last-activity dates. No amount, no description, no category. `src/lib/analytics.ts` holds
every definition (cohorts, funnel, retention matrix, MRR) as pure functions;
`src/pages/po/PoAnalytics.tsx` renders them at `/po/analytics`.

Nothing new is collected, so no new consent is needed, nothing new is retained, and there is no new
record to add to the data export. `LEGAL_VERSION` is therefore **not** bumped; the privacy policy's
"Cookies and tracking" section gains a paragraph saying plainly that usage is measured by counting
records already held.

## Consequences

- **The blind spot is real and permanent: anonymous visitors are invisible.** There is no
  landing-page → sign-up funnel and no per-screen drop-off. This measures what people did with the
  product, not what they browsed. The page says so, in as many words, at the bottom.
- **Reading leaves no trace.** A workspace opened every morning and never edited looks dormant to
  `last_activity_at`. `last_sign_in_at` is carried alongside it and the liveness buckets use the
  later of the two — which is the closest thing to a session this design will ever have.
- The functions must be `SECURITY DEFINER`, because the Product Owner has no RLS access to any
  finance table and must not be given one (CLAUDE.md). The reviewable claim is the `SELECT` list:
  it returns no financial value.
- Cohort months are bucketed in **UTC** on both sides, because `date_trunc` runs in UTC on Supabase
  and a local bucket would silently disagree with the retention matrix.
- Activation is defined by the same three steps as the first-run checklist (`lib/onboarding.ts`),
  and a test asserts they stay identical — otherwise the product and the console disagree about
  what "set up" means, and only one of them is talking to the user.
- If a landing-page funnel is ever genuinely needed, that is a new decision with a new cost
  (a counter, a policy paragraph, and probably a version bump). This ADR does not pre-approve it.

## Where it lives

`supabase/migrations/20260812120000_stage5_analytics.sql` · `src/lib/analytics.ts` ·
`src/hooks/usePoAnalytics.ts` · `src/pages/po/PoAnalytics.tsx` · `e2e/po-analytics.spec.ts`.
The guard that keeps the privacy claim true is in `src/lib/analytics.test.ts` — it fails if an
analytics vendor appears in the source, in `index.html`, or in `package.json`.
