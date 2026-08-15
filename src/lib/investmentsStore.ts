import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";

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

/** Legacy localStorage reader — used only for the one-time migration to the DB. */
function readLocal(): InvestmentRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InvestmentRecord[]) : [];
  } catch {
    return [];
  }
}

type InvestmentRow = {
  id: string;
  asset: string;
  currency: string;
  goal: string | null;
  broker: string | null;
  mf_mode: string | null;
  gold_type: string | null;
  bond_freq: string | null;
  fields: Record<string, string> | null;
  derived: Record<string, number> | null;
  saved_at: string;
};

function rowToRecord(r: InvestmentRow): InvestmentRecord {
  return {
    id: r.id,
    asset: r.asset as AssetType,
    currency: r.currency as Currency,
    goal: (r.goal as GoalLink | null) ?? null,
    broker: (r.broker as Broker) ?? undefined,
    mfMode: (r.mf_mode as "SIP" | "Lumpsum") ?? undefined,
    goldType: (r.gold_type as InvestmentRecord["goldType"]) ?? undefined,
    bondFreq: (r.bond_freq as InvestmentRecord["bondFreq"]) ?? undefined,
    fields: r.fields ?? {},
    derived: r.derived ?? {},
    savedAt: r.saved_at,
  };
}

function recordToRow(rec: InvestmentRecord, tenantId: string) {
  return {
    id: rec.id,
    tenant_id: tenantId,
    asset: rec.asset,
    currency: rec.currency,
    goal: rec.goal ?? null,
    broker: rec.broker ?? null,
    mf_mode: rec.mfMode ?? null,
    gold_type: rec.goldType ?? null,
    bond_freq: rec.bondFreq ?? null,
    fields: rec.fields ?? {},
    derived: rec.derived ?? {},
    saved_at: rec.savedAt ?? new Date().toISOString(),
  };
}

/** Investments are persisted server-side (tenant-scoped). API unchanged. */
export function useInvestments() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = ["investments", currentTenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investments")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("saved_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as InvestmentRow[]).map(rowToRecord);
    },
  });

  const records = data ?? [];
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["investments"] }),
    [qc],
  );

  const upsert = useCallback(
    async (rec: InvestmentRecord) => {
      if (!currentTenantId) return;
      const { error } = await supabase
        .from("investments")
        .upsert(recordToRow(rec, currentTenantId));
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("investments")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId as string);
      if (error) return notifyError(error);
      invalidate();
    },
    [currentTenantId, invalidate],
  );

  // One-time migration of legacy localStorage records into the DB.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || migratedRef.current) return;
    const flag = `finroot.migrated.investments.${currentTenantId}`;
    if (localStorage.getItem(flag)) return;
    migratedRef.current = true;
    const local = readLocal();
    if ((data?.length ?? 0) === 0 && local.length > 0) {
      void (async () => {
        const { error } = await supabase
          .from("investments")
          .upsert(local.map((r) => recordToRow(r, currentTenantId)));
        if (!error) {
          localStorage.setItem(flag, "1");
          invalidate();
        }
      })();
    } else {
      localStorage.setItem(flag, "1");
    }
  }, [currentTenantId, isLoading, data, invalidate]);

  return { records, upsert, remove };
}