import type { ImportedRow } from "./importParsers";
import { searchSymbols } from "./symbolSearch";

/**
 * A depository statement names a share by ISIN and company name, never by
 * its trading symbol — but live prices need "NSE:RELIANCE". The symbol search
 * (Yahoo, through the live-price function) answers an ISIN with the listing,
 * so each share is looked up once, NSE preferred, then BSE.
 *
 * A share it can't find keeps its name as the ticker: it still imports, at
 * the statement's price, and the ticker can be fixed by editing it.
 */
export async function resolveIsinTickers(
  rows: ImportedRow[],
  search: typeof searchSymbols = searchSymbols,
): Promise<ImportedRow[]> {
  const shares = rows.filter((r) => r.isin?.startsWith("INE"));
  // A few at a time: one statement can hold dozens of shares.
  for (let i = 0; i < shares.length; i += 4) {
    await Promise.all(
      shares.slice(i, i + 4).map(async (r) => {
        const hits = await search("yahoo", r.isin!);
        const hit =
          hits.find((h) => h.ticker.startsWith("NSE:")) ?? hits.find((h) => h.ticker.startsWith("BSE:"));
        if (!hit) return;
        const [exchange, symbol] = hit.ticker.split(":");
        r.exchange = exchange;
        r.asset = symbol;
        r.name ||= hit.name;
      }),
    );
  }
  return rows;
}
