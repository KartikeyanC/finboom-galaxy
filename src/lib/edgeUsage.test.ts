import { describe, it, expect } from "vitest";
import { isNotApplied, limitsFor, summarise, BUILT_IN_LIMIT } from "./edgeUsage";

const now = new Date("2026-11-05T10:20:00Z");

describe("limitsFor", () => {
  it("built-in, then default, then the function's own, field by field", () => {
    expect(limitsFor("po-auth", null)).toEqual(BUILT_IN_LIMIT);
    const limits = { default: { hour: 100 }, "live-price": { day: 9 } };
    expect(limitsFor("po-auth", limits)).toEqual({ hour: 100, day: 20000, error_rate: 0.2 });
    expect(limitsFor("live-price", limits)).toEqual({ hour: 100, day: 9, error_rate: 0.2 });
  });
});

describe("summarise", () => {
  const rows = [
    { fn: "live-price", hour: "2026-11-05T10:00:00Z", calls: 150, errors: 0 },
    { fn: "live-price", hour: "2026-11-05T09:00:00Z", calls: 50, errors: 2 },
    { fn: "live-price", hour: "2026-11-04T23:00:00Z", calls: 40, errors: 1 },
    { fn: "live-price", hour: "2026-11-03T10:00:00Z", calls: 999, errors: 9 },
    { fn: "po-auth", hour: "2026-11-05T10:00:00Z", calls: 3, errors: 0 },
  ];

  it("splits the current hour, today (UTC) and the last 24 hours", () => {
    const lp = summarise(rows, { "live-price": { hour: 100 } }, now).find((u) => u.fn === "live-price")!;
    expect(lp.lastHour).toBe(150);
    expect(lp.today).toBe(200);
    expect(lp.day24).toBe(240);
    expect(lp.errors24).toBe(3);
    expect(lp.over).toBe(true);
    expect(lp.failing).toBe(false); // 3 errors is below the sample of 10
  });

  it("flags a function failing at or above its error rate", () => {
    const bad = [{ fn: "scan-receipt", hour: "2026-11-05T10:00:00Z", calls: 40, errors: 12 }];
    expect(summarise(bad, null, now).find((u) => u.fn === "scan-receipt")!.failing).toBe(true);
  });

  it("lists every metered function, the busiest against its limit first", () => {
    const all = summarise(rows, { "live-price": { hour: 100 } }, now);
    expect(all[0].fn).toBe("live-price");
    expect(all.find((u) => u.fn === "scan-receipt")).toMatchObject({ lastHour: 0, over: false });
    expect(all.length).toBe(8);
  });
});

describe("isNotApplied", () => {
  it("recognises a missing table", () => {
    expect(isNotApplied({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isNotApplied({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isNotApplied({ code: "42501", message: "permission denied" })).toBe(false);
  });
});
