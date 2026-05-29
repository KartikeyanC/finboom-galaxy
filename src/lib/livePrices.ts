import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCurrent,
  type AssetType,
  type InvestmentRecord,
} from "./investmentsStore";

export const LIVE_ASSETS: AssetType[] = ["stocks", "mutual_funds", "crypto"];

export function isLiveAsset(a: AssetType): boolean {
  return LIVE_ASSETS.includes(a);
}

export interface LiveTick {
  unitPrice: number;
  prevUnitPrice: number;
  currentValue: number;
  prevCurrentValue: number;
  quantity: number;
  updatedAt: number;
  direction: "up" | "down" | "flat";
}

export type LiveMap = Record<string, LiveTick>;

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

function getQuantity(r: InvestmentRecord): number {
  const f = r.fields ?? {};
  switch (r.asset) {
    case "stocks":
      return num(f.quantity) || num(f.qty) || 1;
    case "mutual_funds":
      return num(f.units) || 1;
    case "crypto":
      return num(f.quantity) || num(f.qty) || 1;
    default:
      return 1;
  }
}

function getBaseUnitPrice(r: InvestmentRecord): number {
  const f = r.fields ?? {};
  const qty = getQuantity(r);
  const current = getCurrent(r);
  switch (r.asset) {
    case "stocks":
      return num(f.current_price) || num(f.price) || (qty ? current / qty : current);
    case "mutual_funds":
      return num(f.nav) || num(f.current_nav) || (qty ? current / qty : current);
    case "crypto":
      return num(f.current_price) || num(f.price) || (qty ? current / qty : current);
    default:
      return current;
  }
}

// Seeded pseudo-random walk per id so each refresh produces a small delta.
function nextPrice(prev: number): number {
  if (!prev || !Number.isFinite(prev)) return prev;
  const drift = (Math.random() - 0.48) * 0.02; // ~±2%, slight upward bias
  const next = prev * (1 + drift);
  return Math.max(next, prev * 0.5);
}

export function useLivePrices(records: InvestmentRecord[], intervalMs = 60_000) {
  const [live, setLive] = useState<LiveMap>({});
  const [refreshedAt, setRefreshedAt] = useState<number>(() => Date.now());
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const tick = useCallback(() => {
    const recs = recordsRef.current;
    setLive((prev) => {
      const next: LiveMap = {};
      for (const r of recs) {
        if (!isLiveAsset(r.asset)) continue;
        const qty = getQuantity(r);
        const existing = prev[r.id];
        const prevUnit = existing?.unitPrice ?? getBaseUnitPrice(r);
        const unit = nextPrice(prevUnit) || prevUnit;
        const currentValue = unit * qty;
        const prevCurrentValue = (existing?.unitPrice ?? prevUnit) * qty;
        const direction: LiveTick["direction"] =
          unit > prevUnit ? "up" : unit < prevUnit ? "down" : "flat";
        next[r.id] = {
          unitPrice: unit,
          prevUnitPrice: prevUnit,
          currentValue,
          prevCurrentValue,
          quantity: qty,
          updatedAt: Date.now(),
          direction,
        };
      }
      return next;
    });
    setRefreshedAt(Date.now());
  }, []);

  // Seed once and re-seed when record ids change.
  const idsKey = records.map((r) => r.id).join("|");
  useEffect(() => {
    setLive((prev) => {
      const next: LiveMap = { ...prev };
      for (const r of records) {
        if (!isLiveAsset(r.asset)) {
          delete next[r.id];
          continue;
        }
        if (!next[r.id]) {
          const qty = getQuantity(r);
          const unit = getBaseUnitPrice(r);
          next[r.id] = {
            unitPrice: unit,
            prevUnitPrice: unit,
            currentValue: unit * qty,
            prevCurrentValue: unit * qty,
            quantity: qty,
            updatedAt: Date.now(),
            direction: "flat",
          };
        }
      }
      // prune removed records
      for (const id of Object.keys(next)) {
        if (!records.find((r) => r.id === id)) delete next[id];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [tick, intervalMs]);

  const refresh = useCallback(() => tick(), [tick]);

  return { live, refresh, refreshedAt };
}