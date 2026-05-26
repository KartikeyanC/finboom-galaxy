export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Business",
  "Investment",
  "Rental",
  "Dividend",
  "Interest",
  "Other",
] as const;

export const EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Transport",
  "Shopping",
  "Healthcare",
  "Education",
  "Travel",
  "Subscriptions",
  "Utilities",
  "Rent",
  "Personal Care",
  "Entertainment",
  "Other",
] as const;

export const BUDGET_BUCKETS = [
  "Needs",
  "Financial Freedom",
  "Education",
  "Play",
  "Long-Term Savings",
  "Giving",
  "Agri",
] as const;

export const GOAL_CATEGORIES = [
  "Emergency Fund",
  "Insurance",
  "Travel",
  "Education",
  "Vehicle",
  "Home",
  "Retirement",
  "Gadget",
  "Other",
] as const;

const CURRENCY_SYMBOL: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
};

export function formatMoney(amount: number, currency: string = "INR") {
  const sym = CURRENCY_SYMBOL[currency] ?? "";
  return `${sym}${Number(amount).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

export function formatCompact(amount: number, currency: string = "INR") {
  const sym = CURRENCY_SYMBOL[currency] ?? "";
  if (amount >= 10000000) return `${sym}${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `${sym}${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000) return `${sym}${(amount / 1000).toFixed(1)}K`;
  return `${sym}${amount.toFixed(0)}`;
}

/** Rough FX → INR for cross-currency aggregation (display only). */
const FX_TO_INR: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  EUR: 90,
  GBP: 105,
  AED: 22.7,
};

export function toINR(amount: number, currency: string) {
  return Number(amount) * (FX_TO_INR[currency] ?? 1);
}