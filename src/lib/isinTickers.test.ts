import { describe, it, expect, vi } from "vitest";
import type { ImportedRow } from "./importParsers";
import { resolveIsinTickers } from "./isinTickers";
import { rowsToHoldings } from "./importHoldings";

const row = (isin: string, name: string): ImportedRow => ({
  id: isin,
  date: "",
  asset: name,
  name,
  action: "Inflow",
  quantity: 10,
  price: 100,
  currency: "INR",
  rate: 1,
  isin,
  exchange: "NSE",
});

describe("resolveIsinTickers", () => {
  it("finds each share's NSE symbol by ISIN (BSE when there is no NSE listing); funds aren't looked up", async () => {
    const search = vi.fn(async (_p: string, q: string) =>
      q === "INE002A01018"
        ? [{ ticker: "BSE:RELIANCE", name: "Reliance", exchange: "BSE" }, { ticker: "NSE:RELIANCE", name: "Reliance", exchange: "NSE" }]
        : q === "INE999Z01011"
          ? [{ ticker: "BSE:TINYCO", name: "Tiny Co", exchange: "BSE" }]
          : [],
    );
    const rows = await resolveIsinTickers(
      [row("INE002A01018", "RELIANCE INDUSTRIES LIMITED"), row("INE999Z01011", "TINY CO LTD"), row("INF879O01027", "PPFAS")],
      search,
    );
    expect(search).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => [r.exchange, r.asset])).toEqual([
      ["NSE", "RELIANCE"],
      ["BSE", "TINYCO"],
      ["NSE", "PPFAS"],
    ]);
    // The holding keeps the company's name; its ticker is the symbol live prices use.
    const [h] = rowsToHoldings([rows[0]]);
    expect(h).toMatchObject({ name: "RELIANCE INDUSTRIES LIMITED", ticker: "NSE:RELIANCE" });
  });

  it("a share it can't find keeps its name", async () => {
    const [r] = await resolveIsinTickers([row("INE000X01010", "UNLISTED LTD")], async () => []);
    expect(r.asset).toBe("UNLISTED LTD");
  });
});
