import { useCallback, useEffect, useState } from "react";

export type TripKind = "solo" | "friends" | "family";
/** Legacy. Kept for backwards-compat only. */
export type PaymentSource = "cash" | "card" | "wallet";

export type TripExpense = {
  id: string;
  amount: number;
  /** Account id this expense was paid from (real account id or `_cash`). */
  accountId: string;
  category: string;
  note?: string;
  /** ISO datetime */
  at: string;
  /** For friends/family trips: list of companion names sharing the bill */
  splitWith?: string[];
};

export type Trip = {
  id: string;
  name: string;
  kind: TripKind;
  /** ISO date when trip starts (defaults to created date) */
  startDate: string;
  /** Total planned trip days for burn-rate gauge */
  days: number;
  companions: string[];
  /** accountId → allocated amount (₹) */
  allocation: Record<string, number>;
  expenses: TripExpense[];
  status: "active" | "archived";
  createdAt: string;
  archivedAt?: string;
};

const KEY = "finroots.trips.v1";

/** Normalize older trip records (allocation was {cash, card, wallet}). */
function normalize(raw: any): Trip {
  const t = { ...raw } as any;
  if (
    t.allocation &&
    !Array.isArray(t.allocation) &&
    ("cash" in t.allocation || "card" in t.allocation || "wallet" in t.allocation) &&
    typeof t.allocation.cash !== "undefined"
  ) {
    const old = t.allocation as { cash?: number; card?: number; wallet?: number };
    const next: Record<string, number> = {};
    if (old.cash) next["_cash"] = old.cash;
    if (old.card) next["_legacy_card"] = old.card;
    if (old.wallet) next["_legacy_wallet"] = old.wallet;
    t.allocation = next;
    t.expenses = (t.expenses || []).map((e: any) => ({
      ...e,
      accountId:
        e.accountId ??
        (e.source === "cash"
          ? "_cash"
          : e.source === "card"
            ? "_legacy_card"
            : "_legacy_wallet"),
    }));
  }
  if (!t.allocation || typeof t.allocation !== "object") t.allocation = {};
  return t as Trip;
}

function read(): Trip[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalize);
  } catch {
    return [];
  }
}

function write(trips: Trip[]) {
  localStorage.setItem(KEY, JSON.stringify(trips));
  window.dispatchEvent(new CustomEvent("finroots:trips-changed"));
}

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>(() => read());

  useEffect(() => {
    const sync = () => setTrips(read());
    window.addEventListener("finroots:trips-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("finroots:trips-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const upsert = useCallback((trip: Trip) => {
    const all = read();
    const idx = all.findIndex((t) => t.id === trip.id);
    if (idx >= 0) all[idx] = trip;
    else all.unshift(trip);
    write(all);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((t) => t.id !== id));
  }, []);

  const addExpense = useCallback((tripId: string, exp: TripExpense) => {
    const all = read();
    const t = all.find((x) => x.id === tripId);
    if (!t) return;
    t.expenses = [exp, ...t.expenses];
    write(all);
  }, []);

  const removeExpense = useCallback((tripId: string, expId: string) => {
    const all = read();
    const t = all.find((x) => x.id === tripId);
    if (!t) return;
    t.expenses = t.expenses.filter((e) => e.id !== expId);
    write(all);
  }, []);

  const archive = useCallback((tripId: string) => {
    const all = read();
    const t = all.find((x) => x.id === tripId);
    if (!t) return;
    t.status = "archived";
    t.archivedAt = new Date().toISOString();
    write(all);
  }, []);

  return { trips, upsert, remove, addExpense, removeExpense, archive };
}

export function tripTotals(trip: Trip) {
  const allocated = Object.values(trip.allocation).reduce((s, n) => s + (n || 0), 0);
  const spentByAccount: Record<string, number> = {};
  let spent = 0;
  for (const e of trip.expenses) {
    spentByAccount[e.accountId] = (spentByAccount[e.accountId] || 0) + e.amount;
    spent += e.amount;
  }
  const remainingByAccount: Record<string, number> = {};
  for (const [id, alloc] of Object.entries(trip.allocation)) {
    remainingByAccount[id] = (alloc || 0) - (spentByAccount[id] || 0);
  }
  return {
    allocated,
    spent,
    remaining: Math.max(0, allocated - spent),
    spentByAccount,
    remainingByAccount,
  };
}

export function formatINR(n: number) {
  return Math.round(n).toLocaleString("en-IN");
}