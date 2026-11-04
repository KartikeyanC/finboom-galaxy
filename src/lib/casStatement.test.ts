import { describe, it, expect } from "vitest";
import { isCasText, parseCasLines } from "./casStatement";
import { holdingToRecord, rowsToHoldings } from "./importHoldings";

// The shape of a CAMS + KFintech detailed CAS, one entry per printed line.
const CAS = `Consolidated Account Statement
01-Apr-2024 To 31-Oct-2026
Folio No: 1234567890 / 0   PAN: ABCDE1234F   KYC: OK  PAN: OK
HDFC Mutual Fund
H03 - HDFC Flexi Cap Fund - Direct Plan - Growth Option (formerly HDFC Equity Fund) - ISIN: INF179K01UT0(Advisor: DIRECT) Registrar : CAMS
Opening Unit Balance: 0.000
15-Apr-2024 Purchase - via Internet 50,000.00 40.123 1,246.17 40.123
10-Jan-2025 Purchase - via Internet 1,00,000.00 80.222 1,246.54 120.345
Closing Unit Balance: 120.345 NAV on 31-Oct-2026: INR 1,800.50 Total Cost Value: 1,50,000.00 Market Value on 31-Oct-2026: INR 2,16,681.17
Folio No: 99887766 / 12   PAN: ABCDE1234F   KYC: OK  PAN: OK
Axis Mutual Fund
B205RG-Axis Bluechip Fund -
Direct Growth - ISIN: INF846K01EW2(Advisor: DIRECT) Registrar : KFINTECH
Opening Unit Balance: 0.000
03-Jun-2025 SIP Purchase 10,000.00 166.667 60.00 166.667
Closing Unit Balance: 166.667 NAV on 31-Oct-2026: INR 65.10
Total Cost Value: 10,000.00 Market Value on 31-Oct-2026: INR 10,850.02
Folio No: 55555 / 1   PAN: ABCDE1234F
P8020 - Parag Parikh Flexi Cap Fund - Direct Plan Growth - ISIN: INF879O01027(Advisor: DIRECT)
Opening Unit Balance: 20.000
02-Feb-2026 Redemption 1,600.00 -20.000 80.00 0.000
Closing Unit Balance: 0.000 NAV on 31-Oct-2026: INR 85.00 Total Cost Value: 0.00 Market Value on 31-Oct-2026: INR 0.00`.split(
  "\n",
);

describe("isCasText", () => {
  it("knows a CAS from a broker statement", () => {
    expect(isCasText(CAS.join("\n"))).toBe(true);
    expect(isCasText("Tradebook  Symbol  ISIN  Trade Type  Quantity  Price")).toBe(false);
  });
});

describe("parseCasLines", () => {
  const rows = parseCasLines(CAS);

  it("one row per fund still held; a fully redeemed one is left out", () => {
    expect(rows.map((r) => r.isin)).toEqual(["INF179K01UT0", "INF846K01EW2"]);
  });

  it("reads units, cost, NAV and the first purchase date (Indian digit grouping)", () => {
    expect(rows[0]).toMatchObject({
      asset: "HDFC Flexi Cap Fund - Direct Plan - Growth Option",
      quantity: 120.345,
      ltp: 1800.5,
      date: "2024-04-15",
      action: "Inflow",
      currency: "INR",
    });
    expect(rows[0].quantity * rows[0].price).toBeCloseTo(150000, 2);
  });

  it("joins a scheme name that wraps onto the ISIN line, and figures split over lines", () => {
    expect(rows[1]).toMatchObject({
      asset: "Axis Bluechip Fund - Direct Growth",
      quantity: 166.667,
      ltp: 65.1,
    });
    expect(rows[1].quantity * rows[1].price).toBeCloseTo(10000, 2);
  });

  it("adds the same fund held in two folios into one", () => {
    const twice = parseCasLines([...CAS.slice(0, 9), ...CAS.slice(2, 9)]);
    expect(twice).toHaveLength(1);
    expect(twice[0].quantity).toBeCloseTo(240.69, 3);
    expect(twice[0].quantity * twice[0].price).toBeCloseTo(300000, 2);
  });

  it("with no cost value, values the fund at its market value", () => {
    const [r] = parseCasLines([
      "X1 - Some Liquid Fund - Direct Growth - ISIN: INF000X01AB1",
      "Closing Unit Balance: 10.000 NAV on 31-Oct-2026: INR 2,000.00 Valuation on 31-Oct-2026: INR 20,000.00",
    ]);
    expect(r.quantity * r.price).toBeCloseTo(20000, 2);
  });

  it("keeps each purchase still held, for the tax-harvest planner", () => {
    expect(rows[0].lots).toEqual([
      { date: "2024-04-15", qty: 40.123, cost: 50000 / 40.123 },
      { date: "2025-01-10", qty: 80.222, cost: 100000 / 80.222 },
    ]);
  });

  it("a redemption takes the oldest units; an opening balance is dated the period's first day", () => {
    const [r] = parseCasLines([
      "01-Apr-2024 To 31-Oct-2026",
      "P1 - Some Flexi Cap Fund - Direct Growth - ISIN: INF000X01AB1",
      "Opening Unit Balance: 10.000",
      "05-May-2024 Purchase 2,000.00 20.000 100.00 30.000",
      "06-Jun-2025 Redemption (1,800.00) (15.000) 120.00 15.000",
      "Closing Unit Balance: 15.000 NAV on 31-Oct-2026: INR 150.00 Total Cost Value: 1,500.00",
    ]);
    // 10 opening units + 5 of the purchase went out; 15 purchase units remain.
    expect(r.lots).toEqual([{ date: "2024-05-05", qty: 15, cost: 100 }]);

    const [kept] = parseCasLines([
      "01-Apr-2024 To 31-Oct-2026",
      "P1 - Some Flexi Cap Fund - Direct Growth - ISIN: INF000X01AB1",
      "Opening Unit Balance: 10.000",
      "05-May-2024 Purchase 2,000.00 20.000 100.00 30.000",
      "Closing Unit Balance: 30.000 NAV on 31-Oct-2026: INR 150.00 Total Cost Value: 2,800.00",
    ]);
    expect(kept.lots).toEqual([
      { date: "2024-04-01", qty: 10, cost: 80 },
      { date: "2024-05-05", qty: 20, cost: 100 },
    ]);
  });

  it("no lots when they don't add up to the closing balance", () => {
    const [r] = parseCasLines([
      "P1 - Some Flexi Cap Fund - Direct Growth - ISIN: INF000X01AB1",
      "05-May-2024 Purchase 2,000.00 20.000 100.00 20.000",
      "Closing Unit Balance: 25.000 NAV on 31-Oct-2026: INR 150.00 Total Cost Value: 2,500.00",
    ]);
    expect(r.lots).toBeUndefined();
  });

  it("becomes mutual-fund holdings in Investments", () => {
    const holdings = rowsToHoldings(rows);
    expect(holdings.map((h) => h.asset)).toEqual(["mutual_funds", "mutual_funds"]);
    const rec = holdingToRecord(holdings[0], { tenantId: "t1", now: "2026-11-04T00:00:00Z" });
    expect(rec).toMatchObject({
      asset: "mutual_funds",
      fields: { units: "120.345", invested: "150000", nav: "1800.5", isin: "INF179K01UT0" },
    });
    expect(JSON.parse(rec.fields._lots)).toEqual([
      ["2024-04-15", 40.123, 1246.1680],
      ["2025-01-10", 80.222, 1246.5408],
    ]);
  });
});
