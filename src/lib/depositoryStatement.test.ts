import { describe, it, expect } from "vitest";
import { isDepositoryText, parseDepositoryLines } from "./depositoryStatement";

const NSDL = `NSDL Consolidated Account Statement
Statement for the period from 01-Oct-2026 to 31-Oct-2026
NSDL Demat Account   DP ID: IN300000   Client ID: 12345678
ISIN  Security  Current Bal.  Frozen Bal.  Pledged Bal.  Market Price  Value
INE002A01018 RELIANCE INDUSTRIES LIMITED 10.000 0.000 0.000 2,945.10 29,451.00
INE154A01025 ITC LIMITED# 400.000 0.000 0.000 455.00 1,82,000.00
CDSL Demat Account   BO ID: 1208160000000000
INE154A01025 ITC LIMITED 100.000 0.000 455.00 45,500.00
INF204KB14I2 NIPPON INDIA ETF NIFTY 50 BEES 50.000 0.000 245.10 12,255.00
Mutual Fund Folios
ISIN  Scheme  Folio No.  Closing Bal (Units)  NAV  Cumulative Amount Invested  Valuation  Unrealised Profit/(Loss)
INF879O01027 Parag Parikh Flexi Cap Fund - Direct Plan Growth 12345/67 1,000.000 85.00 60,000.00 85,000.00 25,000.00
INF109K01Z48 ICICI Prudential Nifty 50 Index Fund 9988776 200.000 210.50 45,000.00 42,100.00 (2,900.00)
Total Portfolio Value 3,96,306.00`.split("\n");

describe("isDepositoryText", () => {
  it("knows an NSDL / CDSL statement, and not a CAMS one", () => {
    expect(isDepositoryText(NSDL.join("\n"))).toBe(true);
    expect(isDepositoryText("Consolidated Account Statement CAMS ISIN: INF179K01UT0 Closing Unit Balance: 1")).toBe(false);
  });
});

describe("parseDepositoryLines", () => {
  const rows = parseDepositoryLines(NSDL);
  const by = (isin: string) => rows.find((r) => r.isin === isin)!;

  it("one row per security; headers and totals are not rows", () => {
    expect(rows.map((r) => r.isin)).toEqual([
      "INE002A01018",
      "INE154A01025",
      "INF204KB14I2",
      "INF879O01027",
      "INF109K01Z48",
    ]);
  });

  it("a share: quantity and price found whatever the columns between them; no cost, so today's price", () => {
    expect(by("INE002A01018")).toMatchObject({
      name: "RELIANCE INDUSTRIES LIMITED",
      quantity: 10,
      price: 2945.1,
      ltp: 2945.1,
      exchange: "NSE",
    });
  });

  it("the same share in two demat accounts is added into one", () => {
    expect(by("INE154A01025")).toMatchObject({ name: "ITC LIMITED", quantity: 500, ltp: 455 });
  });

  it("a number in the name stays in the name", () => {
    expect(by("INF204KB14I2")).toMatchObject({ name: "NIPPON INDIA ETF NIFTY 50 BEES", quantity: 50, ltp: 245.1 });
  });

  it("a fund folio: units, NAV and the amount invested; the folio number is not the name", () => {
    expect(by("INF879O01027")).toMatchObject({
      name: "Parag Parikh Flexi Cap Fund - Direct Plan Growth",
      quantity: 1000,
      ltp: 85,
    });
    expect(by("INF879O01027").price * 1000).toBeCloseTo(60000, 2);
    // A folio number without a slash, and a loss in brackets, don't confuse it.
    expect(by("INF109K01Z48").name).toBe("ICICI Prudential Nifty 50 Index Fund");
    expect(by("INF109K01Z48").price * 200).toBeCloseTo(45000, 2);
  });
});
