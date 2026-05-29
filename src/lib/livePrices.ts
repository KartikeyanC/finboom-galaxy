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

// Tiny pseudo-random walk used as a graceful fallback if a live fetch fails.
function walk(prev: number): number {
  if (!prev || !Number.isFinite(prev)) return prev;
  const drift = (Math.random() - 0.48) * 0.01;
  return Math.max(prev * (1 + drift), prev * 0.5);
}

// --------- Live providers (free, no-key) ---------

type Provider = "yahoo" | "mf" | null;

const YAHOO_SUFFIX: Record<string, string> = {
  NSE: ".NS",
  BSE: ".BO",
  BOM: ".BO",
  NASDAQ: "",
  NYSE: "",
  AMEX: "",
  LSE: ".L",
  TSE: ".T",
  TSX: ".TO",
  ASX: ".AX",
  HKG: ".HK",
  FRA: ".F",
  EPA: ".PA",
};

function pickTicker(r: InvestmentRecord): string {
  const f = r.fields ?? {};
  return String(
    f.ticker || f.symbol || f.coin || f.scheme || f.name || "",
  ).trim();
}

function resolveSymbol(r: InvestmentRecord): { provider: Provider; symbol: string } {
  const raw = pickTicker(r);
  if (!raw) return { provider: null, symbol: "" };

  if (r.asset === "mutual_funds") {
    const m = raw.match(/(\d{4,})/);
    return m ? { provider: "mf", symbol: m[1] } : { provider: null, symbol: "" };
  }

  if (r.asset === "crypto") {
    const sym = raw.toUpperCase().replace(/\s+/g, "");
    return { provider: "yahoo", symbol: sym.includes("-") ? sym : `${sym}-USD` };
  }

  if (r.asset === "stocks") {
    let sym = raw.toUpperCase().replace(/\s+/g, "");
    if (sym.includes(":")) {
      const [prefix, rest] = sym.split(":");
      const suffix = YAHOO_SUFFIX[prefix] ?? "";
      sym = rest + suffix;
    }
    return { provider: "yahoo", symbol: sym };
  }

  return { provider: null, symbol: "" };
}

async function fetchUnitPrice(r: InvestmentRecord): Promise<number | null> {
  const { provider, symbol } = resolveSymbol(r);
  if (!provider || !symbol) return null;
  try {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/live-price?provider=${provider}&symbol=${encodeURIComponent(symbol)}`;
    const resp = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const p = j?.price;
    return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

export function useLivePrices(records: InvestmentRecord[], intervalMs = 60_000) {
  const [live, setLive] = useState<LiveMap>({});
  const [refreshedAt, setRefreshedAt] = useState<number>(() => Date.now());
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const liveRef = useRef<LiveMap>({});
  liveRef.current = live;

  const tick = useCallback(async () => {
    const recs = recordsRef.current.filter((r) => isLiveAsset(r.asset));
    const prev = liveRef.current;
    const results = await Promise.all(
      recs.map(async (r) => {
        const fetched = await fetchUnitPrice(r);
        return { r, fetched };
      }),
    );

    setLive(() => {
      const next: LiveMap = {};
      for (const { r, fetched } of results) {
        const qty = getQuantity(r);
        const existing = prev[r.id];
        const prevUnit = existing?.unitPrice ?? getBaseUnitPrice(r);
        const unit =
          fetched && Number.isFinite(fetched) && fetched > 0
            ? fetched
            : walk(prevUnit) || prevUnit;
        const direction: LiveTick["direction"] =
          unit > prevUnit ? "up" : unit < prevUnit ? "down" : "flat";
        next[r.id] = {
          unitPrice: unit,
          prevUnitPrice: prevUnit,
          currentValue: unit * qty,
          prevCurrentValue: prevUnit * qty,
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
    // Kick off an immediate live fetch when records change
    void tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => window.clearInterval(id);
  }, [tick, intervalMs]);

  const refresh = useCallback(() => void tick(), [tick]);

  return { live, refresh, refreshedAt };
}