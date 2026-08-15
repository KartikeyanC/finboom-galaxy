import { describe, it, expect, vi } from "vitest";

// useRecurring imports the Supabase client and tenant context at module load,
// so both are stubbed before the module under test is pulled in.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}), rpc: () => ({}) },
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenantId: null }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

const { bumpDate } = await import("./useRecurring");

describe("bumpDate", () => {
  describe("weekly", () => {
    it("adds exactly 7 days", () => {
      expect(bumpDate("2026-03-10", "weekly")).toBe("2026-03-17");
    });

    it("rolls over a month boundary", () => {
      expect(bumpDate("2026-03-28", "weekly")).toBe("2026-04-04");
    });

    it("rolls over a year boundary", () => {
      expect(bumpDate("2026-12-28", "weekly")).toBe("2027-01-04");
    });
  });

  describe("monthly", () => {
    it("keeps the day of month when it exists in the target month", () => {
      expect(bumpDate("2026-03-15", "monthly")).toBe("2026-04-15");
    });

    // The regression this function was rewritten for: Date.setMonth() overflowed
    // Jan 31 into Mar 3 because February has no 31st.
    it("clamps Jan 31 to the last day of February (non-leap)", () => {
      expect(bumpDate("2026-01-31", "monthly")).toBe("2026-02-28");
    });

    it("clamps Jan 31 to Feb 29 in a leap year", () => {
      expect(bumpDate("2024-01-31", "monthly")).toBe("2024-02-29");
    });

    it("clamps a 31-day month into a 30-day month", () => {
      expect(bumpDate("2026-05-31", "monthly")).toBe("2026-06-30");
    });

    it("rolls December into January of the next year", () => {
      expect(bumpDate("2026-12-15", "monthly")).toBe("2027-01-15");
    });

    it("rolls Dec 31 into Jan 31", () => {
      expect(bumpDate("2026-12-31", "monthly")).toBe("2027-01-31");
    });
  });

  describe("yearly", () => {
    it("advances the year, keeping month and day", () => {
      expect(bumpDate("2026-07-04", "yearly")).toBe("2027-07-04");
    });

    it("clamps Feb 29 to Feb 28 when the next year is not a leap year", () => {
      expect(bumpDate("2024-02-29", "yearly")).toBe("2025-02-28");
    });
  });

  it("is timezone-independent (pure date-part arithmetic)", () => {
    // A UTC-midnight input must not drift a day in negative-offset zones.
    expect(bumpDate("2026-01-01", "monthly")).toBe("2026-02-01");
    expect(bumpDate("2026-01-01", "weekly")).toBe("2026-01-08");
    expect(bumpDate("2026-01-01", "yearly")).toBe("2027-01-01");
  });

  it("tolerates a full ISO timestamp as input", () => {
    expect(bumpDate("2026-01-31T18:30:00.000Z", "monthly")).toBe("2026-02-28");
  });
});
