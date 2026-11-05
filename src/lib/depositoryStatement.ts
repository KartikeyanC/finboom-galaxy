import type { ImportedRow } from "./importParsers";

/**
 * An NSDL / CDSL Consolidated Account Statement — the monthly depository
 * statement listing every share and fund under a PAN: the demat accounts'
 * holdings and the mutual-fund folios — read as one row per security.
 *
 * Its tables differ between the two depositories and over the years (frozen,
 * pledged, lent and free-balance columns come and go), so a row is not read
 * by column position. Every holding line carries an ISIN and ends in numbers;
 * among those numbers are a quantity and a price whose product is the line's
 * value, and that is how they are told apart:
 *
 *   INE002A01018  RELIANCE INDUSTRIES LIMITED  10.000  0.000  0.000  2,945.10  29,451.00
 *   INF879O01027  Parag Parikh Flexi Cap - Direct Growth  12345/67  1,000.000  85.00  60,000.00  85,000.00  25,000.00
 *
 * A fund line has the amount invested between price and value; a share line
 * has no cost at all — a depository doesn't know what was paid — so shares
 * come in at today's price (no gain) until a buy price is added.
 *
 * Pure: it reads text, so it is tested with text.
 */

const ISIN = /\b(IN[EF][A-Z0-9]{9})\b/;
const NUMERIC = /^\(?-?[\d,]*\d(?:\.\d+)?\)?$/;
const num = (s: string) => {
  const n = Number(s.replace(/[(),]/g, ""));
  return /^\(.*\)$/.test(s) ? -n : n;
};

/** True for an NSDL / CDSL statement (and not a CAMS / KFintech one). */
export function isDepositoryText(text: string): boolean {
  return (
    /National Securities Depository|Central Depository Services|\bNSDL\b|\bCDSL\b/i.test(text) &&
    ISIN.test(text) &&
    !/Closing Unit Balance/i.test(text)
  );
}

/** "RELIANCE INDUSTRIES LIMITED#" → "RELIANCE INDUSTRIES LIMITED"; a folio number dropped. */
function cleanName(tokens: string[]): string {
  return tokens
    .filter((t) => !/\d+\/\d+/.test(t))
    .join(" ")
    .replace(/^[\s\-–|:]+|[\s\-–|:]+$/g, "")
    .replace(/[#*]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Within a line's trailing numbers, the quantity, price and value: the latest
 * value that some earlier quantity × price makes (within 1%).
 */
function qtyPriceValue(nums: number[]): { i: number; j: number; k: number } | null {
  for (let k = nums.length - 1; k >= 2; k--) {
    const v = nums[k];
    if (v <= 0) continue;
    for (let j = k - 1; j >= 1; j--) {
      for (let i = j - 1; i >= 0; i--) {
        if (nums[i] > 0 && nums[j] > 0 && Math.abs(nums[i] * nums[j] - v) <= v * 0.01) {
          return { i, j, k };
        }
      }
    }
  }
  return null;
}

export function parseDepositoryLines(lines: string[], broker?: string): ImportedRow[] {
  const rows = new Map<string, ImportedRow>();
  for (const line of lines) {
    const m = ISIN.exec(line);
    if (!m) continue;
    const isin = m[1];
    const tokens = line.slice(m.index + isin.length).trim().split(/\s+/).filter(Boolean);
    // The numbers the line ends in.
    let start = tokens.length;
    while (start > 0 && NUMERIC.test(tokens[start - 1])) start--;
    const tail = tokens.slice(start).map(num);
    const hit = qtyPriceValue(tail);
    if (!hit) continue;
    // A short whole number before the quantity belongs to the name ("Nifty
    // 50"); zero columns and long ones (a folio number) don't.
    const nameTokens = [
      ...tokens.slice(0, start),
      ...tokens.slice(start, start + hit.i).filter((t) => /^\d{1,4}$/.test(t) && num(t) !== 0),
    ];
    const name = cleanName(nameTokens) || isin;
    const qty = tail[hit.i];
    const price = tail[hit.j];
    const value = tail[hit.k];
    const fund = isin.startsWith("INF");
    // A fund line's amount invested sits between its price and its value.
    const between = tail.slice(hit.j + 1, hit.k).filter((v) => v > 0);
    const invested = fund && between.length ? between[between.length - 1] : value;

    const prev = rows.get(isin);
    if (prev) {
      // The same security in a second demat account or folio.
      const cost = prev.quantity * prev.price + invested;
      prev.quantity += qty;
      prev.price = cost / prev.quantity;
      continue;
    }
    rows.set(isin, {
      id: crypto.randomUUID(),
      date: "",
      asset: name,
      name,
      action: "Inflow",
      quantity: qty,
      price: invested / qty,
      currency: "INR",
      rate: 1,
      isin,
      ltp: price,
      ...(fund ? {} : { exchange: "NSE" }),
      ...(broker ? { broker } : {}),
    });
  }
  return [...rows.values()];
}
