/**
 * Stage 2.11 — one place that answers "is there a payment gateway?".
 *
 * Until a gateway exists, upgrades happen manually: the Product Owner assigns a
 * plan from `/po/tenants` and the subscription row carries `provider = 'manual'`.
 * That path works, but the UI used to pretend otherwise — Billing rendered a
 * checkout button and the landing advertised coupon codes that no code path
 * could redeem. Both are dishonest in the same way, and both are fixed by
 * asking this one question first.
 *
 * The signal is the Paddle client token. It is the thing Billing needs before
 * it can open a checkout at all, so if it is absent nothing downstream can
 * complete a purchase — which makes it the honest gate rather than a separate
 * feature flag someone has to remember to flip.
 *
 * @see docs/PADDLE_SETUP.md
 */

/**
 * Where "contact us to upgrade" goes.
 *
 * Stage 5.7 moved the address itself into `lib/support.ts` — this was one of
 * three copies of a placeholder on a domain with no mailbox (BUG-073). Kept as
 * a re-export so the billing call sites read naturally.
 */
export { SUPPORT_EMAIL } from "@/lib/support";
import { SUPPORT_EMAIL as SUPPORT_EMAIL_VALUE } from "@/lib/support";

/**
 * True when a payment provider is configured well enough to attempt checkout.
 *
 * Note this is a *client* signal and deliberately not a security boundary —
 * plan level is enforced server-side by `plan_menus()` / `has_menu()` (2.15).
 * All it does is decide which honest message to show.
 */
export function paymentsConfigured(): boolean {
  const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
  return typeof token === "string" && token.trim().length > 0;
}

/** `mailto:` for a manual upgrade request, pre-filled so the reply is actionable. */
export function contactUpgradeHref(planName?: string, workspace?: string | null): string {
  const subject = planName ? `Upgrade to ${planName}` : "Upgrade my plan";
  const body = [
    planName ? `I'd like to upgrade to the ${planName} plan.` : "I'd like to upgrade my plan.",
    workspace ? `Workspace: ${workspace}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  return `mailto:${SUPPORT_EMAIL_VALUE}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
