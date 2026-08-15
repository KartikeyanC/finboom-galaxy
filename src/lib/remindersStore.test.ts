import { describe, it, expect, vi } from "vitest";

// remindersStore imports the Supabase client at module load, which needs env
// vars we don't have in tests. Stub it so we can exercise the pure helpers.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ currentTenantId: null }) }));

import { priorityBucket, defaultMessage, CONTEXT_LABEL } from "./remindersStore";

/**
 * Build a `YYYY-MM-DD` string `n` days from today using LOCAL date parts.
 * (toISOString would convert to UTC and shift the date in non-UTC zones.)
 */
function isoInDays(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("priorityBucket", () => {
  it("flags items due within 2 days as danger / Action Required", () => {
    const today = priorityBucket(isoInDays(0));
    expect(today.tone).toBe("danger");
    expect(today.label).toBe("Action Required");
    expect(today.days).toBe(0);

    expect(priorityBucket(isoInDays(2)).tone).toBe("danger");
  });

  it("flags items 3-7 days out as warn / Upcoming", () => {
    expect(priorityBucket(isoInDays(3)).tone).toBe("warn");
    expect(priorityBucket(isoInDays(7))).toMatchObject({ tone: "warn", label: "Upcoming" });
  });

  it("flags items more than a week out as safe / Scheduled", () => {
    expect(priorityBucket(isoInDays(8))).toMatchObject({ tone: "safe", label: "Scheduled" });
    expect(priorityBucket(isoInDays(30)).tone).toBe("safe");
  });

  it("reports negative day counts for overdue items", () => {
    const overdue = priorityBucket(isoInDays(-3));
    expect(overdue.days).toBe(-3);
    expect(overdue.tone).toBe("danger");
  });
});

describe("defaultMessage", () => {
  const base = {
    id: "1",
    title: "Credit Card",
    date: isoInDays(1),
    context: "fixed_due" as const,
    createdAt: new Date().toISOString(),
  };

  it("returns custom notes verbatim when present", () => {
    expect(defaultMessage({ ...base, notes: "Pay the HDFC bill" })).toBe("Pay the HDFC bill");
  });

  it("builds a context-specific message when no notes are given", () => {
    expect(defaultMessage(base)).toContain("Credit Card");
    expect(defaultMessage({ ...base, context: "maturity" })).toContain("maturity");
    expect(defaultMessage({ ...base, context: "balance_buffer" })).toContain("balance");
  });
});

describe("CONTEXT_LABEL", () => {
  it("has a human label for every reminder context", () => {
    expect(CONTEXT_LABEL.fixed_due).toBe("Fixed Due Date");
    expect(CONTEXT_LABEL.balance_buffer).toBe("Balance Buffer Alert");
    expect(CONTEXT_LABEL.maturity).toBe("Maturity Horizon");
  });
});
