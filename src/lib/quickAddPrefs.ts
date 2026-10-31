/**
 * Quick Add remembers what the user picked last time, so the common case is
 * amount → Save. Pure helpers around one localStorage key; every storage call
 * is guarded because storage can be blocked (private windows) or full.
 */
export type QuickAddType = "expense" | "income";

export interface QuickAddPrefs {
  type: QuickAddType;
  currency: string;
  /** Most recent first, distinct, capped at MAX_RECENT per type. */
  recent: Record<QuickAddType, string[]>;
}

export const MAX_RECENT = 5;
const KEY = "finroot.quickAdd.v1";

export const DEFAULT_PREFS: QuickAddPrefs = {
  type: "expense",
  currency: "INR",
  recent: { expense: [], income: [] },
};

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

export function parsePrefs(raw: string | null): QuickAddPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(raw) as Partial<QuickAddPrefs>;
    return {
      type: p.type === "income" ? "income" : "expense",
      currency: typeof p.currency === "string" && p.currency ? p.currency : DEFAULT_PREFS.currency,
      recent: {
        expense: isStrings(p.recent?.expense) ? p.recent!.expense.slice(0, MAX_RECENT) : [],
        income: isStrings(p.recent?.income) ? p.recent!.income.slice(0, MAX_RECENT) : [],
      },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Put `category` first, drop duplicates, keep the newest MAX_RECENT. */
export function pushRecent(list: string[], category: string): string[] {
  return [category, ...list.filter((c) => c !== category)].slice(0, MAX_RECENT);
}

export function loadPrefs(): QuickAddPrefs {
  try {
    return parsePrefs(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: QuickAddPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — the sheet still works, it just forgets */
  }
}
