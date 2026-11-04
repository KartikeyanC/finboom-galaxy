import { getCurrent, getInvested, getRecordName, type InvestmentRecord } from "./investmentsStore";
import { quantityOf } from "./holdingFigures";

/**
 * Tax harvesting — booking long-term gains while they are tax-free.
 *
 * In India, long-term gains on listed shares and equity mutual funds (s.112A)
 * are tax-free up to ₹1.25 lakh a financial year; above that they are taxed
 * at 12.5%. Selling units with such gains and buying them straight back keeps
 * the holding but raises its cost, so that slice is never taxed later.
 *
 * The rules this follows:
 * - "Long-term" is held MORE than 12 months (bought 15 Apr 2025 → long-term
 *   from 16 Apr 2026).
 * - Units are sold oldest first (FIFO) — the law for funds, and how a demat
 *   account books shares — so a sale can only reach the units at the front,
 *   and a short-term lot in front blocks everything behind it.
 * - Only equity qualifies: Indian shares, and funds that aren't debt, gold,
 *   international or fund-of-funds by their name. ELSS units are locked for
 *   three years from each purchase.
 * - A lot bought before 1 Feb 2018 is taxed on the 31 Jan 2018 price, which
 *   FinRoot does not have; a holding with one at the front is not planned.
 *
 * Where a date is not known for sure the planner errs late, never early: a
 * holding with no buy date counts from the day it was saved, so a sale it
 * suggests is never short-term by surprise. Pure: dates and prices are inputs.
 */

export const LTCG_EXEMPTION = 125_000;
/** 12.5% plus the 4% cess. */
export const LTCG_RATE = 0.13;

export type Lot = { date: string; qty: number; cost: number };

export type LotView = Lot & {
  /** Long-term on (yyyy-mm-dd): the day after 12 months. */
  ltFrom: string;
  longTerm: boolean;
  locked: boolean;
  gain: number;
};

export type HarvestHolding = {
  key: string;
  name: string;
  asset: "stocks" | "mutual_funds";
  broker?: string;
  price: number;
  /** Oldest first. */
  lots: LotView[];
  /** Long-term gain, and what those units fetch, in the sellable front. */
  ltGain: number;
  ltValue: number;
  /** The suggested sale: units from the front, what they fetch and the gain booked. */
  sell: { units: number; value: number; gain: number };
};

export type HarvestPlan = {
  fy: string;
  fyEnd: string;
  booked: number;
  remaining: number;
  planned: number;
  taxSaved: number;
  /** Every equity holding with long-term units, best candidates first. */
  holdings: HarvestHolding[];
  /** Short-term lots with a gain that turn long-term before the year ends. */
  upcoming: { name: string; date: string; units: number; gain: number }[];
  /** Holdings left out, and why. */
  skipped: { name: string; reason: string }[];
  /** Equity holdings with no buy date — counted from the day they were saved. */
  undated: string[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/** [s] plus [months], clamped into the month (31 Jan + 1 → 28/29 Feb). */
function addMonths(s: string, months: number): Date {
  const d = at(s);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

/** The day a lot becomes long-term: one day after [months] have passed. */
export function longTermFrom(buy: string, months = 12): string {
  const d = addMonths(buy, months);
  d.setDate(d.getDate() + 1);
  return iso(d);
}

/** "2026-27" and its last day, for the financial year [today] falls in. */
export function financialYear(today: Date): { fy: string; end: string } {
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return { fy: `${y}-${pad((y + 1) % 100)}`, end: `${y + 1}-03-31` };
}

const NON_EQUITY =
  /\b(debt|liquid|gilt|bond|money market|overnight|credit risk|corporate|banking (?:&|and) psu|duration|floater|fmp|fixed maturity|income|treasury|gold|silver|international|global|overseas|world|nasdaq|s&p|us equity|fof|fund of funds?)\b/i;

/** Why a record can't be harvested, or null when it can (shares / equity funds in rupees). */
export function notEquity(r: InvestmentRecord): string | null {
  if (r.currency !== "INR") return "Not in rupees — foreign holdings get no exemption";
  if (r.asset === "stocks") {
    const t = (r.fields?.ticker ?? "").toUpperCase();
    if (t.includes(":") && !/^(NSE|BSE):/.test(t)) return "Foreign share — no exemption";
    return null;
  }
  if (r.asset === "mutual_funds") {
    const name = `${r.fields?.scheme ?? ""} ${r.fields?.name ?? ""}`;
    return NON_EQUITY.test(name) ? "Not an equity fund — the exemption is for equity only" : null;
  }
  return "Not shares or a fund";
}

const isElss = (r: InvestmentRecord) =>
  /\b(elss|tax saver|tax saving|taxsaver)\b/i.test(`${r.fields?.scheme ?? ""} ${r.fields?.name ?? ""}`);

/**
 * A record's purchases. `_lots` (written by imports) when it adds up to the
 * units held; else one lot at the average price, dated by `buy_date` or,
 * failing that, the day it was saved (assumed).
 */
export function lotsOf(r: InvestmentRecord): { lots: Lot[]; assumed: boolean } {
  const qty = quantityOf(r);
  const raw = r.fields?._lots;
  if (raw) {
    try {
      const parsed = (JSON.parse(raw) as [string, number, number][])
        .map(([date, q, cost]) => ({ date: String(date), qty: Number(q), cost: Number(cost) }))
        .filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l.date) && l.qty > 0 && l.cost >= 0);
      const sum = parsed.reduce((s, l) => s + l.qty, 0);
      if (parsed.length && Math.abs(sum - qty) <= Math.max(0.001, qty * 0.001)) {
        return { lots: parsed, assumed: false };
      }
    } catch {
      /* a malformed list falls back to the single lot */
    }
  }
  const date = r.fields?.buy_date || r.savedAt?.slice(0, 10) || "";
  const cost = qty > 0 ? getInvested(r) / qty : 0;
  return { lots: date && qty > 0 ? [{ date, qty, cost }] : [], assumed: !r.fields?.buy_date };
}

/** The same stock or fund in the same account — one FIFO queue. */
const keyOf = (r: InvestmentRecord) => {
  const f = r.fields ?? {};
  const id =
    r.asset === "stocks"
      ? (f.ticker || f.name || "").toUpperCase()
      : (f.isin || f.scheme || f.name || "").toUpperCase();
  return `${r.asset}|${r.broker ?? ""}|${id}`;
};

export function planHarvest(opts: {
  records: InvestmentRecord[];
  /** Live price per unit, by record id, when known. */
  livePrice?: Record<string, number | undefined>;
  booked: number;
  today: Date;
}): HarvestPlan {
  const { records, livePrice = {}, booked, today } = opts;
  const todayIso = iso(today);
  const { fy, end: fyEnd } = financialYear(today);
  const skipped: HarvestPlan["skipped"] = [];
  const upcoming: HarvestPlan["upcoming"] = [];
  const undated: string[] = [];

  const groups = new Map<string, InvestmentRecord[]>();
  for (const r of records) {
    if (r.asset !== "stocks" && r.asset !== "mutual_funds") continue;
    const why = notEquity(r);
    if (why) {
      skipped.push({ name: getRecordName(r), reason: why });
      continue;
    }
    groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
  }

  const holdings: HarvestHolding[] = [];
  for (const [key, recs] of groups) {
    const name = getRecordName(recs[0]);
    if (recs[0].asset === "mutual_funds" && recs.some((r) => r.mfMode === "SIP" && !r.fields?._lots)) {
      skipped.push({
        name,
        reason: "A SIP saved as one entry — its purchase dates aren't known. Import your CAS to plan it.",
      });
      continue;
    }
    // Price per unit: a live quote, else what the record says it is worth now.
    let price = 0;
    for (const r of recs) {
      const q = quantityOf(r);
      price = livePrice[r.id] || (q > 0 ? getCurrent(r) / q : 0);
      if (livePrice[r.id]) break;
    }
    if (price <= 0) {
      skipped.push({ name, reason: "No current price" });
      continue;
    }
    let assumed = false;
    const elss = recs.some(isElss);
    const lots = recs
      .flatMap((r) => {
        const l = lotsOf(r);
        assumed ||= l.assumed;
        return l.lots;
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((l): LotView => {
        const ltFrom = longTermFrom(l.date);
        return {
          ...l,
          ltFrom,
          longTerm: ltFrom <= todayIso,
          locked: elss && longTermFrom(l.date, 36) > todayIso,
          gain: (price - l.cost) * l.qty,
        };
      });
    if (!lots.length) continue;
    if (assumed) undated.push(name);
    if (lots[0].date < "2018-02-01") {
      skipped.push({
        name,
        reason: "Holds units bought before 1 Feb 2018, taxed on the 31 Jan 2018 price, which FinRoot doesn't have",
      });
      continue;
    }

    // Only the front of the queue can be sold: the long-term, unlocked lots
    // before the first one that isn't.
    const front: LotView[] = [];
    for (const l of lots) {
      if (!l.longTerm || l.locked) break;
      front.push(l);
    }
    for (const l of lots) {
      if (!l.longTerm && l.gain > 0 && l.ltFrom <= fyEnd) {
        upcoming.push({ name, date: l.ltFrom, units: l.qty, gain: round(l.gain) });
      }
    }
    if (!front.length) continue;
    holdings.push({
      key,
      name,
      asset: recs[0].asset as "stocks" | "mutual_funds",
      broker: recs[0].broker,
      price,
      lots,
      ltGain: round(front.reduce((s, l) => s + l.gain, 0)),
      ltValue: round(front.reduce((s, l) => s + l.qty * price, 0)),
      sell: { units: 0, value: 0, gain: 0 },
    });
  }

  // Best first: the most gain per rupee sold, so the fewest units change hands.
  const rate = (h: HarvestHolding) => (h.ltValue > 0 ? h.ltGain / h.ltValue : 0);
  holdings.sort((a, b) => rate(b) - rate(a));

  const remaining = Math.max(0, LTCG_EXEMPTION - Math.max(0, booked));
  let left = remaining;
  for (const h of holdings) {
    if (left <= 0.5) break;
    const whole = h.asset === "stocks";
    let units = 0, gain = 0;
    // Loss lots in front have to go first; they are only worth selling when
    // a gain behind them is reached.
    let pending = { units: 0, gain: 0 };
    for (const l of h.lots) {
      if (!l.longTerm || l.locked || left - gain <= 0.5) break;
      const perUnit = h.price - l.cost;
      if (perUnit <= 0) {
        pending = { units: pending.units + l.qty, gain: pending.gain + perUnit * l.qty };
        continue;
      }
      const room = left - gain - pending.gain;
      let take = Math.min(l.qty, room / perUnit);
      take = whole ? Math.floor(take + 1e-9) : Math.floor(take * 1000) / 1000;
      if (take <= 0) break;
      units += pending.units + take;
      gain += pending.gain + perUnit * take;
      pending = { units: 0, gain: 0 };
      if (take < l.qty) break;
    }
    if (units > 0 && gain > 0) {
      h.sell = { units: round(units, 3), value: round(units * h.price), gain: round(gain) };
      left -= gain;
    }
  }

  const planned = round(remaining - left);
  return {
    fy,
    fyEnd,
    booked: Math.max(0, booked),
    remaining,
    planned,
    taxSaved: round(planned * LTCG_RATE),
    holdings,
    upcoming: upcoming.sort((a, b) => (a.date < b.date ? -1 : 1)),
    skipped,
    undated,
  };
}
