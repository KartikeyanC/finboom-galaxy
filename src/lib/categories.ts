import { useEffect, useState } from "react";

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

/** Tailwind badge classes per category. Uses arbitrary color utilities for vivid distinction. */
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

export function categoryBadgeClass(type: "income" | "expense", cat: string) {
  const map = type === "income" ? INCOME_COLORS : EXPENSE_COLORS;
  return map[cat] ?? "bg-muted text-muted-foreground border-border";
}

// ---- Custom categories (localStorage) ----
type CustomStore = {
  income: { active: string[]; passive: string[] };
  expense: string[];
};

const KEY = "custom-categories-v1";
const EMPTY: CustomStore = { income: { active: [], passive: [] }, expense: [] };

function read(): CustomStore {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      income: {
        active: raw?.income?.active ?? [],
        passive: raw?.income?.passive ?? [],
      },
      expense: raw?.expense ?? [],
    };
  } catch {
    return EMPTY;
  }
}

export function useCustomCategories() {
  const [store, setStore] = useState<CustomStore>(() => read());

  useEffect(() => {
    const handler = () => setStore(read());
    window.addEventListener("storage", handler);
    window.addEventListener("custom-cats", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("custom-cats", handler);
    };
  }, []);

  const persist = (next: CustomStore) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    setStore(next);
    window.dispatchEvent(new Event("custom-cats"));
  };

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