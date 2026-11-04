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

    const prev = rows.get(isin);
    if (prev) {
      // The same fund in a second folio: one holding, units and cost added.
      const totalCost = prev.quantity * prev.price + invested;
      prev.quantity += units;
      prev.price = totalCost / prev.quantity;
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
      ...(broker ? { broker } : {}),
    });
  });
  return [...rows.values()];
}
