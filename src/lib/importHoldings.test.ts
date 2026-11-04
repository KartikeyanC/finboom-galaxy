import { describe, it, expect } from "vitest";
import type { ImportedRow } from "./importParsers";
import { holdingToRecord, rowsToHoldings, stableUuid } from "./importHoldings";
import { getCurrent, getInvested, getRecordName } from "./investmentsStore";

let n = 0;
const row = (p: Partial<ImportedRow>): ImportedRow => ({
  id: `r${n++}`,
  date: "",
  asset: "ITC",
  action: "Inflow",
  quantity: 0,
  price: 0,
  currency: "INR",
  rate: 1,
  ...p,
});

describe("rowsToHoldings — a tradebook", () => {
  it("adds buys at average cost and takes sells off at that average", () => {
    const [h] = rowsToHoldings([
      row({ date: "2024-04-15", quantity: 10, price: 400, exchange: "NSE" }),
      row({ date: "2024-05-02", quantity: 10, price: 420, exchange: "NSE" }),
      row({ date: "2024-06-01", action: "Outflow", quantity: 5, price: 450, exchange: "NSE" }),
    ]);
    expect(h).toMatchObject({
      key: "NSE:ITC",
      ticker: "NSE:ITC",
      asset: "stocks",
      qty: 15,
      avg: 410,
      invested: 6150,
      since: "2024-04-15",
    });
  });

  it("keeps the purchases still held, a sell taking the oldest first (for tax)", () => {
    const [h] = rowsToHoldings([
      row({ date: "2024-04-15", quantity: 10, price: 400, exchange: "NSE" }),
      row({ date: "2024-05-02", quantity: 10, price: 420, exchange: "NSE" }),
      row({ date: "2024-06-01", action: "Outflow", quantity: 15, price: 450, exchange: "NSE" }),
    ]);
    expect(h.lots).toEqual([{ date: "2024-05-02", qty: 5, cost: 420 }]);
    const rec = holdingToRecord(h, { tenantId: "t1", now: "2026-11-04T00:00:00Z" });
    expect(JSON.parse(rec.fields._lots)).toEqual([["2024-05-02", 5, 420]]);
  });

  it("no purchase list when a date is missing", () => {
    const [h] = rowsToHoldings([row({ quantity: 10, price: 400 })]);
    expect(h.lots).toBeUndefined();
    expect(holdingToRecord(h, { tenantId: "t1" }).fields._lots).toBeUndefined();
  });

  it("works in date order even when the file is not", () => {
    const [h] = rowsToHoldings([
      row({ date: "2024-06-01", action: "Outflow", quantity: 5, price: 450 }),
      row({ date: "2024-04-15", quantity: 10, price: 400 }),
    ]);
    expect(h).toMatchObject({ qty: 5, avg: 400 });
  });

  it("drops a position sold to zero, and restarts one bought again", () => {
    const hs = rowsToHoldings([
      row({ asset: "INFY", date: "2024-01-10", quantity: 2, price: 1500 }),
      row({ asset: "INFY", date: "2024-02-10", action: "Outflow", quantity: 2, price: 1600 }),
      row({ asset: "TCS", date: "2024-01-10", quantity: 1, price: 3500 }),
      row({ asset: "TCS", date: "2024-02-10", action: "Outflow", quantity: 1, price: 3600 }),
      row({ asset: "TCS", date: "2024-03-10", quantity: 2, price: 3800 }),
    ]);
    expect(hs.map((h) => h.name)).toEqual(["TCS"]);
    expect(hs[0]).toMatchObject({ qty: 2, avg: 3800, since: "2024-03-10" });
  });

  it("keeps the same symbol on two exchanges apart", () => {
    const hs = rowsToHoldings([
      row({ quantity: 1, price: 400, exchange: "NSE" }),
      row({ quantity: 1, price: 401, exchange: "BSE" }),
    ]);
    expect(hs.map((h) => h.key).sort()).toEqual(["BSE:ITC", "NSE:ITC"]);
  });
});

describe("rowsToHoldings — a holdings export", () => {
  it("one line per holding; a fund is told apart by its INF… ISIN", () => {
    const hs = rowsToHoldings([
      row({ asset: "DRREDDY", quantity: 5, price: 1199.73, isin: "INE089A01031", ltp: 1352 }),
      row({
        asset: "PARAG PARIKH FLEXI CAP FUND - DIRECT PLAN",
        quantity: 412.35,
        price: 72.75,
        isin: "INF879O01027",
        ltp: 82.96,
      }),
    ]);
    expect(hs[0]).toMatchObject({ asset: "stocks", ticker: "NSE:DRREDDY", qty: 5, ltp: 1352 });
    expect(hs[1]).toMatchObject({
      asset: "mutual_funds",
      key: "INF879O01027",
      ticker: undefined,
      qty: 412.35,
    });
  });
});

describe("holdingToRecord", () => {
  const opts = { tenantId: "t1", broker: "Zerodha", now: "2026-11-02T00:00:00.000Z" };

  it("a share reads like one added by hand: name, ticker, invested, current", () => {
    const [h] = rowsToHoldings([
      row({ date: "2024-04-15", quantity: 10, price: 410.5, exchange: "NSE", ltp: 438 }),
    ]);
    const rec = holdingToRecord(h, opts);
    expect(rec).toMatchObject({
      asset: "stocks",
      broker: "Zerodha",
      currency: "INR",
      fields: { name: "ITC", ticker: "NSE:ITC", qty: "10", buy: "410.5", buy_date: "2024-04-15" },
    });
    expect(getRecordName(rec)).toBe("ITC");
    expect(getInvested(rec)).toBe(4105);
    expect(getCurrent(rec)).toBe(4380);
  });

  it("a fund carries units, invested and NAV", () => {
    const [h] = rowsToHoldings([
      row({ asset: "Parag Parikh Flexi Cap", quantity: 100, price: 70, isin: "INF879O01027", ltp: 80 }),
    ]);
    const rec = holdingToRecord(h, opts);
    expect(rec.asset).toBe("mutual_funds");
    expect(getInvested(rec)).toBe(7000);
    expect(getCurrent(rec)).toBe(8000);
  });

  it("the same holding in the same workspace gets the same id; another workspace a different one", () => {
    const [h] = rowsToHoldings([row({ quantity: 1, price: 1 })]);
    expect(holdingToRecord(h, opts).id).toBe(holdingToRecord(h, opts).id);
    expect(holdingToRecord(h, { ...opts, tenantId: "t2" }).id).not.toBe(
      holdingToRecord(h, opts).id,
    );
  });

  it("an unknown broker name is filed as a direct holding", () => {
    const [h] = rowsToHoldings([row({ quantity: 1, price: 1 })]);
    expect(holdingToRecord(h, { ...opts, broker: "Some Bank" }).broker).toBe(
      "Other / Direct Holding",
    );
  });
});

describe("stableUuid", () => {
  it("is a well-formed version-5 UUID", () => {
    expect(stableUuid("import|t1|Zerodha|NSE:ITC")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
