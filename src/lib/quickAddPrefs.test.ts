import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, MAX_RECENT, parsePrefs, pushRecent } from "./quickAddPrefs";

describe("pushRecent", () => {
  it("puts the newest first and removes duplicates", () => {
    expect(pushRecent(["Food", "Rent"], "Rent")).toEqual(["Rent", "Food"]);
  });
  it("caps the list", () => {
    const list = ["a", "b", "c", "d", "e"];
    expect(pushRecent(list, "f")).toHaveLength(MAX_RECENT);
    expect(pushRecent(list, "f")[0]).toBe("f");
  });
});

describe("parsePrefs", () => {
  it("falls back to defaults for missing or corrupt data", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{nope")).toEqual(DEFAULT_PREFS);
  });
  it("drops invalid fields instead of throwing", () => {
    const p = parsePrefs(JSON.stringify({ type: "x", currency: 5, recent: { expense: [1], income: ["Salary"] } }));
    expect(p.type).toBe("expense");
    expect(p.currency).toBe("INR");
    expect(p.recent).toEqual({ expense: [], income: ["Salary"] });
  });
  it("keeps valid saved choices", () => {
    const p = parsePrefs(JSON.stringify({ type: "income", currency: "USD", recent: { expense: ["Food"], income: [] } }));
    expect(p.type).toBe("income");
    expect(p.currency).toBe("USD");
    expect(p.recent.expense).toEqual(["Food"]);
  });
});
