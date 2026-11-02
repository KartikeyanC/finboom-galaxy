import { describe, it, expect } from "vitest";
import {
  averagePriceOf,
  money2,
  qty2,
  quantityOf,
  signedMoney2,
  signedPct2,
} from "./holdingFigures";
import type { InvestmentRecord } from "./investmentsStore";

const rec = (p: Partial<InvestmentRecord>): InvestmentRecord => ({
  id: "x",
  asset: "stocks",
  currency: "INR",
  goal: null,
  fields: {},
  derived: {},
  savedAt: "2026-01-01T00:00:00Z",
  ...p,
});

describe("holding figures", () => {
  it("always two decimals, Indian grouping", () => {
    expect(money2(9222.5)).toBe("₹9,222.50");
    expect(money2(9471)).toBe("₹9,471.00");
    expect(money2(142929.31)).toBe("₹1,42,929.31");
    expect(money2(-290)).toBe("-₹290.00");
  });

  it("signs P&L and its percent", () => {
    expect(signedMoney2(280)).toBe("+₹280.00");
    expect(signedMoney2(-290)).toBe("-₹290.00");
    expect(signedPct2(280, 4100)).toBe("+6.83%");
    expect(signedPct2(-290, 4900)).toBe("-5.92%");
    expect(signedPct2(10, 0)).toBe("—");
  });

  it("quantity and average for shares and funds; none for a deposit", () => {
    const share = rec({ fields: { qty: "10", buy: "410" }, derived: { total: 4100 } });
    expect(quantityOf(share)).toBe(10);
    expect(averagePriceOf(share)).toBe(410);
    const fund = rec({ asset: "mutual_funds", fields: { units: "412.35", invested: "30000" } });
    expect(quantityOf(fund)).toBe(412.35);
    expect(averagePriceOf(fund)).toBeCloseTo(72.75, 2);
    expect(quantityOf(rec({ asset: "fd", fields: { deposit: "50000" } }))).toBe(0);
  });

  it("whole quantities without decimals", () => {
    expect(qty2(10)).toBe("10");
    expect(qty2(412.35)).toBe("412.35");
  });
});
