import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";

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

/** Legacy localStorage reader — used only for the one-time migration to the DB. */
function readLocal(): NetWorthEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// NOTE: net-worth history used to be fabricated here by scaling the current
// value to 82% and walking it forward with invented growth rates, cached in
// localStorage under "networth.history.v1". It has been removed — real history
// now lives in `net_worth_snapshots` via useNetWorthHistory().

type NetWorthRow = {
  id: string;
  kind: string;
  grp: string;
  name: string;
  amount: number;
  created_at: string;
};

function rowToEntry(r: NetWorthRow): NetWorthEntry {
  return {
    id: r.id,
    kind: r.kind as LedgerKind,
    group: r.grp as AssetGroup | LiabilityGroup,
    name: r.name,
    amount: Number(r.amount),
    createdAt: r.created_at,
  };
}

/** Map camelCase entry fields (full or partial) to snake_case columns. */
function entryToRow(e: Partial<NetWorthEntry>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (e.kind !== undefined) row.kind = e.kind;
  if (e.group !== undefined) row.grp = e.group;
  if (e.name !== undefined) row.name = e.name;
  if (e.amount !== undefined) row.amount = e.amount;
  return row;
}

export function useNetWorth() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["net_worth_entries", currentTenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("net_worth_entries")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as NetWorthRow[]).map(rowToEntry);
    },
  });

  const items = data ?? [];
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["net_worth_entries"] }),
    [qc],
  );

  const add = useCallback(
    async (entry: Omit<NetWorthEntry, "id" | "createdAt">) => {
      if (!currentTenantId) return;
      const { error } = await supabase
        .from("net_worth_entries")
        .insert({ ...entryToRow(entry), tenant_id: currentTenantId } as unknown as TablesInsert<"net_worth_entries">);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const update = useCallback(
    async (id: string, patch: Partial<NetWorthEntry>) => {
      const { error } = await supabase
        .from("net_worth_entries")
        .update(entryToRow(patch) as unknown as TablesUpdate<"net_worth_entries">)
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("net_worth_entries")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  // One-time migration of legacy localStorage entries into the DB.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || migratedRef.current) return;
    const flag = `finroot.migrated.networth.${currentTenantId}`;
    if (localStorage.getItem(flag)) return;
    migratedRef.current = true;
    const local = readLocal();
    if ((data?.length ?? 0) === 0 && local.length > 0) {
      void (async () => {
        const rows = local.map((e) => ({ ...entryToRow(e), tenant_id: currentTenantId }));
        const { error } = await supabase
          .from("net_worth_entries")
          .insert(rows as unknown as TablesInsert<"net_worth_entries">[]);
        if (!error) {
          localStorage.setItem(flag, "1");
          invalidate();
        }
      })();
    } else {
      localStorage.setItem(flag, "1");
    }
  }, [currentTenantId, isLoading, data, invalidate]);

  const totals = items.reduce(
    (acc, e) => {
      if (e.kind === "asset") acc.assets += Number(e.amount);
      else acc.liabilities += Number(e.amount);
      return acc;
    },
    { assets: 0, liabilities: 0 },
  );

  const netWorth = totals.assets - totals.liabilities;

  // Kept only to clear the fabricated series that older builds wrote here.
  const history = (() => {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* noop */
    }
    return [] as { month: string; value: number }[];
  })();

  return { items, add, update, remove, totals, netWorth, history };
}