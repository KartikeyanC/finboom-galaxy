import { useCallback, useEffect, useState } from "react";

export type AccountType =
  | "bank"
  | "debit"
  | "credit"
  | "wallet"
  | "cash"
  | "investment"
  | "other";

/** Persisted shape — JSON-friendly. AccountsManager converts to/from its FormState. */
export type StoredAccount = {
  id: string;
  type: AccountType;
  name: string;
  holder?: string;
  bank?: string;
  bankCustom?: string;
  last4?: string;
  expMonth?: string;
  expYear?: string;
  branch?: string;
  openingBalance?: string;
  openingDateISO?: string;
  color?: string;
  icon?: string;
  purposes?: string[];
};

const KEY = "finroots.accounts.v1";

function read(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: StoredAccount[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("finroots:accounts-changed"));
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<StoredAccount[]>(() => read());

  useEffect(() => {
    const sync = () => setAccounts(read());
    window.addEventListener("finroots:accounts-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("finroots:accounts-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const upsert = useCallback((acc: StoredAccount) => {
    const all = read();
    const idx = all.findIndex((a) => a.id === acc.id);
    if (idx >= 0) all[idx] = acc;
    else all.push(acc);
    write(all);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((a) => a.id !== id));
  }, []);

  const setAll = useCallback((list: StoredAccount[]) => write(list), []);

  return { accounts, upsert, remove, setAll };
}

/** Virtual "cash on hand" account. Always present in trip allocation matrix. */
export const CASH_ACCOUNT_ID = "_cash";

/** Map any account type to one of the 4 trip-bucket categories. */
export type TripBucket = "bank" | "credit" | "wallet" | "cash";

export function bucketOf(type: AccountType): TripBucket {
  if (type === "credit") return "credit";
  if (type === "wallet") return "wallet";
  if (type === "cash") return "cash";
  // bank, debit, investment, other → bank bucket
  return "bank";
}

export const BUCKET_META: Record<
  TripBucket,
  { label: string; emoji: string; gradient: { from: string; to: string } }
> = {
  bank: {
    label: "Bank / Debit",
    emoji: "🏦",
    gradient: { from: "#0f3a2d", to: "#1f8a5f" },
  },
  credit: {
    label: "Credit Card",
    emoji: "💳",
    gradient: { from: "#0b1530", to: "#1e3a8a" },
  },
  wallet: {
    label: "Wallet / UPI",
    emoji: "📱",
    gradient: { from: "#2a1648", to: "#7c3aed" },
  },
  cash: {
    label: "Cash",
    emoji: "💵",
    gradient: { from: "#3a2410", to: "#b87333" },
  },
};