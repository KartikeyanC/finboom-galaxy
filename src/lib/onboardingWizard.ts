/**
 * Stage 6.1 — pure logic for the new-user onboarding wizard: option lists,
 * the shape of what gets saved, and the small rules around it (max-3 caps,
 * currency-adaptive income ranges, the plain-language summary).
 *
 * No React, no Supabase — same "pure by design" convention as
 * src/lib/onboarding.ts (the *different*, tenant-scoped checklist feature).
 * Every value here is an id or an array of ids; nothing is a free-text
 * amount, matching the product rule that detailed figures are collected
 * later inside the real modules.
 */

export type AgeRange = "18-24" | "25-34" | "35-44" | "45-54" | "55+";
export type Country = "india" | "uae" | "usa" | "uk" | "other";
export type Currency = "INR" | "USD" | "AED" | "EUR" | "GBP" | "OTHER";
export type IncomeSource =
  | "salary" | "business" | "freelance" | "investment" | "property" | "agriculture" | "other";
export type AssetType =
  | "stocks" | "mutual_funds" | "gold" | "fd_bonds" | "crypto"
  | "foreign_investments" | "property" | "cash_bank";
export type LiabilityType =
  | "home_loan" | "personal_loan" | "vehicle_loan" | "credit_card"
  | "business_loan" | "other_debt" | "no_debt";
export type GoalType =
  | "emergency_fund" | "financial_freedom" | "home" | "education" | "marriage"
  | "travel" | "retirement" | "wealth_creation" | "agriculture" | "debt_free" | "other";
export type Timeline = "within_1y" | "1_3y" | "3_5y" | "5_10y" | "10y_plus";
export type InsuranceType = "term" | "life" | "health" | "none";
export type SpendCategory =
  | "housing" | "food" | "travel" | "transportation" | "shopping" | "education"
  | "healthcare" | "entertainment" | "family" | "emi_debt" | "agriculture" | "other";
export type Priority =
  | "save_more" | "reduce_spending" | "invest_more" | "pay_off_debt"
  | "build_emergency_fund" | "financial_freedom";

/** Every field is optional while the wizard is in progress; only shape matters. */
export interface OnboardingSelections {
  ageRange?: AgeRange;
  country?: Country;
  currency?: Currency;
  incomeSources?: IncomeSource[];
  incomeRange?: string;
  assets?: AssetType[];
  liabilities?: LiabilityType[];
  goals?: GoalType[];
  goalTimeline?: Timeline;
  insurance?: InsuranceType[];
  topSpendCategories?: SpendCategory[];
  topPriority?: Priority;
}

export interface Option<T extends string> {
  id: T;
  label: string;
}

export const TOTAL_STEPS = 5;

export const GOALS_MAX = 3;
export const SPEND_CATEGORIES_MAX = 3;

/* ─────────────────────────── Step 1 — Profile ─────────────────────────── */

export const AGE_RANGES: Option<AgeRange>[] = [
  { id: "18-24", label: "18–24" },
  { id: "25-34", label: "25–34" },
  { id: "35-44", label: "35–44" },
  { id: "45-54", label: "45–54" },
  { id: "55+", label: "55+" },
];

export const COUNTRIES: Option<Country>[] = [
  { id: "india", label: "India" },
  { id: "uae", label: "UAE" },
  { id: "usa", label: "USA" },
  { id: "uk", label: "UK" },
  { id: "other", label: "Other" },
];

export const CURRENCIES: Option<Currency>[] = [
  { id: "INR", label: "INR ₹" },
  { id: "USD", label: "USD $" },
  { id: "AED", label: "AED د.إ" },
  { id: "EUR", label: "EUR €" },
  { id: "GBP", label: "GBP £" },
  { id: "OTHER", label: "Other" },
];

/* ─────────────────────────── Step 2 — Income ──────────────────────────── */

export const INCOME_SOURCES: Option<IncomeSource>[] = [
  { id: "salary", label: "Salary / Job" },
  { id: "business", label: "Business" },
  { id: "freelance", label: "Freelance" },
  { id: "investment", label: "Investment" },
  { id: "property", label: "Property / Rent" },
  { id: "agriculture", label: "Agriculture" },
  { id: "other", label: "Other" },
];

/**
 * Monthly income bands, adapted per currency (spec: "automatically adapt
 * the currency/ranges according to the user's selected country/currency").
 * Bands are proportionate to the INR bands the spec gave verbatim, not a
 * precise FX conversion — this is a coarse self-report, not a rate table.
 */
export const INCOME_RANGES_BY_CURRENCY: Record<Currency, Option<string>[]> = {
  INR: [
    { id: "below_25k", label: "Below ₹25K" },
    { id: "25k_50k", label: "₹25K–₹50K" },
    { id: "50k_1l", label: "₹50K–₹1L" },
    { id: "1l_2l", label: "₹1L–₹2L" },
    { id: "2l_plus", label: "₹2L+" },
  ],
  USD: [
    { id: "below_25k", label: "Below $300" },
    { id: "25k_50k", label: "$300–$600" },
    { id: "50k_1l", label: "$600–$1.2K" },
    { id: "1l_2l", label: "$1.2K–$2.4K" },
    { id: "2l_plus", label: "$2.4K+" },
  ],
  AED: [
    { id: "below_25k", label: "Below د.إ1K" },
    { id: "25k_50k", label: "د.إ1K–د.إ2K" },
    { id: "50k_1l", label: "د.إ2K–د.إ4.5K" },
    { id: "1l_2l", label: "د.إ4.5K–د.إ9K" },
    { id: "2l_plus", label: "د.إ9K+" },
  ],
  EUR: [
    { id: "below_25k", label: "Below €280" },
    { id: "25k_50k", label: "€280–€550" },
    { id: "50k_1l", label: "€550–€1.1K" },
    { id: "1l_2l", label: "€1.1K–€2.2K" },
    { id: "2l_plus", label: "€2.2K+" },
  ],
  GBP: [
    { id: "below_25k", label: "Below £240" },
    { id: "25k_50k", label: "£240–£480" },
    { id: "50k_1l", label: "£480–£950" },
    { id: "1l_2l", label: "£950–£1.9K" },
    { id: "2l_plus", label: "£1.9K+" },
  ],
  OTHER: [
    { id: "below_25k", label: "Small" },
    { id: "25k_50k", label: "Modest" },
    { id: "50k_1l", label: "Comfortable" },
    { id: "1l_2l", label: "High" },
    { id: "2l_plus", label: "Very high" },
  ],
};

/* ────────────────────── Step 3 — Financial position ───────────────────── */

export const ASSET_TYPES: Option<AssetType>[] = [
  { id: "stocks", label: "Stocks / Equity" },
  { id: "mutual_funds", label: "Mutual Funds" },
  { id: "gold", label: "Gold" },
  { id: "fd_bonds", label: "FD / Bonds" },
  { id: "crypto", label: "Crypto" },
  { id: "foreign_investments", label: "Foreign Investments" },
  { id: "property", label: "Property" },
  { id: "cash_bank", label: "Cash / Bank" },
];

export const LIABILITY_TYPES: Option<LiabilityType>[] = [
  { id: "home_loan", label: "Home Loan" },
  { id: "personal_loan", label: "Personal Loan" },
  { id: "vehicle_loan", label: "Vehicle Loan" },
  { id: "credit_card", label: "Credit Card" },
  { id: "business_loan", label: "Business Loan" },
  { id: "other_debt", label: "Other Debt" },
  { id: "no_debt", label: "No Debt" },
];

/* ────────────────────── Step 4 — Goals & protection ───────────────────── */

export const GOAL_TYPES: Option<GoalType>[] = [
  { id: "emergency_fund", label: "Emergency Fund" },
  { id: "financial_freedom", label: "Financial Freedom" },
  { id: "home", label: "Home" },
  { id: "education", label: "Education" },
  { id: "marriage", label: "Marriage" },
  { id: "travel", label: "Travel" },
  { id: "retirement", label: "Retirement" },
  { id: "wealth_creation", label: "Wealth Creation" },
  { id: "agriculture", label: "Agriculture" },
  { id: "debt_free", label: "Debt Free" },
  { id: "other", label: "Other" },
];

export const TIMELINES: Option<Timeline>[] = [
  { id: "within_1y", label: "Within 1 Year" },
  { id: "1_3y", label: "1–3 Years" },
  { id: "3_5y", label: "3–5 Years" },
  { id: "5_10y", label: "5–10 Years" },
  { id: "10y_plus", label: "10+ Years" },
];

export const INSURANCE_TYPES: Option<InsuranceType>[] = [
  { id: "term", label: "Term Insurance" },
  { id: "life", label: "Life Insurance" },
  { id: "health", label: "Health Insurance" },
  { id: "none", label: "None" },
];

/* ───────────────────────── Step 5 — Money habits ──────────────────────── */

export const SPEND_CATEGORIES: Option<SpendCategory>[] = [
  { id: "housing", label: "Housing" },
  { id: "food", label: "Food" },
  { id: "travel", label: "Travel" },
  { id: "transportation", label: "Transportation" },
  { id: "shopping", label: "Shopping" },
  { id: "education", label: "Education" },
  { id: "healthcare", label: "Healthcare" },
  { id: "entertainment", label: "Entertainment" },
  { id: "family", label: "Family" },
  { id: "emi_debt", label: "EMI / Debt" },
  { id: "agriculture", label: "Agriculture" },
  { id: "other", label: "Other" },
];

export const PRIORITIES: Option<Priority>[] = [
  { id: "save_more", label: "Save More" },
  { id: "reduce_spending", label: "Reduce Spending" },
  { id: "invest_more", label: "Invest More" },
  { id: "pay_off_debt", label: "Pay Off Debt" },
  { id: "build_emergency_fund", label: "Build Emergency Fund" },
  { id: "financial_freedom", label: "Financial Freedom" },
];

/* ────────────────────────────── helpers ────────────────────────────────── */

export function incomeRangesFor(currency: Currency | undefined): Option<string>[] {
  return INCOME_RANGES_BY_CURRENCY[currency ?? "OTHER"];
}

/** Toggle `id` in a multi-select array, refusing to grow past `max` (if given). */
export function toggleInList<T>(list: T[] | undefined, id: T, max?: number): T[] {
  const current = list ?? [];
  if (current.includes(id)) return current.filter((v) => v !== id);
  if (max !== undefined && current.length >= max) return current;
  return [...current, id];
}

function labelFor<T extends string>(options: Option<T>[], id: T | undefined): string | null {
  return options.find((o) => o.id === id)?.label ?? null;
}

function labelsFor<T extends string>(options: Option<T>[], ids: T[] | undefined): string[] {
  if (!ids?.length) return [];
  return ids.map((id) => labelFor(options, id)).filter((l): l is string => l !== null);
}

/** Whether the current step has enough answered to allow Continue. Step 1 has no Skip, so this is what enables its Continue too. */
export function canProceed(step: number, s: OnboardingSelections): boolean {
  switch (step) {
    case 1:
      return !!s.ageRange && !!s.country && !!s.currency;
    case 2:
      return !!s.incomeSources?.length && !!s.incomeRange;
    case 3:
      return !!s.assets?.length && !!s.liabilities?.length;
    case 4:
      return !!s.goals?.length && !!s.goalTimeline && !!s.insurance?.length;
    case 5:
      return !!s.topSpendCategories?.length && !!s.topPriority;
    default:
      return true;
  }
}

/** Plain-language recap lines for the final "Your Finroot is ready." screen. */
export function buildSummary(s: OnboardingSelections): string[] {
  const lines: string[] = [];

  const profileBits = [
    labelFor(AGE_RANGES, s.ageRange),
    labelFor(COUNTRIES, s.country),
    labelFor(CURRENCIES, s.currency),
  ].filter((v): v is string => !!v);
  if (profileBits.length) lines.push(profileBits.join(" · "));

  const incomeSources = labelsFor(INCOME_SOURCES, s.incomeSources);
  const incomeRange = labelFor(incomeRangesFor(s.currency), s.incomeRange);
  if (incomeSources.length || incomeRange) {
    lines.push(
      [incomeSources.length ? `Earns via ${incomeSources.join(", ")}` : null, incomeRange]
        .filter(Boolean)
        .join(" · "),
    );
  }

  const assets = labelsFor(ASSET_TYPES, s.assets);
  if (assets.length) lines.push(`Holds: ${assets.join(", ")}`);

  const liabilities = labelsFor(LIABILITY_TYPES, s.liabilities);
  if (liabilities.length) lines.push(`Owes: ${liabilities.join(", ")}`);

  const goals = labelsFor(GOAL_TYPES, s.goals);
  const timeline = labelFor(TIMELINES, s.goalTimeline);
  if (goals.length || timeline) {
    lines.push(
      [goals.length ? `Working toward ${goals.join(", ")}` : null, timeline]
        .filter(Boolean)
        .join(" · "),
    );
  }

  const insurance = labelsFor(INSURANCE_TYPES, s.insurance);
  if (insurance.length) lines.push(`Covered by: ${insurance.join(", ")}`);

  const spend = labelsFor(SPEND_CATEGORIES, s.topSpendCategories);
  if (spend.length) lines.push(`Spends most on: ${spend.join(", ")}`);

  const priority = labelFor(PRIORITIES, s.topPriority);
  if (priority) lines.push(`Top priority: ${priority}`);

  return lines;
}
