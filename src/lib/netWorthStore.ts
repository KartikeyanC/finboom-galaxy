import { useCallback, useEffect, useState } from "react";

export type LedgerKind = "asset" | "liability";

export type AssetGroup = "liquid" | "bank" | "mutual_funds" | "stocks" | "other_asset";
export type LiabilityGroup = "credit_card" | "car_loan" | "home_loan" | "personal_loan" | "other_liability";

export interface NetWorthEntry {
  id: string;
  kind: LedgerKind;
  group: AssetGroup | LiabilityGroup;
  name: string;
  amount: number;
  createdAt: string;
}

export const ASSET_GROUPS: { id: AssetGroup; label: string; emoji: string }[] = [
  { id: "liquid", label: "Liquid Cash", emoji: "💵" },
  { id: "bank", label: "Bank Accounts", emoji: "🏦" },
  { id: "mutual_funds", label: "Mutual Funds", emoji: "📈" },
  { id: "stocks", label: "Stock Brokerages", emoji: "🪙" },
  { id: "other_asset", label: "Other Assets", emoji: "🏠" },
];

export const LIABILITY_GROUPS: { id: LiabilityGroup; label: string; emoji: string }[] = [
  { id: "credit_card", label: "Credit Card Outstanding", emoji: "💳" },
  { id: "car_loan", label: "Car Loans", emoji: "🚘" },
  { id: "home_loan", label: "Home EMI", emoji: "🏡" },
  { id: "personal_loan", label: "Personal Loans", emoji: "🧾" },
  { id: "other_liability", label: "Other Liabilities", emoji: "📉" },
];

const STORAGE_KEY = "networth.entries.v1";
const HISTORY_KEY = "networth.history.v1";

function seed(): NetWorthEntry[] {
  const now = new Date().toISOString();
  return [
    { id: crypto.randomUUID(), kind: "asset", group: "liquid", name: "Wallet & Cash", amount: 18000, createdAt: now },
    { id: crypto.randomUUID(), kind: "asset", group: "bank", name: "HDFC Savings", amount: 240000, createdAt: now },
    { id: crypto.randomUUID(), kind: "asset", group: "bank", name: "ICICI Salary", amount: 86000, createdAt: now },
    { id: crypto.randomUUID(), kind: "asset", group: "mutual_funds", name: "Parag Parikh Flexi", amount: 420000, createdAt: now },
    { id: crypto.randomUUID(), kind: "asset", group: "stocks", name: "Zerodha", amount: 312000, createdAt: now },
    { id: crypto.randomUUID(), kind: "asset", group: "stocks", name: "Groww", amount: 88000, createdAt: now },
    { id: crypto.randomUUID(), kind: "liability", group: "credit_card", name: "HDFC Regalia", amount: 24500, createdAt: now },
    { id: crypto.randomUUID(), kind: "liability", group: "car_loan", name: "ICICI Car Loan", amount: 320000, createdAt: now },
    { id: crypto.randomUUID(), kind: "liability", group: "home_loan", name: "SBI Home EMI", amount: 1850000, createdAt: now },
  ];
}

function seedHistory(currentNetWorth: number): { month: string; value: number }[] {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  let v = currentNetWorth * 0.82;
  return months.map((m, i) => {
    v = v * (1 + (0.018 + (i % 2 === 0 ? 0.01 : 0.005)));
    return { month: m, value: Math.round(i === months.length - 1 ? currentNetWorth : v) };
  });
}

function load(): NetWorthEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw);
  } catch {
    return seed();
  }
}

function save(items: NetWorthEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("networth:changed"));
}

export function useNetWorth() {
  const [items, setItems] = useState<NetWorthEntry[]>(() => load());

  useEffect(() => {
    const onChange = () => setItems(load());
    window.addEventListener("networth:changed", onChange);
    return () => window.removeEventListener("networth:changed", onChange);
  }, []);

  const add = useCallback((entry: Omit<NetWorthEntry, "id" | "createdAt">) => {
    save([...load(), { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() }]);
  }, []);

  const update = useCallback((id: string, patch: Partial<NetWorthEntry>) => {
    save(load().map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const remove = useCallback((id: string) => {
    save(load().filter((i) => i.id !== id));
  }, []);

  const totals = items.reduce(
    (acc, e) => {
      if (e.kind === "asset") acc.assets += Number(e.amount);
      else acc.liabilities += Number(e.amount);
      return acc;
    },
    { assets: 0, liabilities: 0 },
  );

  const netWorth = totals.assets - totals.liabilities;

  const history = (() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) return JSON.parse(raw) as { month: string; value: number }[];
    } catch {
      /* noop */
    }
    const h = seedHistory(netWorth);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    return h;
  })();

  return { items, add, update, remove, totals, netWorth, history };
}