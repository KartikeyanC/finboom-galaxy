import type { ImportedRow } from "./importParsers";
import { BROKERS, type Broker, type Currency, type InvestmentRecord } from "./investmentsStore";

/**
 * Broker rows (a tradebook's trades, or a holdings export's lines) as the
 * holdings they add up to — what the Investments page lists.
 *
 * Imports used to land in Transactions as income and expenses (a buy as
 * income, a sell as an expense), so nothing ever reached Investments and the
 * dashboard's income was inflated by every share bought. A holding is the
 * right shape: one per stock or fund, its quantity and average buy price.
 *
 * Average-cost method, oldest trade first: a buy adds quantity and cost; a
 * sell removes quantity at the running average, leaving the average as it
 * was. A position sold down to zero is closed and not listed; buying again
 * later starts it afresh.
 */
export type ImportedHolding = {
  /** "NSE:ITC" for a share; the ISIN (or name) for a fund. */
  key: string;
  asset: "stocks" | "mutual_funds";
  name: string;
  /** "NSE:ITC" — the form the live-price lookup resolves. Shares only. */
  ticker?: string;
  isin?: string;
  qty: number;
  avg: number;
  invested: number;
  /** The latest last/closing price or NAV the export gave, if any. */
  ltp?: number;
  /** When the open position was first bought (yyyy-mm-dd), if known. */
  since?: string;
  /**
   * The purchases still held, oldest first — sells take the oldest units
   * first (FIFO), as tax does. Present only when every one has a date.
   */
  lots?: { date: string; qty: number; cost: number }[];
  currency: Currency;
};

const isFund = (r: ImportedRow) => (r.isin ?? "").startsWith("INF");

const keyOf = (r: ImportedRow) =>
  isFund(r)
    ? r.isin || r.asset.trim().toUpperCase()
    : `${(r.exchange || "NSE").toUpperCase()}:${r.asset.trim().toUpperCase()}`;

const round = (v: number, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;

export function rowsToHoldings(rows: ImportedRow[]): ImportedHolding[] {
  // Oldest first; rows without a date keep their place among themselves.
  const ordered = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = a.r.date || "", y = b.r.date || "";
      if (x && y && x !== y) return x < y ? -1 : 1;
      return a.i - b.i;
    })
    .map((e) => e.r);

  type Lot = { date: string; qty: number; cost: number };
  type Acc = {
    first: ImportedRow;
    qty: number;
    cost: number;
    ltp?: number;
    since?: string;
    queue: Lot[];
  };
  const byKey = new Map<string, Acc>();
  for (const r of ordered) {
    if (!r.asset.trim() || r.quantity <= 0) continue;
    const k = keyOf(r);
    const a = byKey.get(k) ?? { first: r, qty: 0, cost: 0, queue: [] };
    if (r.action === "Outflow") {
      const avg = a.qty > 0 ? a.cost / a.qty : 0;
      a.qty = Math.max(0, a.qty - r.quantity);
      a.cost = avg * a.qty;
      if (a.qty === 0) a.since = undefined;
      let out = r.quantity;
      while (out > 1e-9 && a.queue.length) {
        const take = Math.min(out, a.queue[0].qty);
        a.queue[0].qty -= take;
        out -= take;
        if (a.queue[0].qty <= 1e-9) a.queue.shift();
      }
    } else {
      if (a.qty === 0) a.since = r.date || undefined;
      a.qty += r.quantity;
      a.cost += r.quantity * r.price;
      a.queue.push(...(r.lots?.map((l) => ({ ...l })) ?? [{ date: r.date, qty: r.quantity, cost: r.price }]));
    }
    if (r.ltp) a.ltp = r.ltp;
    byKey.set(k, a);
  }

  const out: ImportedHolding[] = [];
  for (const [key, a] of byKey) {
    if (a.qty <= 0) continue;
    const fund = isFund(a.first);
    const currency: Currency =
      a.first.currency === "USD" || a.first.currency === "AED" ? a.first.currency : "INR";
    out.push({
      key,
      asset: fund ? "mutual_funds" : "stocks",
      name: a.first.asset.trim(),
      ticker: fund ? undefined : key,
      isin: a.first.isin,
      qty: round(a.qty),
      avg: round(a.cost / a.qty),
      invested: round(a.cost, 2),
      ltp: a.ltp,
      since: a.since,
      ...(a.queue.length && a.queue.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.date))
        ? { lots: a.queue.map((l) => ({ date: l.date, qty: round(l.qty), cost: round(l.cost) })) }
        : {}),
      currency,
    });
  }
  return out;
}

/**
 * A UUID that is the same for the same text — so importing a file again
 * updates the holdings it made instead of adding a second copy. Four FNV-1a
 * passes with different seeds give the 128 bits; the version nibble says 5
 * (name-based), as the format expects.
 */
export function stableUuid(text: string): string {
  let hex = "";
  for (const seed of [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]) {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex += h.toString(16).padStart(8, "0");
  }
  const v = `5${hex.slice(13, 16)}`;
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${v}-${variant}-${hex.slice(20, 32)}`;
}

const asBroker = (name: string | undefined): Broker =>
  BROKERS.find((b) => b.toLowerCase() === (name ?? "").toLowerCase()) ??
  "Other / Direct Holding";

/** `_lots`: [date, qty, unit cost] per purchase — read by taxHarvest.ts. */
const lotsField = (h: ImportedHolding): Record<string, string> =>
  h.lots?.length ? { _lots: JSON.stringify(h.lots.map((l) => [l.date, l.qty, l.cost])) } : {};

/**
 * A holding as the Investments record the Add Investment form would have
 * saved — same fields, so the web list, the phone app and live prices all
 * read it like any other.
 */
export function holdingToRecord(
  h: ImportedHolding,
  opts: { tenantId: string; broker?: string; now?: string },
): InvestmentRecord {
  const broker = asBroker(opts.broker);
  const base = {
    id: stableUuid(`import|${opts.tenantId}|${broker}|${h.key}`),
    currency: h.currency,
    goal: null,
    broker,
    savedAt: opts.now ?? new Date().toISOString(),
  };
  if (h.asset === "mutual_funds") {
    const nav = h.ltp ?? h.avg;
    return {
      ...base,
      asset: "mutual_funds",
      fields: {
        name: h.name,
        scheme: h.name,
        units: String(h.qty),
        invested: String(h.invested),
        nav: String(nav),
        ...(h.isin ? { isin: h.isin } : {}),
        ...lotsField(h),
        _import: "1",
      },
      derived: { avgNav: h.avg, currentValue: round(h.qty * nav, 2) },
    };
  }
  return {
    ...base,
    asset: "stocks",
    fields: {
      name: h.name,
      ticker: h.ticker ?? h.name,
      qty: String(h.qty),
      buy: String(h.avg),
      ...(h.since ? { buy_date: h.since } : {}),
      ...(h.ltp ? { current: String(round(h.qty * h.ltp, 2)) } : {}),
      ...(h.isin ? { isin: h.isin } : {}),
      ...lotsField(h),
      _import: "1",
    },
    derived: { total: h.invested, avg: h.avg },
  };
}
