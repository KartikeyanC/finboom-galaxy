import type { ImportedRow } from "./importParsers";
import { normaliseDate } from "./sheetRows";

/**
 * A CAMS / KFintech Consolidated Account Statement (CAS) — the one PDF that
 * lists every mutual fund a PAN holds, whichever app or AMC it was bought
 * through — read as one row per fund.
 *
 * Each scheme in the statement is a block:
 *
 *   H03 - HDFC Flexi Cap Fund - Direct Plan - Growth - ISIN: INF179K01UT0(Advisor: DIRECT) …
 *   01-Jan-2024  Purchase - via Internet  5,000.00  4.762  1,050.00  4.762
 *   …
 *   Closing Unit Balance: 120.345  NAV on 31-Oct-2026: INR 1,800.50
 *   Total Cost Value: 1,50,000.00  Market Value on 31-Oct-2026: INR 2,16,682.05
 *
 * so a fund is found by its ISIN and read up to the next one: the closing
 * units, the NAV, and what it cost. The row is shaped like a single buy of
 * the closing units at the average cost, which is exactly what
 * rowsToHoldings needs to make the holding — the INF ISIN marks it a fund.
 *
 * Pure: it reads text, so it is tested with text; parsePDF supplies it.
 */

const num = (s: string | undefined): number => Number((s ?? "").replace(/[,\s]/g, "")) || 0;
const NUM = "(-?[\\d,]+(?:\\.\\d+)?)";
const DATE = "(\\d{1,2}-[A-Za-z]{3}-\\d{4})";

/** True when the text reads as a CAS rather than a broker statement. */
export function isCasText(text: string): boolean {
  return (
    /Consolidated Account Statement/i.test(text) ||
    (/ISIN\s*:\s*INF/i.test(text) && /Closing Unit Balance/i.test(text))
  );
}

/** "H03 - HDFC Flexi Cap Fund - Direct Plan - Growth (formerly …) -" → the plain name. */
function cleanName(raw: string): string {
  return raw
    .replace(/\(\s*formerly[^)]*\)/gi, "")
    .replace(/\(\s*(?:non[- ]?demat|demat)\s*\)/gi, "")
    .replace(/^\s*[A-Z0-9]{1,10}\s*-\s*(?=[A-Za-z])/, "") // the scheme code
    .replace(/[\s-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * [lines] is the statement's text one line per entry, in reading order.
 * Funds with no units left (redeemed in full) are left out.
 */
export function parseCasLines(lines: string[], broker?: string): ImportedRow[] {
  const rows = new Map<string, ImportedRow>();
  const isinRe = /ISIN\s*:\s*(INF[A-Z0-9]{9})/i;
  // "01-Apr-2024 To 31-Oct-2026": units held before the period began were
  // bought before its first day — the date their opening balance is given.
  const periodRe = new RegExp(`${DATE}\\s+To\\s+${DATE}`, "i");
  const period = lines.map((l) => periodRe.exec(l)).find(Boolean);
  const periodStart = period ? normaliseDate(period[1]) : "";

  // Where each scheme starts: the line carrying its ISIN.
  const starts = lines.flatMap((l, i) => (isinRe.test(l) ? [i] : []));
  starts.forEach((start, n) => {
    const end = starts[n + 1] ?? lines.length;
    const line = lines[start];
    const isin = isinRe.exec(line)![1].toUpperCase();

    // The name sits before "ISIN:"; a long one wraps, leaving only its tail
    // ("Direct Growth") here — that borrows the line above, unless the line
    // above is a header (folio, the AMC's name) or the previous fund's figures.
    let name = line.slice(0, line.search(/-?\s*ISIN\s*:/i));
    const above = (lines[start - 1] ?? "").trim();
    const wrapped = /-$/.test(above) || !/fund|plan|scheme|etf|fof/i.test(name);
    if (wrapped && above && !/Folio|PAN\s*:|Mutual Fund$|Balance|Value/i.test(above)) {
      name = `${above} ${name}`;
    }
    name = cleanName(name);

    const body = lines.slice(start + 1, end).join("\n");
    const units = num(new RegExp(`Closing\\s+Unit\\s+Balance\\s*:?\\s*${NUM}`, "i").exec(body)?.[1]);
    if (units <= 0) return;

    const navM = new RegExp(`NAV\\s+on\\s+${DATE}\\s*:?\\s*(?:INR|Rs\\.?|₹)?\\s*${NUM}`, "i").exec(body);
    const nav = num(navM?.[2]);
    const cost = num(new RegExp(`Cost\\s+Value\\s*:?\\s*(?:INR|Rs\\.?|₹)?\\s*${NUM}`, "i").exec(body)?.[1]);
    const market = num(
      new RegExp(`(?:Market\\s+Value|Valuation)\\s+on\\s+${DATE}\\s*:?\\s*(?:INR|Rs\\.?|₹)?\\s*${NUM}`, "i").exec(
        body,
      )?.[2],
    );
    const ltp = nav || (market ? market / units : 0);
    // An older statement may give no cost: the fund then shows at today's
    // value, no gain, rather than not at all.
    const invested = cost || market || units * ltp;

    // The first transaction's date is when the holding began.
    const first = new RegExp(`^\\s*${DATE}`, "m").exec(body)?.[1];
    const lots = purchaseLots(body, periodStart, units, invested);

    const prev = rows.get(isin);
    if (prev) {
      // The same fund in a second folio: one holding, units and cost added.
      const totalCost = prev.quantity * prev.price + invested;
      prev.quantity += units;
      prev.price = totalCost / prev.quantity;
      // Each folio is its own queue; together they are kept only when both are known.
      prev.lots = prev.lots && lots ? [...prev.lots, ...lots] : undefined;
      if (first && (!prev.date || normaliseDate(first) < prev.date)) prev.date = normaliseDate(first);
      return;
    }
    rows.set(isin, {
      id: crypto.randomUUID(),
      date: first ? normaliseDate(first) : "",
      asset: name || isin,
      action: "Inflow",
      quantity: units,
      price: invested / units,
      currency: "INR",
      rate: 1,
      isin,
      ...(ltp ? { ltp } : {}),
      ...(lots ? { lots } : {}),
      ...(broker ? { broker } : {}),
    });
  });
  return [...rows.values()];
}

type Lot = { date: string; qty: number; cost: number };

/** "1,600.00" → 1600; "(1,600.00)" and "-1,600.00" → -1600. */
const signed = (s: string) => {
  const n = num(s.replace(/[()]/g, ""));
  return /^\(.*\)$/.test(s.trim()) ? -Math.abs(n) : n;
};

const AMT = "(\\(?-?[\\d,]+\\.\\d+\\)?)";
/** DATE  description  amount  units  price  unit-balance */
const TX = new RegExp(`^\\s*${DATE}\\s+.*?\\s${AMT}\\s+${AMT}\\s+[\\d,]+\\.\\d+\\s+${AMT}\\s*$`, "i");

/**
 * The purchases still held, oldest first — what the tax-harvest planner needs
 * (taxHarvest.ts). Units below zero on a line are a redemption or switch-out,
 * taken from the oldest purchase first, as the law requires. Units held when
 * the period began are one lot dated its first day, costed as whatever the
 * statement's cost value leaves over. Undefined when the lots don't come back
 * to the closing balance: a statement read wrong is better left without them.
 */
function purchaseLots(body: string, periodStart: string, closing: number, cost: number): Lot[] | undefined {
  const queue: Lot[] = [];
  const opening = num(/Opening\s+Unit\s+Balance\s*:?\s*([\d,]+(?:\.\d+)?)/i.exec(body)?.[1]);
  if (opening > 0) {
    if (!periodStart) return undefined;
    queue.push({ date: periodStart, qty: opening, cost: Number.NaN });
  }
  for (const line of body.split("\n")) {
    const m = TX.exec(line);
    if (!m) continue;
    const units = signed(m[3]);
    if (units > 0) {
      queue.push({ date: normaliseDate(m[1]), qty: units, cost: Math.abs(signed(m[2])) / units });
      continue;
    }
    let out = -units;
    while (out > 1e-6 && queue.length) {
      const take = Math.min(out, queue[0].qty);
      queue[0].qty -= take;
      out -= take;
      if (queue[0].qty <= 1e-6) queue.shift();
    }
  }
  const held = queue.reduce((s, l) => s + l.qty, 0);
  if (!queue.length || Math.abs(held - closing) > Math.max(0.002, closing * 0.001)) return undefined;
  const opener = queue.find((l) => Number.isNaN(l.cost));
  if (opener) {
    const left = cost - queue.reduce((s, l) => (l === opener ? s : s + l.qty * l.cost), 0);
    if (!(left >= 0)) return undefined;
    opener.cost = left / opener.qty;
  }
  return queue.map((l) => ({ ...l, qty: Math.round(l.qty * 1000) / 1000 }));
}
