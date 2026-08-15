import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";

export type TripKind = "solo" | "friends" | "family" | "other";
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

const KEY = "finroot.trips.v1";

/** Normalize older trip records (allocation was {cash, card, wallet}). */
function normalize(raw: unknown): Trip {
  const t: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const allocation = t.allocation;
  if (
    allocation &&
    typeof allocation === "object" &&
    !Array.isArray(allocation) &&
    ("cash" in allocation || "card" in allocation || "wallet" in allocation) &&
    typeof (allocation as { cash?: number }).cash !== "undefined"
  ) {
    const old = allocation as { cash?: number; card?: number; wallet?: number };
    const next: Record<string, number> = {};
    if (old.cash) next["_cash"] = old.cash;
    if (old.card) next["_legacy_card"] = old.card;
    if (old.wallet) next["_legacy_wallet"] = old.wallet;
    t.allocation = next;
    const expenses = Array.isArray(t.expenses) ? (t.expenses as Record<string, unknown>[]) : [];
    t.expenses = expenses.map((e) => ({
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
  return t as unknown as Trip;
}

/** Legacy localStorage reader — used only for the one-time migration to the DB. */
function readLocal(): Trip[] {
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

type TripRow = {
  id: string;
  name: string;
  kind: string;
  start_date: string | null;
  days: number;
  companions: string[] | null;
  allocation: Record<string, number> | null;
  expenses: TripExpense[] | null;
  status: string;
  archived_at: string | null;
  created_at: string;
};

function rowToTrip(r: TripRow): Trip {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as TripKind,
    startDate: r.start_date ?? "",
    days: r.days,
    companions: r.companions ?? [],
    allocation: r.allocation ?? {},
    expenses: r.expenses ?? [],
    status: r.status as Trip["status"],
    createdAt: r.created_at,
    archivedAt: r.archived_at ?? undefined,
  };
}

function tripToRow(t: Trip, tenantId: string) {
  return {
    id: t.id,
    tenant_id: tenantId,
    name: t.name,
    kind: t.kind,
    start_date: t.startDate ? t.startDate.slice(0, 10) : null,
    days: t.days ?? 0,
    companions: (t.companions ?? []) as unknown as Json,
    allocation: (t.allocation ?? {}) as unknown as Json,
    expenses: (t.expenses ?? []) as unknown as Json,
    status: t.status ?? "active",
    archived_at: t.archivedAt ?? null,
    created_at: t.createdAt ?? new Date().toISOString(),
  };
}

export function useTrips() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["trips", currentTenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as TripRow[]).map(rowToTrip);
    },
  });

  const trips = data ?? [];
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["trips"] }),
    [qc],
  );

  const upsert = useCallback(
    async (trip: Trip) => {
      if (!currentTenantId) return;
      const { error } = await supabase.from("trips").upsert(tripToRow(trip, currentTenantId));
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("trips")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const patchExpenses = useCallback(
    async (tripId: string, next: TripExpense[]) => {
      const { error } = await supabase
        .from("trips")
        .update({ expenses: next as unknown as Json })
        .eq("id", tripId)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const addExpense = useCallback(
    async (tripId: string, exp: TripExpense) => {
      const t = trips.find((x) => x.id === tripId);
      if (!t) return;
      await patchExpenses(tripId, [exp, ...t.expenses]);
    },
    [trips, patchExpenses],
  );

  const removeExpense = useCallback(
    async (tripId: string, expId: string) => {
      const t = trips.find((x) => x.id === tripId);
      if (!t) return;
      await patchExpenses(tripId, t.expenses.filter((e) => e.id !== expId));
    },
    [trips, patchExpenses],
  );

  const archive = useCallback(
    async (tripId: string) => {
      const { error } = await supabase
        .from("trips")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", tripId)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  // One-time migration of legacy localStorage trips into the DB.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || migratedRef.current) return;
    const flag = `finroot.migrated.trips.${currentTenantId}`;
    if (localStorage.getItem(flag)) return;
    migratedRef.current = true;
    const local = readLocal();
    if ((data?.length ?? 0) === 0 && local.length > 0) {
      void (async () => {
        const { error } = await supabase
          .from("trips")
          .upsert(local.map((t) => tripToRow(t, currentTenantId)));
        if (!error) {
          localStorage.setItem(flag, "1");
          invalidate();
        }
      })();
    } else {
      localStorage.setItem(flag, "1");
    }
  }, [currentTenantId, isLoading, data, invalidate]);

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