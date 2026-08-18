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

// --------- Live providers (free, no-key) ---------

export type Provider = "yahoo" | "mf";

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
  // BUG-106 — `f.name` used to be in this chain, so a record with no ticker
  // at all silently tried to resolve its free-text display name as a market
  // symbol instead of reporting "no ticker" (almost every stock has *a*
  // name, so this made the unresolved-ticker path nearly unreachable).
  return String(
    f.ticker || f.symbol || f.coin || f.scheme || "",
  ).trim();
}

export function resolveSymbol(
  r: InvestmentRecord,
): { provider: Provider | null; symbol: string } {
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

// --------- Batching (Stage 4.3 / BUG-044) ---------

export const cacheKey = (provider: Provider, symbol: string) =>
  `${provider}:${symbol}`;

/** Mirrors the edge function. A NAV publishes once a day; a quote does not. */
export const TTL_MS: Record<Provider, number> = {
  yahoo: 60_000,
  mf: 24 * 60 * 60 * 1000,
};

export interface Want {
  provider: Provider;
  symbol: string;
}

export interface BatchPlan {
  /** Deduped — two holdings of the same stock are one symbol. */
  wants: Want[];
  /** cacheKey → the record ids that should receive that price. */
  targets: Map<string, string[]>;
  /** Live-asset records with no resolvable ticker; priced from stored values. */
  unresolved: string[];
}

/**
 * Turn a portfolio into the smallest set of symbols that prices it. The old
 * code did the opposite — one request per record — so ten holdings of the same
 * stock across two brokers cost ten calls a minute for one number.
 */
export function planBatch(records: InvestmentRecord[]): BatchPlan {
  const wants = new Map<string, Want>();
  const targets = new Map<string, string[]>();
  const unresolved: string[] = [];

  for (const r of records) {
    if (!isLiveAsset(r.asset)) continue;
    const { provider, symbol } = resolveSymbol(r);
    if (!provider || !symbol) {
      unresolved.push(r.id);
      continue;
    }
    const key = cacheKey(provider, symbol);
    wants.set(key, { provider, symbol });
    targets.set(key, [...(targets.get(key) ?? []), r.id]);
  }

  return { wants: [...wants.values()], targets, unresolved };
}

/**
 * Client-side price memo, module-level so it survives unmount. Navigating away
 * from Investments and straight back used to refire the whole portfolio; now
 * that costs nothing while the prices are still inside their TTL.
 */
const memo = new Map<string, { price: number; at: number }>();

export function readMemo(key: string, provider: Provider, now = Date.now()) {
  const hit = memo.get(key);
  if (!hit) return null;
  return now - hit.at < TTL_MS[provider] ? hit.price : null;
}

export function writeMemo(key: string, price: number, now = Date.now()) {
  memo.set(key, { price, at: now });
}

/** Test seam — the memo is module state and would otherwise leak between tests. */
export function __clearPriceMemo() {
  memo.clear();
}

async function fetchPrices(
  wants: Want[],
  signal?: AbortSignal,
): Promise<Record<string, number | null>> {
  if (!wants.length) return {};
  try {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/live-price`,
      {
        method: "POST",
        signal,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ symbols: wants }),
      },
    );
    if (!resp.ok) return {};
    const j = await resp.json();
    const prices = j?.prices;
    return prices && typeof prices === "object" ? prices : {};
  } catch {
    // Includes the AbortError from unmount — an empty map leaves every holding
    // on its previous value, which is the correct "nothing changed" outcome.
    return {};
  }
}

export function useLivePrices(records: InvestmentRecord[], intervalMs = 60_000) {
  const [live, setLive] = useState<LiveMap>({});
  const [refreshedAt, setRefreshedAt] = useState<number>(() => Date.now());
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const liveRef = useRef<LiveMap>({});
  liveRef.current = live;

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const lastTickRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Nothing in flight should outlive the page — this is the "stop when the
      // page is unmounted" half of BUG-044.
      abortRef.current?.abort();
    };
  }, []);

  const tick = useCallback(async (useMemo = false) => {
    const recs = recordsRef.current.filter((r) => isLiveAsset(r.asset));
    const { wants, targets } = planBatch(recs);

    const now = Date.now();
    lastTickRef.current = now;

    // On a remount or a visibility resume, anything still inside its TTL is
    // already good — only ask for the rest. An interval tick always asks, so
    // prices genuinely refresh; the server-side cache keeps that cheap.
    const resolved: Record<string, number | null> = {};
    const outstanding: Want[] = [];
    for (const w of wants) {
      const key = cacheKey(w.provider, w.symbol);
      const hit = useMemo ? readMemo(key, w.provider, now) : null;
      if (hit !== null) resolved[key] = hit;
      else outstanding.push(w);
    }

    if (outstanding.length) {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const fetched = await fetchPrices(outstanding, ctrl.signal);
      for (const [key, price] of Object.entries(fetched)) {
        resolved[key] = price;
        if (typeof price === "number" && price > 0) writeMemo(key, price);
      }
    }

    if (!mountedRef.current) return;

    // Invert once rather than scanning `targets` per record.
    const keyByRecord = new Map<string, string>();
    for (const [key, ids] of targets) for (const id of ids) keyByRecord.set(id, key);

    const priceFor = (id: string): number | null => {
      const key = keyByRecord.get(id);
      const p = key ? resolved[key] : undefined;
      return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
    };

    const prev = liveRef.current;
    setLive(() => {
      const next: LiveMap = {};
      for (const r of recs) {
        const qty = getQuantity(r);
        const existing = prev[r.id];
        const prevUnit = existing?.unitPrice ?? getBaseUnitPrice(r);
        // Use the real fetched price; if unavailable, keep the exact stored
        // value (no random drift — so the figure stays accurate on refresh).
        const unit = priceFor(r.id) ?? getBaseUnitPrice(r);
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
    // Kick off a live fetch when records change, reusing anything still fresh.
    void tick(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Poll only while the tab is actually being looked at. A backgrounded tab
  // used to keep spending edge invocations on prices nobody could see; on
  // return it catches up immediately if the interval elapsed while hidden.
  useEffect(() => {
    let id: number | undefined;

    const stop = () => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
    };
    const start = () => {
      stop();
      id = window.setInterval(() => void tick(), intervalMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      if (Date.now() - lastTickRef.current >= intervalMs) void tick();
      start();
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tick, intervalMs]);

  const refresh = useCallback(() => void tick(), [tick]);

  return { live, refresh, refreshedAt };
}
