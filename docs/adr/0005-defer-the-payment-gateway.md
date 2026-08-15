# ADR-0005 — Defer the payment gateway; upgrades are manual

**Status:** Accepted (2026-08-05, user decision · revisit before public launch).

## Context

Paddle was wired up in Phase 7: `plans.paddle_price_id`, a checkout call in Billing, a
signature-verified webhook that maps a price back to a plan and upserts the subscription. What was
missing was the Paddle account itself — a merchant-of-record signup with tax and identity
paperwork — for a product that has no paying customers yet.

Meanwhile a working upgrade path already existed: the Product Owner assigns a plan from
`/po/tenants`, and the subscription row carries `provider = 'manual'`.

## Decision

Ship without a gateway. Keep the Paddle code, leave `paddle_price_id` null, and make the interface
tell the truth: a single function, `paymentsConfigured()`, asks whether a client token exists, and
everything that would otherwise promise a purchase renders "contact us" instead.

The signal is the Paddle client token rather than a separate feature flag, because it is the thing
Billing genuinely needs before a checkout can complete — so it cannot drift out of step with
reality the way a flag someone has to remember to flip would.

## Consequences

- `upgradeable_plans()` returns nothing while price ids are null, so Billing shows no upgrade path.
  That is correct, not a bug.
- The Stage 5.5 upgrade prompts carry their own action — a pre-filled mail — rather than linking to
  a checkout that cannot complete. When a gateway is configured they switch to Billing automatically,
  because they ask the same question.
- Coupon codes exist in the database and on the landing page but nothing can redeem them. The
  landing copy was corrected to match.
- **Paddle vs Razorpay should be reconsidered** before this is undone: for an INR/UPI product,
  Razorpay is the more natural fit. Swapping is about a day's work — one column, the webhook, the
  checkout call and three `billing-api` calls — so the decision is genuinely still open.

## Where it lives

`src/lib/payments.ts` (`paymentsConfigured()`, `contactUpgradeHref()`), `src/pages/Billing.tsx`,
`supabase/functions/payments-webhook/`, `docs/PADDLE_SETUP.md`.
