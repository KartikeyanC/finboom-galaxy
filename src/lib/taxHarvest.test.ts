import { describe, it, expect } from "vitest";
import type { InvestmentRecord } from "./investmentsStore";
import { financialYear, longTermFrom, lotsOf, notEquity, planHarvest } from "./taxHarvest";

const today = new Date("2026-11-04T10:00:00");

const stock = (id: string, ticker: string, qty: number, buy: number, buyDate?: string, current?: number) =>
  ({
    id,
    asset: "stocks",
    currency: "INR",
    goal: null,
    broker: "Zerodha",
    fields: {
      name: ticker,
      ticker,
      qty: String(qty),
      buy: String(buy),
      ...(buyDate ? { buy_date: buyDate } : {}),
      ...(current ? { current: String(current * qty) } : {}),
    },
    derived: { total: qty * buy, avg: buy },
    savedAt: "2026-10-01T00:00:00Z",
  }) as InvestmentRecord;

const fund = (id: string, scheme: string, lots: [string, number, number][], nav: number, extra = {}) => {
  const units = lots.reduce((s, l) => s + l[1], 0);
  const invested = lots.reduce((s, l) => s + l[1] * l[2], 0);
  return {
    id,
    asset: "mutual_funds",
    currency: "INR",
    goal: null,
    fields: {
      name: scheme,
      scheme,
      units: String(units),
      invested: String(invested),
      nav: String(nav),
      _lots: JSON.stringify(lots),
    },
    derived: { currentValue: units * nav },
    savedAt: "2026-10-01T00:00:00Z",
    ...extra,
  } as InvestmentRecord;
};

describe("dates", () => {
  it("long-term is MORE than 12 months — the day after the anniversary", () => {
    expect(longTermFrom("2025-04-15")).toBe("2026-04-16");
    expect(longTermFrom("2024-02-29")).toBe("2025-03-01");
  });

  it("the financial year runs April to March", () => {
    expect(financialYear(today)).toEqual({ fy: "2026-27", end: "2027-03-31" });
    expect(financialYear(new Date("2027-02-10T10:00:00"))).toEqual({ fy: "2026-27", end: "2027-03-31" });
    expect(financialYear(new Date("2027-04-01T10:00:00")).fy).toBe("2027-28");
  });
});

describe("what qualifies", () => {
  it("Indian shares and equity funds; not debt, gold, international or foreign shares", () => {
    expect(notEquity(stock("a", "NSE:ITC", 1, 1))).toBeNull();
    expect(notEquity(stock("a", "NASDAQ:AAPL", 1, 1))).toMatch(/Foreign/);
    expect(notEquity(fund("f", "Parag Parikh Flexi Cap Fund - Direct Growth", [], 1))).toBeNull();
    expect(notEquity(fund("f", "HDFC Liquid Fund - Direct Growth", [], 1))).toMatch(/equity only/);
    expect(notEquity(fund("f", "Motilal Oswal Nasdaq 100 FOF", [], 1))).toMatch(/equity only/);
    expect(notEquity(fund("f", "Nippon India Gold Savings Fund", [], 1))).toMatch(/equity only/);
  });

  it("with no buy date, a holding counts from the day it was saved — late, never early", () => {
    const { lots, assumed } = lotsOf(stock("a", "NSE:ITC", 10, 400));
    expect(assumed).toBe(true);
    expect(lots).toEqual([{ date: "2026-10-01", qty: 10, cost: 400 }]);
  });

  it("an import's purchase list is used only when it adds up to the units held", () => {
    const ok = fund("f", "X Flexi Cap Fund", [["2024-01-10", 10, 100], ["2025-01-10", 5, 120]], 150);
    expect(lotsOf(ok).lots).toHaveLength(2);
    const off = { ...ok, fields: { ...ok.fields, units: "99" } };
    expect(lotsOf(off).lots).toHaveLength(1);
  });
});

describe("planHarvest", () => {
  it("books long-term gain up to the ₹1.25 L left, in whole shares", () => {
    // 1000 shares bought at 100 in 2024, now 300: ₹200 gain a share.
    const plan = planHarvest({
      records: [stock("a", "NSE:ITC", 1000, 100, "2024-06-01", 300)],
      booked: 0,
      today,
    });
    expect(plan.remaining).toBe(125000);
    expect(plan.holdings[0].sell).toEqual({ units: 625, value: 187500, gain: 125000 });
    expect(plan.planned).toBe(125000);
    expect(plan.taxSaved).toBe(16250);
  });

  it("counts what was already booked this year", () => {
    const plan = planHarvest({
      records: [stock("a", "NSE:ITC", 1000, 100, "2024-06-01", 300)],
      booked: 100000,
      today,
    });
    expect(plan.remaining).toBe(25000);
    expect(plan.holdings[0].sell.units).toBe(125);
    expect(planHarvest({ records: [stock("a", "NSE:ITC", 10, 1, "2024-06-01", 9)], booked: 200000, today }).planned).toBe(0);
  });

  it("FIFO: two purchases of one share are one queue — the older is sold, the newer waits", () => {
    const plan = planHarvest({
      records: [
        stock("a", "NSE:ITC", 10, 100, "2026-06-01", 300), // short-term
        stock("b", "NSE:ITC", 10, 100, "2024-06-01", 300),
      ],
      booked: 0,
      today,
    });
    expect(plan.holdings).toHaveLength(1);
    expect(plan.holdings[0].sell.units).toBe(10);
    expect(plan.upcoming).toEqual([]); // turns long-term in June 2027, after this year ends
  });

  it("a fund's units are sold oldest first, partial units to 3 decimals", () => {
    const plan = planHarvest({
      records: [fund("f", "X Flexi Cap Fund", [["2023-01-10", 1000, 100], ["2026-08-10", 100, 200]], 250)],
      booked: 0,
      today,
    });
    const h = plan.holdings[0];
    expect(h.ltGain).toBe(150000);
    expect(h.sell.units).toBeCloseTo(833.333, 3);
    expect(h.sell.gain).toBeLessThanOrEqual(125000);
    expect(h.sell.gain).toBeGreaterThan(124999);
  });

  it("lists short-term gains that turn long-term before 31 March", () => {
    const plan = planHarvest({
      records: [fund("f", "X Flexi Cap Fund", [["2026-01-20", 100, 100]], 150)],
      booked: 0,
      today,
    });
    expect(plan.holdings).toEqual([]);
    expect(plan.upcoming).toEqual([{ name: "X Flexi Cap Fund", date: "2027-01-21", units: 100, gain: 5000 }]);
  });

  it("skips what it can't plan safely, saying why", () => {
    const plan = planHarvest({
      records: [
        stock("a", "NSE:OLD", 10, 10, "2017-05-01", 50),
        { ...fund("s", "Y Large Cap Fund", [], 10), mfMode: "SIP", fields: { name: "Y Large Cap Fund", scheme: "Y Large Cap Fund", units: "10", invested: "100", nav: "12" } } as InvestmentRecord,
        fund("d", "Z Corporate Bond Fund", [["2022-01-01", 10, 10]], 20),
      ],
      booked: 0,
      today,
    });
    expect(plan.holdings).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/equity only/),
      expect.stringMatching(/1 Feb 2018/),
      expect.stringMatching(/SIP/),
    ]);
  });

  it("ELSS units stay locked for three years from each purchase", () => {
    const plan = planHarvest({
      records: [fund("e", "Axis ELSS Tax Saver Fund", [["2024-03-01", 100, 50]], 90)],
      booked: 0,
      today,
    });
    expect(plan.holdings).toEqual([]); // long-term, but locked until Mar 2027
  });

  it("uses the live price when there is one", () => {
    const plan = planHarvest({
      records: [stock("a", "NSE:ITC", 10, 100, "2024-06-01", 300)],
      livePrice: { a: 500 },
      booked: 0,
      today,
    });
    expect(plan.holdings[0].sell.gain).toBe(4000);
  });
});

describe("undated holdings", () => {
  it("are named so a buy date can be added — short-term ones too", () => {
    const plan = planHarvest({ records: [stock("a", "NSE:TATAMOTORS", 50, 980, undefined, 760)], booked: 0, today });
    expect(plan.undated).toEqual(["NSE:TATAMOTORS"]);
  });
});
