import { useCallback, useEffect, useState } from "react";

export type TripKind = "solo" | "friends" | "family";
export type PaymentSource = "cash" | "card" | "wallet";

export type TripExpense = {
  id: string;
  amount: number;
  source: PaymentSource;
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
  allocation: {
    cash: number;
    card: number;
    wallet: number;
  };
  expenses: TripExpense[];
  status: "active" | "archived";
  createdAt: string;
  archivedAt?: string;
};

const KEY = "finroots.trips.v1";

function read(): Trip[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Trip[];
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
  const allocated = trip.allocation.cash + trip.allocation.card + trip.allocation.wallet;
  const spentBySource = trip.expenses.reduce(
    (acc, e) => {
      acc[e.source] += e.amount;
      acc.total += e.amount;
      return acc;
    },
    { cash: 0, card: 0, wallet: 0, total: 0 },
  );
  return {
    allocated,
    spent: spentBySource.total,
    remaining: Math.max(0, allocated - spentBySource.total),
    remainingBySource: {
      cash: trip.allocation.cash - spentBySource.cash,
      card: trip.allocation.card - spentBySource.card,
      wallet: trip.allocation.wallet - spentBySource.wallet,
    },
    spentBySource,
  };
}

export function formatINR(n: number) {
  return Math.round(n).toLocaleString("en-IN");
}