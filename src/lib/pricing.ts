/**
 * Landing pricing ⟷ billing catalogue (BUG-019, roadmap 2.10).
 *
 * The `plans` table is the source of truth for what a plan costs. The landing
 * section is PO-editable marketing copy that *links* to a plan by name; the
 * price and period shown on a card are derived from the plan row, never typed
 * by hand. The stored `price`/`period` strings survive only as an offline
 * fallback for the moment before the plans query resolves (and for a card that
 * deliberately sells nothing, e.g. a "talk to us" tier).
 */

export interface PricingCard {
  /** Name of the `plans` row this card sells. Empty = an unlinked marketing card. */
  plan?: string | null;
  name: string;
  /** Fallback only — a linked card renders the plan's price. */
  price: string;
  period?: string;
  blurb: string;
  features: string[];
  cta: string;
  ctaHref?: string;
  highlight?: boolean;
  badge?: string;
}

export interface PricingContent {
  eyebrow: string;
  title: string;
  cards: PricingCard[];
}

/** The columns of `plans` the pricing section needs. */
export interface PlanRow {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  is_active: boolean;
}

export interface ResolvedPricingCard extends PricingCard {
  price: string;
  period: string;
  /** Where the rendered price came from. */
  source: "plan" | "content";
  planId?: string;
}

export const PRICING_KEY = "landing_pricing";

/**
 * Fallback used while loading or if the site_settings row is unreachable.
 * Kept in step with the seeded catalogue by `pricing.test.ts`.
 */
export const DEFAULT_PRICING: PricingContent = {
  eyebrow: "Pricing",
  title: "Quietly priced. Loudly worth it.",
  cards: [
    {
      plan: "Roots",
      name: "Roots",
      price: "Free",
      period: "",
      blurb: "For anyone starting the habit.",
      features: ["Unlimited transactions", "1 budget cycle", "3 active goals", "Email digests"],
      cta: "Start free",
      ctaHref: "/auth",
      highlight: false,
      badge: "",
    },
    {
      plan: "Canopy",
      name: "Canopy",
      price: "₹299",
      period: "/mo",
      blurb: "For households serious about wealth.",
      features: [
        "Everything in Roots",
        "Unlimited budgets & goals",
        "Multi-currency portfolio",
        "Screenshot → transaction AI",
        "Insurance carryover engine",
      ],
      cta: "Start 14-day trial",
      ctaHref: "/auth",
      highlight: true,
      badge: "Most chosen",
    },
    {
      plan: "Heritage",
      name: "Heritage",
      price: "₹899",
      period: "/mo",
      blurb: "For families and advisors.",
      features: ["Everything in Canopy", "Up to 5 linked profiles", "Advisor seat", "Priority support"],
      cta: "Talk to us",
      ctaHref: "/auth",
      highlight: false,
      badge: "",
    },
  ],
};

const PERIOD_LABEL: Record<string, string> = { month: "/mo", year: "/yr" };

/** Money as the landing shows it: "Free", "₹299", "$9". */
export function formatPlanPrice(
  plan: Pick<PlanRow, "price_cents" | "currency" | "interval">,
): { price: string; period: string } {
  if (!plan.price_cents || plan.price_cents <= 0) return { price: "Free", period: "" };

  const major = plan.price_cents / 100;
  // Whole units read better on a pricing card; keep paise only when they exist.
  const fractionDigits = plan.price_cents % 100 === 0 ? 0 : 2;
  let price: string;
  try {
    price = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: plan.currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(major);
  } catch {
    // Unknown currency code — Intl throws rather than guessing, so neither do we.
    price = `${plan.currency} ${major.toFixed(fractionDigits)}`;
  }

  return { price, period: PERIOD_LABEL[plan.interval] ?? `/${plan.interval}` };
}

function findPlan(plans: PlanRow[] | undefined, name: string | null | undefined) {
  const key = (name ?? "").trim().toLowerCase();
  if (!key || !plans) return undefined;
  return plans.find((p) => p.is_active && p.name.trim().toLowerCase() === key);
}

/**
 * Overlay the catalogue on the marketing copy. `plans` undefined (still
 * loading) leaves every card on its stored strings rather than flashing.
 */
export function resolvePricingCards(
  content: PricingContent,
  plans?: PlanRow[],
): ResolvedPricingCard[] {
  return content.cards.map((card) => {
    const plan = findPlan(plans, card.plan);
    if (!plan) return { ...card, price: card.price, period: card.period ?? "", source: "content" };
    const { price, period } = formatPlanPrice(plan);
    return { ...card, price, period, source: "plan", planId: plan.id };
  });
}

export interface PricingIssue {
  level: "error" | "warning";
  message: string;
}

/**
 * Everything that would make the landing disagree with the catalogue. Shown in
 * the PO console; also what the drift-guard test asserts is empty.
 */
export function pricingIssues(content: PricingContent, plans?: PlanRow[]): PricingIssue[] {
  if (!plans) return [];
  const issues: PricingIssue[] = [];
  const active = plans.filter((p) => p.is_active);

  for (const card of content.cards) {
    const label = card.name || card.plan || "Untitled card";
    const linkName = (card.plan ?? "").trim();

    if (!linkName) {
      issues.push({
        level: "warning",
        message: `“${label}” is not linked to a plan, so its price is hand-typed and can drift.`,
      });
      continue;
    }

    const plan = findPlan(active, linkName);
    if (!plan) {
      issues.push({
        level: "error",
        message: `“${label}” links to the plan “${linkName}”, which is not an active plan.`,
      });
      continue;
    }

    const { price, period } = formatPlanPrice(plan);
    if (card.price !== price || (card.period ?? "") !== period) {
      issues.push({
        level: "warning",
        message: `“${label}” has a stale fallback price (${card.price}${card.period ?? ""}); the plan says ${price}${period}. Save to refresh it.`,
      });
    }
  }

  const linked = new Set(
    content.cards.map((c) => (c.plan ?? "").trim().toLowerCase()).filter(Boolean),
  );
  for (const plan of active) {
    if (!linked.has(plan.name.trim().toLowerCase())) {
      issues.push({
        level: "warning",
        message: `The plan “${plan.name}” is in the catalogue but no card sells it.`,
      });
    }
  }

  return issues;
}

/** Fill in defaults for a value read out of `site_settings`. */
export function normalizePricing(value: unknown): PricingContent {
  const v = value as Partial<PricingContent> | null;
  if (!v || !Array.isArray(v.cards)) return DEFAULT_PRICING;
  return {
    eyebrow: v.eyebrow ?? DEFAULT_PRICING.eyebrow,
    title: v.title ?? DEFAULT_PRICING.title,
    cards: v.cards.map((c) => ({ ...c, features: c.features ?? [] })),
  };
}
