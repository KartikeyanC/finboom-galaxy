import { useCallback, useEffect, useMemo, useState } from "react";
import { SEED_STREAMS, type IncomeStream, type IncomeCurrency, type IncomeFrequency, DEFAULT_FX } from "@/lib/incomeSeed";

const STORAGE_KEY = "valar.income.streams";

function load(): IncomeStream[] {
  if (typeof window === "undefined") return SEED_STREAMS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_STREAMS;
    const parsed = JSON.parse(raw) as IncomeStream[];
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED_STREAMS;
    return parsed;
  } catch {
    return SEED_STREAMS;
  }
}

export function useIncomeStreams() {
  const [streams, setStreams] = useState<IncomeStream[]>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(streams));
    } catch {}
  }, [streams]);

  const visible = useMemo(
    () => [...streams].filter((s) => s.isVisible).sort((a, b) => a.displayOrder - b.displayOrder),
    [streams]
  );

  const toggleVisible = useCallback((id: string) => {
    setStreams((prev) => prev.map((s) => (s.id === id ? { ...s, isVisible: !s.isVisible } : s)));
  }, []);

  const reorder = useCallback((sourceId: string, targetId: string) => {
    setStreams((prev) => {
      const vis = [...prev].filter((s) => s.isVisible).sort((a, b) => a.displayOrder - b.displayOrder);
      const fromIdx = vis.findIndex((s) => s.id === sourceId);
      const toIdx = vis.findIndex((s) => s.id === targetId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const [moved] = vis.splice(fromIdx, 1);
      vis.splice(toIdx, 0, moved);
      const orderMap = new Map(vis.map((s, i) => [s.id, i + 1]));
      return prev.map((s) => (orderMap.has(s.id) ? { ...s, displayOrder: orderMap.get(s.id)! } : s));
    });
  }, []);

  const move = useCallback((id: string, dir: -1 | 1) => {
    setStreams((prev) => {
      const vis = [...prev].filter((s) => s.isVisible).sort((a, b) => a.displayOrder - b.displayOrder);
      const idx = vis.findIndex((s) => s.id === id);
      const swap = idx + dir;
      if (idx === -1 || swap < 0 || swap >= vis.length) return prev;
      [vis[idx], vis[swap]] = [vis[swap], vis[idx]];
      const orderMap = new Map(vis.map((s, i) => [s.id, i + 1]));
      return prev.map((s) => (orderMap.has(s.id) ? { ...s, displayOrder: orderMap.get(s.id)! } : s));
    });
  }, []);

  const add = useCallback(
    (input: {
      name: string;
      amount: number;
      currency: IncomeCurrency;
      exchangeRateToINR: number;
      icon?: string;
      type?: "active" | "passive";
      frequency?: IncomeFrequency;
      notes?: string;
    }) => {
      setStreams((prev) => {
        const maxOrder = prev.reduce((m, s) => Math.max(m, s.displayOrder), 0);
        const next: IncomeStream = {
          id: `custom-${Date.now()}`,
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
        };
        return [...prev, next];
      });
    },
    []
  );

  const remove = useCallback((id: string) => {
    setStreams((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const resetAll = useCallback(() => setStreams(SEED_STREAMS), []);

  return { streams, visible, toggleVisible, reorder, move, add, remove, resetAll };
}