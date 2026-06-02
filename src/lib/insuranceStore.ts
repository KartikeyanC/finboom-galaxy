import { useCallback, useEffect, useState } from "react";

export type InsuranceCategory = "health" | "life" | "vehicle" | "gadget" | "other";

export interface InsurancePolicy {
  id: string;
  category: InsuranceCategory;
  provider: string;
  policyNumber: string;
  sumInsured: number;
  premium: number;
  /** ISO YYYY-MM-DD */
  dueDate: string;
  documentName?: string;
  notes?: string;
  createdAt: string;
}

const STORAGE_KEY = "insurance.policies.v1";

function offset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seed(): InsurancePolicy[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      category: "health",
      provider: "Star Health",
      policyNumber: "SH-2024-88421",
      sumInsured: 1000000,
      premium: 18450,
      dueDate: offset(9),
      documentName: "star-health-2024.pdf",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      category: "life",
      provider: "HDFC Life Click2Protect",
      policyNumber: "HDFC-LF-77321",
      sumInsured: 10000000,
      premium: 21200,
      dueDate: offset(42),
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      category: "vehicle",
      provider: "ACKO Auto",
      policyNumber: "ACKO-MH12-9821",
      sumInsured: 650000,
      premium: 7480,
      dueDate: offset(-3),
      createdAt: now,
    },
  ];
}

function load(): InsurancePolicy[] {
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

function save(items: InsurancePolicy[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("insurance:changed"));
}

export function useInsurance() {
  const [items, setItems] = useState<InsurancePolicy[]>(() => load());

  useEffect(() => {
    const onChange = () => setItems(load());
    window.addEventListener("insurance:changed", onChange);
    return () => window.removeEventListener("insurance:changed", onChange);
  }, []);

  const add = useCallback((p: Omit<InsurancePolicy, "id" | "createdAt">) => {
    const next: InsurancePolicy = { ...p, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const all = [...load(), next];
    save(all);
  }, []);

  const update = useCallback((id: string, patch: Partial<InsurancePolicy>) => {
    save(load().map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const remove = useCallback((id: string) => {
    save(load().filter((i) => i.id !== id));
  }, []);

  return { items, add, update, remove };
}

export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export const CATEGORY_META: Record<InsuranceCategory, { label: string; emoji: string; tone: string }> = {
  health: { label: "Health", emoji: "🏥", tone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  life: { label: "Life", emoji: "🛡️", tone: "bg-sky-500/10 text-sky-500 border-sky-500/20" },
  vehicle: { label: "Vehicle", emoji: "🚗", tone: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  gadget: { label: "Gadget", emoji: "📱", tone: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  other: { label: "Other", emoji: "📦", tone: "bg-muted text-muted-foreground border-border" },
};