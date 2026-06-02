import { useCallback, useEffect, useState } from "react";

export type BillingFrequency = "weekly" | "monthly" | "annual";

export interface SubscriptionRecord {
  id: string;
  name: string;
  icon?: string; // emoji
  amount: number;
  currency: string;
  frequency: BillingFrequency;
  /** ISO date YYYY-MM-DD */
  renewalDate: string;
  status: "active" | "cancel";
  category?: string;
  createdAt: string;
}

const STORAGE_KEY = "subscriptions.records.v1";

function offset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seed(): SubscriptionRecord[] {
  const now = new Date().toISOString();
  return [
    { id: crypto.randomUUID(), name: "Netflix", icon: "🎬", amount: 649, currency: "INR", frequency: "monthly", renewalDate: offset(3), status: "active", createdAt: now },
    { id: crypto.randomUUID(), name: "Spotify Premium", icon: "🎵", amount: 119, currency: "INR", frequency: "monthly", renewalDate: offset(7), status: "active", createdAt: now },
    { id: crypto.randomUUID(), name: "iCloud+ 200GB", icon: "☁️", amount: 75, currency: "INR", frequency: "monthly", renewalDate: offset(12), status: "active", createdAt: now },
    { id: crypto.randomUUID(), name: "ChatGPT Plus", icon: "🤖", amount: 1799, currency: "INR", frequency: "monthly", renewalDate: offset(18), status: "active", createdAt: now },
    { id: crypto.randomUUID(), name: "Amazon Prime", icon: "📦", amount: 1499, currency: "INR", frequency: "annual", renewalDate: offset(60), status: "active", createdAt: now },
    { id: crypto.randomUUID(), name: "Adobe CC", icon: "🎨", amount: 1675, currency: "INR", frequency: "monthly", renewalDate: offset(22), status: "cancel", createdAt: now },
  ];
}

function load(): SubscriptionRecord[] {
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

function save(items: SubscriptionRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("subscriptions:changed"));
}

export function useSubscriptions() {
  const [items, setItems] = useState<SubscriptionRecord[]>(() => load());

  useEffect(() => {
    const onChange = () => setItems(load());
    window.addEventListener("subscriptions:changed", onChange);
    return () => window.removeEventListener("subscriptions:changed", onChange);
  }, []);

  const add = useCallback((s: Omit<SubscriptionRecord, "id" | "createdAt">) => {
    save([...load(), { ...s, id: crypto.randomUUID(), createdAt: new Date().toISOString() }]);
  }, []);

  const update = useCallback((id: string, patch: Partial<SubscriptionRecord>) => {
    save(load().map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const remove = useCallback((id: string) => {
    save(load().filter((s) => s.id !== id));
  }, []);

  return { items, add, update, remove };
}

export function monthlyEquivalent(s: SubscriptionRecord): number {
  if (s.frequency === "monthly") return s.amount;
  if (s.frequency === "weekly") return (s.amount * 52) / 12;
  return s.amount / 12;
}

export function annualEquivalent(s: SubscriptionRecord): number {
  if (s.frequency === "annual") return s.amount;
  if (s.frequency === "monthly") return s.amount * 12;
  return s.amount * 52;
}