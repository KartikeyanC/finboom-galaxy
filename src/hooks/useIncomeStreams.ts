import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";
import {
  type IncomeStream,
  type IncomeCurrency,
  type IncomeFrequency,
  DEFAULT_FX,
} from "@/lib/incomeSeed";

const db = supabase;
const TABLE = "income_streams" as const;

const STORAGE_KEY = "valar.income.streams";

/** Legacy localStorage reader — used only for the one-time migration to the DB. */
function readLocal(): IncomeStream[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IncomeStream[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type IncomeStreamRow = {
  id: string;
  name: string;
  type: string;
  icon: string;
  amount: number;
  currency: string;
  exchange_rate_to_inr: number;
  is_visible: boolean;
  display_order: number;
  frequency: string;
  notes: string | null;
};

function rowToStream(r: IncomeStreamRow): IncomeStream {
  return {
    id: r.id,
    name: r.name,
    type: r.type === "active" ? "active" : "passive",
    icon: r.icon,
    amount: Number(r.amount),
    currency: r.currency as IncomeCurrency,
    exchangeRateToINR: Number(r.exchange_rate_to_inr),
    isVisible: r.is_visible,
    displayOrder: r.display_order,
    frequency: r.frequency as IncomeFrequency,
    notes: r.notes ?? undefined,
  };
}

/** Map camelCase fields (full or partial) to snake_case columns. */
function streamToRow(s: Partial<IncomeStream>): TablesUpdate<"income_streams"> {
  const row: TablesUpdate<"income_streams"> = {};
  if (s.name !== undefined) row.name = s.name;
  if (s.type !== undefined) row.type = s.type;
  if (s.icon !== undefined) row.icon = s.icon;
  if (s.amount !== undefined) row.amount = s.amount;
  if (s.currency !== undefined) row.currency = s.currency;
  if (s.exchangeRateToINR !== undefined) row.exchange_rate_to_inr = s.exchangeRateToINR;
  if (s.isVisible !== undefined) row.is_visible = s.isVisible;
  if (s.displayOrder !== undefined) row.display_order = s.displayOrder;
  if (s.frequency !== undefined) row.frequency = s.frequency;
  if (s.notes !== undefined) row.notes = s.notes ?? null;
  return row;
}

/**
 * Multi-currency income streams, persisted server-side in `income_streams`
 * (tenant-scoped, RLS-enforced). Public API is unchanged from the previous
 * localStorage implementation so existing callers keep working.
 */
export function useIncomeStreams() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["income_streams", currentTenantId] as const, [currentTenantId]);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await db
        .from(TABLE)
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as IncomeStreamRow[]).map(rowToStream);
    },
  });

  const streams = useMemo(() => data ?? [], [data]);

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["income_streams"] }),
    [qc],
  );

  /** Optimistically patch the cache so reorder/toggle feel instant. */
  const patchCache = useCallback(
    (updater: (prev: IncomeStream[]) => IncomeStream[]) => {
      qc.setQueryData<IncomeStream[]>(queryKey, (prev) => updater(prev ?? []));
    },
    [qc, queryKey],
  );

  const visible = useMemo(
    () =>
      [...streams]
        .filter((s) => s.isVisible)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [streams],
  );

  const toggleVisible = useCallback(
    async (id: string) => {
      const target = streams.find((s) => s.id === id);
      if (!target) return;
      const nextVisible = !target.isVisible;
      patchCache((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isVisible: nextVisible } : s)),
      );
      const { error } = await db.from(TABLE).update({ is_visible: nextVisible }).eq("id", id);
      if (error) {
        notifyError(error);
        invalidate();
      }
    },
    [streams, patchCache, invalidate],
  );

  /** Persist a new display_order for several rows at once. */
  const persistOrder = useCallback(
    async (orderById: Map<string, number>) => {
      const updates = [...orderById.entries()].map(([id, order]) =>
        db.from(TABLE).update({ display_order: order }).eq("id", id),
      );
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        notifyError(failed.error, { fallback: "Could not save the new order." });
        invalidate();
      }
    },
    [invalidate],
  );

  const reorder = useCallback(
    (sourceId: string, targetId: string) => {
      const vis = [...streams]
        .filter((s) => s.isVisible)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      const fromIdx = vis.findIndex((s) => s.id === sourceId);
      const toIdx = vis.findIndex((s) => s.id === targetId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      const [moved] = vis.splice(fromIdx, 1);
      vis.splice(toIdx, 0, moved);
      const orderMap = new Map(vis.map((s, i) => [s.id, i + 1]));
      patchCache((prev) =>
        prev.map((s) => (orderMap.has(s.id) ? { ...s, displayOrder: orderMap.get(s.id)! } : s)),
      );
      void persistOrder(orderMap);
    },
    [streams, patchCache, persistOrder],
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const vis = [...streams]
        .filter((s) => s.isVisible)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      const idx = vis.findIndex((s) => s.id === id);
      const swap = idx + dir;
      if (idx === -1 || swap < 0 || swap >= vis.length) return;
      [vis[idx], vis[swap]] = [vis[swap], vis[idx]];
      const orderMap = new Map(vis.map((s, i) => [s.id, i + 1]));
      patchCache((prev) =>
        prev.map((s) => (orderMap.has(s.id) ? { ...s, displayOrder: orderMap.get(s.id)! } : s)),
      );
      void persistOrder(orderMap);
    },
    [streams, patchCache, persistOrder],
  );

  const add = useCallback(
    async (input: {
      name: string;
      amount: number;
      currency: IncomeCurrency;
      exchangeRateToINR: number;
      icon?: string;
      type?: "active" | "passive";
      frequency?: IncomeFrequency;
      notes?: string;
    }) => {
      if (!currentTenantId) return;
      const maxOrder = streams.reduce((m, s) => Math.max(m, s.displayOrder), 0);
      const row = streamToRow({
        name: input.name.trim() || "Custom",
        type: input.type ?? "passive",
        icon: input.icon ?? "Coins",
        amount: Number(input.amount) || 0,
        currency: input.currency,
        exchangeRateToINR: Number(input.exchangeRateToINR) || DEFAULT_FX[input.currency],
        isVisible: true,
        displayOrder: maxOrder + 1,
        frequency: input.frequency ?? "monthly",
        notes: input.notes?.trim() || undefined,
      });
      // `row` is built as a partial; `name` is always supplied just above.
      const { error } = await db
        .from(TABLE)
        .insert({ ...row, tenant_id: currentTenantId } as unknown as TablesInsert<"income_streams">);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, streams, invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      patchCache((prev) => prev.filter((s) => s.id !== id));
      const { error } = await db.from(TABLE).delete().eq("id", id);
      if (error) {
        notifyError(error);
        invalidate();
      }
    },
    [patchCache, invalidate],
  );

  const resetAll = useCallback(async () => {
    if (!currentTenantId) return;
    patchCache(() => []);
    const { error } = await db.from(TABLE).delete().eq("tenant_id", currentTenantId);
    if (error) {
      notifyError(error);
      invalidate();
    }
  }, [currentTenantId, patchCache, invalidate]);

  // One-time migration of legacy localStorage income streams into the DB.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || migratedRef.current) return;
    const flag = `finroot.migrated.income.${currentTenantId}`;
    if (localStorage.getItem(flag)) return;
    migratedRef.current = true;
    const local = readLocal();
    if ((data?.length ?? 0) === 0 && local.length > 0) {
      void (async () => {
        const rows = local.map((s) => ({ ...streamToRow(s), tenant_id: currentTenantId }));
        const { error } = await db
          .from(TABLE)
          .insert(rows as unknown as TablesInsert<"income_streams">[]);
        if (!error) {
          localStorage.setItem(flag, "1");
          invalidate();
        }
      })();
    } else {
      localStorage.setItem(flag, "1");
    }
  }, [currentTenantId, isLoading, data, invalidate]);

  return { streams, visible, toggleVisible, reorder, move, add, remove, resetAll };
}
