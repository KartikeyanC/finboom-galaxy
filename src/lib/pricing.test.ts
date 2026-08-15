import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_PRICING,
  formatPlanPrice,
  pricingIssues,
  resolvePricingCards,
  type PlanRow,
  type PricingContent,
} from "./pricing";

/**
 * BUG-019: the landing sold ₹0/₹299/₹899 while the billing catalogue held
 * $0/$9. Nothing tied the two together, so nobody noticed for months.
 *
 * `plans` is now the source of truth and each landing card links to a plan by
 * name. The last block here is the drift guard: it parses the seeded catalogue
 * out of the migrations and asserts DEFAULT_PRICING (the copy shipped in the
 * bundle, and what a visitor sees before the network resolves) still agrees
 * with it. Offline, so it runs in CI without a database.
 */

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

/** The plan rows seeded by the most recent migration that writes the catalogue. */
function catalogueFromMigrations(): PlanRow[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let latest: string | null = null;
  for (const f of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, f), "utf8");
    if (/INSERT\s+INTO\s+public\.plans\s*\(/i.test(sql)) latest = sql;
  }
  if (!latest) throw new Error("No migration seeds public.plans");

  const insert = latest.slice(latest.search(/INSERT\s+INTO\s+public\.plans\s*\(/i));
  const values = insert.slice(0, insert.search(/ON\s+CONFLICT/i));

  // ('Roots', 0, 'INR', 'month', ...
  const rows = [...values.matchAll(/\(\s*'([^']+)'\s*,\s*(\d+)\s*,\s*'([A-Za-z]{3})'\s*,\s*'(\w+)'/g)];
  return rows.map((m, i) => ({
    id: `seed-${i}`,
    name: m[1],
    price_cents: Number(m[2]),
    currency: m[3],
    interval: m[4],
    is_active: true,
  }));
}

const plan = (over: Partial<PlanRow> = {}): PlanRow => ({
  id: "p1",
  name: "Canopy",
  price_cents: 29900,
  currency: "INR",
  interval: "month",
  is_active: true,
  ...over,
});

const content = (cards: PricingContent["cards"]): PricingContent => ({
  eyebrow: "Pricing",
  title: "Title",
  cards,
});

const card = (over: Partial<PricingContent["cards"][number]> = {}) => ({
  plan: "Canopy",
  name: "Canopy",
  price: "₹299",
  period: "/mo",
  blurb: "",
  features: [],
  cta: "Start",
  ...over,
});

describe("formatPlanPrice", () => {
  it("calls a zero-cost plan Free, with no period", () => {
    expect(formatPlanPrice(plan({ price_cents: 0 }))).toEqual({ price: "Free", period: "" });
  });

  it("formats rupees without decimals when the amount is whole", () => {
    expect(formatPlanPrice(plan({ price_cents: 29900 }))).toEqual({ price: "₹299", period: "/mo" });
  });

  it("keeps paise when they exist", () => {
    expect(formatPlanPrice(plan({ price_cents: 29950 })).price).toBe("₹299.50");
  });

  it("formats other currencies", () => {
    expect(formatPlanPrice(plan({ price_cents: 900, currency: "USD" })).price).toBe("$9");
  });

  it("marks a yearly plan /yr", () => {
    expect(formatPlanPrice(plan({ interval: "year" })).period).toBe("/yr");
  });

  it("prints an unrecognised but well-formed code as-is", () => {
    // Intl separates the code from the amount with U+00A0, not a plain space.
    const price = formatPlanPrice(plan({ currency: "XYZ" })).price;
    expect(price.replace(/\s/g, " ")).toBe("XYZ 299");
  });

  it("falls back to a plain string when Intl rejects the code outright", () => {
    expect(formatPlanPrice(plan({ currency: "RUPEES" })).price).toBe("RUPEES 299");
  });
});

describe("resolvePricingCards", () => {
  it("takes the price from the linked plan, not the stored string", () => {
    const [resolved] = resolvePricingCards(content([card({ price: "₹1", period: "/wk" })]), [plan()]);
    expect(resolved.price).toBe("₹299");
    expect(resolved.period).toBe("/mo");
    expect(resolved.source).toBe("plan");
  });

  it("keeps the stored strings while the catalogue is still loading", () => {
    const [resolved] = resolvePricingCards(content([card()]), undefined);
    expect(resolved).toMatchObject({ price: "₹299", period: "/mo", source: "content" });
  });

  it("keeps the stored strings for an unlinked card", () => {
    const [resolved] = resolvePricingCards(content([card({ plan: "" })]), [plan()]);
    expect(resolved.source).toBe("content");
  });

  it("ignores an inactive plan", () => {
    const [resolved] = resolvePricingCards(content([card()]), [plan({ is_active: false })]);
    expect(resolved.source).toBe("content");
  });

  it("matches the plan name case- and whitespace-insensitively", () => {
    const [resolved] = resolvePricingCards(content([card({ plan: " canopy " })]), [plan()]);
    expect(resolved.source).toBe("plan");
  });
});

describe("pricingIssues", () => {
  it("is silent when every card and plan line up", () => {
    expect(pricingIssues(content([card()]), [plan()])).toEqual([]);
  });

  it("reports nothing until the catalogue has loaded", () => {
    expect(pricingIssues(content([card({ plan: "Ghost" })]), undefined)).toEqual([]);
  });

  it("errors on a card pointing at a plan that does not exist", () => {
    const issues = pricingIssues(content([card({ plan: "Ghost" })]), [plan()]);
    expect(issues.some((i) => i.level === "error" && /not an active plan/.test(i.message))).toBe(true);
  });

  it("warns about an unlinked card", () => {
    const issues = pricingIssues(content([card({ plan: "" })]), []);
    expect(issues.some((i) => /not linked to a plan/.test(i.message))).toBe(true);
  });

  it("warns when a stored fallback price has gone stale", () => {
    const issues = pricingIssues(content([card({ price: "₹199" })]), [plan()]);
    expect(issues.some((i) => /stale fallback price/.test(i.message))).toBe(true);
  });

  it("warns about a plan no card sells", () => {
    const issues = pricingIssues(content([card()]), [plan(), plan({ id: "p2", name: "Heritage" })]);
    expect(issues.some((i) => /no card sells it/.test(i.message))).toBe(true);
  });
});

describe("landing pricing vs the seeded plans catalogue", () => {
  const catalogue = catalogueFromMigrations();

  it("parses a non-empty catalogue out of the migrations", () => {
    expect(catalogue.length).toBeGreaterThan(0);
  });

  it("gives every plan exactly one card", () => {
    const linked = DEFAULT_PRICING.cards.map((c) => (c.plan ?? "").trim().toLowerCase());
    for (const p of catalogue) {
      const matches = linked.filter((l) => l === p.name.toLowerCase());
      expect(matches.length, `cards selling ${p.name}`).toBe(1);
    }
  });

  it("links every card to a plan that exists", () => {
    for (const c of DEFAULT_PRICING.cards) {
      const found = catalogue.find((p) => p.name.toLowerCase() === (c.plan ?? "").trim().toLowerCase());
      expect(found, `card "${c.name}" links to plan "${c.plan}"`).toBeTruthy();
    }
  });

  it("quotes the same price the catalogue charges", () => {
    for (const c of DEFAULT_PRICING.cards) {
      const p = catalogue.find((x) => x.name.toLowerCase() === (c.plan ?? "").trim().toLowerCase());
      if (!p) continue;
      const { price, period } = formatPlanPrice(p);
      expect(c.price, `price on "${c.name}"`).toBe(price);
      expect(c.period ?? "", `period on "${c.name}"`).toBe(period);
    }
  });

  it("reports no drift at all", () => {
    expect(pricingIssues(DEFAULT_PRICING, catalogue)).toEqual([]);
  });
});
