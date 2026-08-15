import { useTenantSetting } from "@/hooks/useTenantSetting";
import type { CustomCategories } from "@/lib/tenantSettings";

export const ACTIVE_INCOME = ["Salary", "Freelance", "Business"] as const;
export const PASSIVE_INCOME = [
  "Investment",
  "Rental",
  "Dividend",
  "Interest",
  "Other",
] as const;

export type IncomeSubtype = "active" | "passive";

export function getIncomeSubtype(cat: string, custom?: CustomStore): IncomeSubtype {
  if (custom?.income.active.includes(cat)) return "active";
  if (custom?.income.passive.includes(cat)) return "passive";
  return (ACTIVE_INCOME as readonly string[]).includes(cat) ? "active" : "passive";
}

/** Dark-theme badge classes — light text on tinted bg (for dark surfaces). */
export const INCOME_COLORS: Record<string, string> = {
  Salary: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Freelance: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
  Business: "bg-emerald-600/15 text-emerald-300 border-emerald-600/30",
  Investment: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  Rental: "bg-teal-400/15 text-teal-200 border-teal-400/30",
  Dividend: "bg-green-500/15 text-green-300 border-green-500/30",
  Interest: "bg-lime-500/15 text-lime-300 border-lime-500/30",
};

export const EXPENSE_COLORS: Record<string, string> = {
  "Food & Dining": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  "Travel & Transport": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  Transport: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  Shopping: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  Healthcare: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  Education: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  Travel: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  Subscriptions: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Utilities: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Rent: "bg-red-500/15 text-red-300 border-red-500/30",
  "Personal Care": "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  Entertainment: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

/** Light-theme badge classes — dark text on named bg shades (for white surfaces). */
const INCOME_COLORS_LIGHT: Record<string, string> = {
  Salary: "bg-emerald-100 text-emerald-700 border-emerald-300",
  Freelance: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Business: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Investment: "bg-teal-100 text-teal-700 border-teal-300",
  Rental: "bg-teal-50 text-teal-600 border-teal-200",
  Dividend: "bg-green-100 text-green-700 border-green-300",
  Interest: "bg-lime-100 text-lime-700 border-lime-300",
};

const EXPENSE_COLORS_LIGHT: Record<string, string> = {
  "Food & Dining": "bg-amber-100 text-amber-700 border-amber-300",
  "Travel & Transport": "bg-orange-100 text-orange-700 border-orange-300",
  Transport: "bg-orange-100 text-orange-700 border-orange-300",
  Shopping: "bg-pink-100 text-pink-700 border-pink-300",
  Healthcare: "bg-rose-100 text-rose-700 border-rose-300",
  Education: "bg-blue-100 text-blue-700 border-blue-300",
  Travel: "bg-cyan-100 text-cyan-700 border-cyan-300",
  Subscriptions: "bg-violet-100 text-violet-700 border-violet-300",
  Utilities: "bg-amber-100 text-amber-800 border-amber-300",
  Rent: "bg-red-100 text-red-700 border-red-300",
  "Personal Care": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300",
  Entertainment: "bg-indigo-100 text-indigo-700 border-indigo-300",
};

export function categoryBadgeClass(
  type: "income" | "expense" | "transfer",
  cat: string,
  isLight = false,
) {
  // Transfers are neither earning nor spending, so they get a neutral badge
  // rather than borrowing the expense palette and reading as money lost.
  if (type === "transfer") {
    return isLight
      ? "bg-sky-100 text-sky-700 border-sky-200"
      : "bg-sky-500/15 text-sky-300 border-sky-500/30";
  }
  if (isLight) {
    const m = type === "income" ? INCOME_COLORS_LIGHT : EXPENSE_COLORS_LIGHT;
    return m[cat] ?? "bg-muted text-muted-foreground border-border";
  }
  const map = type === "income" ? INCOME_COLORS : EXPENSE_COLORS;
  return map[cat] ?? "bg-muted text-muted-foreground border-border";
}

// ---- Custom categories (tenant_settings since Stage 3.1) ----
//
// Was localStorage key `custom-categories-v1`, unnamespaced: every account on a
// browser profile shared one list, and a collaborator never saw the categories
// their teammate created — while the transactions labelled with them WERE
// shared, so the same row read as a known category for one member and a stray
// string for another. Now per-workspace, with a one-time import of the old key.
// The returned API is unchanged so call sites did not move.
type CustomStore = CustomCategories;

export function useCustomCategories() {
  const { value: store, setValue: persist } = useTenantSetting("custom_categories");

  return {
    store,
    addIncome: (sub: IncomeSubtype, name: string) => {
      const n = name.trim();
      if (!n || store.income[sub].includes(n)) return;
      persist({
        ...store,
        income: { ...store.income, [sub]: [...store.income[sub], n] },
      });
    },
    addExpense: (name: string) => {
      const n = name.trim();
      if (!n || store.expense.includes(n)) return;
      persist({ ...store, expense: [...store.expense, n] });
    },
    removeIncome: (sub: IncomeSubtype, name: string) =>
      persist({
        ...store,
        income: {
          ...store.income,
          [sub]: store.income[sub].filter((x) => x !== name),
        },
      }),
    removeExpense: (name: string) =>
      persist({ ...store, expense: store.expense.filter((x) => x !== name) }),
  };
}