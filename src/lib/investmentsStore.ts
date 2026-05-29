import { useCallback, useEffect, useState } from "react";

export type AssetType =
  | "stocks"
  | "mutual_funds"
  | "bonds"
  | "fd"
  | "rd"
  | "pf"
  | "gold"
  | "real_estate"
  | "crypto";

export type Currency = "INR" | "USD" | "AED";
export type GoalLink =
  | "Retirement"
  | "House Fund"
  | "Kid's Education"
  | "Emergency Stack";

export type Broker =
  | "Zerodha"
  | "Groww"
  | "INDmoney"
  | "Angel One"
  | "Upstox"
  | "Kuvera"
  | "CoinSwitch"
  | "Binance"
  | "WazirX"
  | "Other / Direct Holding";

export const BROKERS: Broker[] = [
  "Zerodha",
  "Groww",
  "INDmoney",
  "Angel One",
  "Upstox",
  "Kuvera",
  "CoinSwitch",
  "Binance",
  "WazirX",
  "Other / Direct Holding",
];

export const BROKER_TINTS: Record<Broker, string> = {
  Zerodha: "bg-sky-500/10 text-sky-500 border-sky-500/30",
  Groww: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  INDmoney: "bg-indigo-500/10 text-indigo-500 border-indigo-500/30",
  "Angel One": "bg-orange-500/10 text-orange-500 border-orange-500/30",
  Upstox: "bg-violet-500/10 text-violet-500 border-violet-500/30",
  Kuvera: "bg-teal-500/10 text-teal-500 border-teal-500/30",
  CoinSwitch: "bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/30",
  Binance: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  WazirX: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  "Other / Direct Holding": "bg-muted text-muted-foreground border-border",
};

export interface InvestmentRecord {
  id: string;
  asset: AssetType;
  currency: Currency;
  goal: GoalLink | null;
  broker?: Broker;
  mfMode?: "SIP" | "Lumpsum";
  goldType?: "Physical Gold" | "SGB" | "Digital Gold";
  bondFreq?: "Yearly" | "Monthly" | "Quarterly";
  fields: Record<string, string>;
  derived: Record<string, number>;
  savedAt: string;
}

export const ASSET_LABELS: Record<AssetType, string> = {
  stocks: "Stocks",
  mutual_funds: "Mutual Funds",
  bonds: "Bonds",
  fd: "Fixed Deposit",
  rd: "Recurring Deposit",
  pf: "Provident Fund",
  gold: "Gold",
  real_estate: "Real Estate",
  crypto: "Crypto",
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export function getRecordName(r: InvestmentRecord): string {
  const f = r.fields ?? {};
  return (
    f.name ||
    f.ticker ||
    f.scheme ||
    f.bond_name ||
    f.property ||
    f.coin ||
    ASSET_LABELS[r.asset]
  );
}

export function getInvested(r: InvestmentRecord): number {
  const f = r.fields ?? {};
  const d = r.derived ?? {};
  switch (r.asset) {
    case "stocks":
      return num(d.total);
    case "mutual_funds":
      return num(f.invested);
    case "fd":
      return num(f.deposit);
    case "rd":
      return num(d.principal);
    case "pf":
      return num(d.contribTotal) || num(f.balance);
    case "gold":
      return num(d.invested);
    case "real_estate":
      return num(d.totalCost);
    case "crypto":
      return num(d.invested);
    case "bonds":
      return num(f.invested);
    default:
      return 0;
  }
}

export function getCurrent(r: InvestmentRecord): number {
  const f = r.fields ?? {};
  const d = r.derived ?? {};
  switch (r.asset) {
    case "stocks":
      return num(f.current) || num(d.total);
    case "mutual_funds":
      return num(d.currentValue) || num(f.invested);
    case "fd":
      return num(d.maturity) || num(f.deposit);
    case "rd":
      return num(d.maturity) || num(d.principal);
    case "pf":
      return num(d.total) || num(f.balance);
    case "gold":
      return num(d.currentValue) || num(d.invested);
    case "real_estate":
      return num(d.current) || num(d.totalCost);
    case "crypto":
      return num(f.current) || num(d.invested);
    case "bonds":
      return num(d.current) || num(f.invested);
    default:
      return 0;
  }
}

const STORAGE_KEY = "investments.records.v1";

export function useInvestments() {
  const [records, setRecords] = useState<InvestmentRecord[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as InvestmentRecord[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      /* ignore quota */
    }
  }, [records]);

  const upsert = useCallback((rec: InvestmentRecord) => {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === rec.id);
      if (idx === -1) return [rec, ...prev];
      const next = prev.slice();
      next[idx] = rec;
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { records, upsert, remove };
}