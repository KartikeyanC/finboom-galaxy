import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES,
  COLORS,
  colorStyle,
  emptyForm,
  fromStored,
  toStored,
  type SavedAccount,
} from "./accountMeta";
import type { StoredAccount } from "@/lib/accountsStore";

/**
 * Stage 4.13. These mappers were buried a thousand lines inside
 * AccountsManager, where nothing could reach them — and they are the single
 * point where a saved account's fields can quietly go missing on the way to or
 * from the database. Splitting the file was worth doing mainly because it made
 * this file possible.
 */

const full: SavedAccount = {
  id: "acc-1",
  type: "credit",
  name: "Everyday card",
  holder: "A Kumar",
  bank: "HDFC Bank",
  bankCustom: "",
  last4: "4242",
  expMonth: "09",
  expYear: "29",
  branch: "Anna Nagar",
  openingBalance: "15000",
  openingDate: new Date("2026-03-01T00:00:00.000Z"),
  color: "copper",
  icon: "card",
  purposes: ["Home Expenses", "Emergency Fund"],
};

describe("account round trip", () => {
  it("survives form → store → form unchanged", () => {
    const back = fromStored(toStored(full));
    expect(back).toEqual(full);
  });

  it("carries every field, so a new one cannot be forgotten in half the mapping", () => {
    const stored = toStored(full);
    // Same field count both ways — openingDate ⇄ openingDateISO is the only
    // rename, so a field added to one side and not the other shows up here.
    expect(Object.keys(stored).sort()).toEqual(
      [
        "bank", "bankCustom", "branch", "color", "expMonth", "expYear", "holder",
        "icon", "id", "last4", "name", "openingBalance", "openingDateISO",
        "purposes", "type",
      ].sort(),
    );
  });

  it("converts the date to ISO on the way out and back to a Date on the way in", () => {
    expect(toStored(full).openingDateISO).toBe("2026-03-01T00:00:00.000Z");
    expect(fromStored(toStored(full)).openingDate).toBeInstanceOf(Date);
  });

  it("leaves the date undefined when there is none, rather than inventing today", () => {
    const undated = { ...full, openingDate: undefined };
    expect(toStored(undated).openingDateISO).toBeUndefined();
    expect(fromStored(toStored(undated)).openingDate).toBeUndefined();
  });
});

describe("fromStored defaults", () => {
  // A row written before a column existed, or by an import, has nulls.
  const sparse = { id: "acc-2", type: "bank" } as unknown as StoredAccount;

  it("fills every text field with an empty string, never undefined", () => {
    const f = fromStored(sparse);
    for (const key of [
      "name", "holder", "bank", "bankCustom", "last4", "expMonth", "expYear",
      "branch", "openingBalance",
    ] as const) {
      // undefined here would flip a controlled input to uncontrolled: React
      // warns once and then silently stops tracking that field.
      expect(f[key], `${key} must not be undefined`).toBe("");
    }
  });

  it("falls back to a real colour and icon", () => {
    const f = fromStored(sparse);
    expect(f.color).toBe("emerald");
    expect(COLORS.some((c) => c.id === f.color)).toBe(true);
    expect(f.icon).toBe("wallet");
  });

  it("gives purposes an array so the UI can map over it", () => {
    expect(fromStored(sparse).purposes).toEqual([]);
  });
});

describe("catalogues", () => {
  it("starts a new form on a type that exists", () => {
    expect(ACCOUNT_TYPES.some((t) => t.id === emptyForm().type)).toBe(true);
  });

  it("starts a new form on a colour that exists", () => {
    expect(COLORS.some((c) => c.id === emptyForm().color)).toBe(true);
  });

  it("renders a gradient for every colour in the catalogue", () => {
    for (const c of COLORS) {
      const style = colorStyle(c.id);
      expect(String(style.background)).toContain(c.from);
      expect(String(style.background)).toContain(c.to);
    }
  });

  it("has unique ids, so a lookup cannot pick the wrong entry", () => {
    expect(new Set(ACCOUNT_TYPES.map((t) => t.id)).size).toBe(ACCOUNT_TYPES.length);
    expect(new Set(COLORS.map((c) => c.id)).size).toBe(COLORS.length);
  });
});
