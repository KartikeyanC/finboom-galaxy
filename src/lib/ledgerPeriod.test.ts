import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LEDGER_PERIOD,
  getLedgerPeriod,
  isLedgerPeriod,
  ledgerPeriodLabel,
  ledgerPeriodSince,
  ledgerPeriodStart,
  LEDGER_PERIODS,
  setLedgerPeriod,
} from "./ledgerPeriod";
import { isRegisteredDeviceLocal } from "./deviceLocal";

// Mid-month, mid-year, so a wrong boundary cannot coincidentally look right.
const NOW = new Date(2026, 7, 11, 14, 30, 0); // 2026-08-11

describe("ledgerPeriodStart", () => {
  it("starts this month at local midnight on the 1st", () => {
    const d = ledgerPeriodStart("month", NOW)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("treats 3 months as three calendar months, not 90 days", () => {
    const d = ledgerPeriodStart("3months", NOW)!;
    expect(d.getMonth()).toBe(5); // June — June, July, August
    expect(d.getDate()).toBe(1);
  });

  it("rolls the 3-month window back across a year boundary", () => {
    const d = ledgerPeriodStart("3months", new Date(2026, 0, 20))!;
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(10); // November
  });

  it("starts the year on 1 January", () => {
    const d = ledgerPeriodStart("year", NOW)!;
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
    expect(d.getFullYear()).toBe(2026);
  });

  it("returns null for all time, which is what removes the filter", () => {
    expect(ledgerPeriodStart("all", NOW)).toBeNull();
    expect(ledgerPeriodSince("all", NOW)).toBeNull();
  });
});

describe("ledgerPeriodSince", () => {
  it("is an ISO instant a gte filter can use", () => {
    const since = ledgerPeriodSince("month", NOW)!;
    expect(() => new Date(since).toISOString()).not.toThrow();
    // The window opens no later than the 1st and never inside the month.
    expect(new Date(since).getTime()).toBeLessThanOrEqual(
      new Date(2026, 7, 1, 0, 0, 0).getTime(),
    );
  });

  it("never excludes a transaction dated on the boundary itself", () => {
    const since = new Date(ledgerPeriodSince("month", NOW)!).getTime();
    const firstOfMonth = new Date(2026, 7, 1, 0, 0, 0).getTime();
    expect(firstOfMonth).toBeGreaterThanOrEqual(since);
  });
});

describe("period options", () => {
  it("labels every option and flags only the slow one", () => {
    expect(LEDGER_PERIODS).toHaveLength(4);
    for (const p of LEDGER_PERIODS) expect(p.label.length).toBeGreaterThan(0);
    expect(LEDGER_PERIODS.filter((p) => p.hint).map((p) => p.id)).toEqual(["all"]);
  });

  it("round-trips ids to labels", () => {
    expect(ledgerPeriodLabel("3months")).toBe("Last 3 months");
    expect(ledgerPeriodLabel("all")).toBe("All time");
  });

  it("rejects anything that is not a period", () => {
    expect(isLedgerPeriod("month")).toBe(true);
    expect(isLedgerPeriod("decade")).toBe(false);
    expect(isLedgerPeriod(null)).toBe(false);
    expect(isLedgerPeriod(undefined)).toBe(false);
  });
});

describe("remembered preference", () => {
  afterEach(() => localStorage.clear());

  it("defaults to three months when nothing is stored", () => {
    expect(getLedgerPeriod()).toBe(DEFAULT_LEDGER_PERIOD);
    expect(DEFAULT_LEDGER_PERIOD).toBe("3months");
  });

  it("round-trips a stored choice", () => {
    setLedgerPeriod("year");
    expect(getLedgerPeriod()).toBe("year");
  });

  it("falls back rather than trusting a corrupted value", () => {
    localStorage.setItem("finroot.ledger.period", "since-the-dawn-of-time");
    expect(getLedgerPeriod()).toBe(DEFAULT_LEDGER_PERIOD);
  });

  it("is a registered device-local key", () => {
    // Stage 3.2's guard: storage keys must be a decision on the record.
    expect(isRegisteredDeviceLocal("finroot.ledger.period")).toBe(true);
  });
});
