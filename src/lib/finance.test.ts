import { describe, it, expect } from "vitest";
import { formatMoney, formatCompact, toINR } from "./finance";

describe("formatMoney", () => {
  it("prefixes the correct currency symbol", () => {
    expect(formatMoney(1000, "INR")).toBe("₹1,000");
    expect(formatMoney(1000, "USD")).toBe("$1,000");
    expect(formatMoney(1000, "EUR")).toBe("€1,000");
  });

  it("defaults to INR when no currency is given", () => {
    expect(formatMoney(50)).toBe("₹50");
  });

  it("uses the Indian grouping system", () => {
    // 1,00,000 not 100,000
    expect(formatMoney(100000)).toBe("₹1,00,000");
  });

  it("keeps up to two fraction digits", () => {
    expect(formatMoney(1234.5)).toBe("₹1,234.5");
    expect(formatMoney(1234.567)).toBe("₹1,234.57");
  });

  it("emits no symbol for an unknown currency", () => {
    expect(formatMoney(10, "XYZ")).toBe("10");
  });
});

describe("formatMoney boundaries (FIN-002)", () => {
  it("handles zero and the smallest amount", () => {
    expect(formatMoney(0)).toBe("₹0");
    expect(formatMoney(0.01)).toBe("₹0.01");
  });

  it("handles the largest amount the numeric(14,2) columns accept", () => {
    // No overflow, no exponent notation, lakh/crore grouping intact.
    const s = formatMoney(999999999999.99);
    expect(s).toBe("₹9,99,99,99,99,999.99");
    expect(s).not.toMatch(/e\+|NaN|Infinity/i);
  });

  it("keeps the sign on negatives", () => {
    expect(formatMoney(-100)).toBe("-₹100");
  });

  it("never renders NaN or Infinity (BUG-077)", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(formatMoney(bad)).toBe("—");
      expect(formatCompact(bad)).toBe("—");
    }
  });

  it("puts the sign outside the symbol in the compact form too", () => {
    expect(formatCompact(-1234.6)).toBe("-₹1,235");
  });
});

describe("formatCompact", () => {
  it("rounds to the nearest whole number", () => {
    expect(formatCompact(1234.4)).toBe("₹1,234");
    expect(formatCompact(1234.6)).toBe("₹1,235");
  });

  it("honours the currency symbol", () => {
    expect(formatCompact(2000, "USD")).toBe("$2,000");
  });
});

describe("toINR", () => {
  it("returns the same amount for INR", () => {
    expect(toINR(500, "INR")).toBe(500);
  });

  it("applies the USD and EUR FX rates", () => {
    expect(toINR(1, "USD")).toBe(83.5);
    expect(toINR(2, "EUR")).toBe(180);
  });

  it("falls back to a 1:1 rate for unknown currencies", () => {
    expect(toINR(42, "XYZ")).toBe(42);
  });

  it("coerces string-like numeric input", () => {
    expect(toINR("10" as unknown as number, "USD")).toBe(835);
  });
});
