import { describe, it, expect } from "vitest";
import {
  NO_DUE_DATE,
  URGENT_DAYS,
  daysUntil,
  formatDueDate,
  policyUrgency,
} from "./insuranceStore";

/**
 * BUG-087. `insurance.due_date` is nullable and `fromRow` maps a null to `""`,
 * so a policy created by import or by SQL — the Add Policy form requires a date
 * — rendered a card reading "Invalid Date" with a "NaN DAYS" countdown ring.
 *
 * The subtler half was invisible: `NaN < 0` and `NaN >= 0` are both false, so
 * such a policy silently vanished from BOTH the overdue and the urgent counts.
 * The header said "0 overdue" while a card sat there unusable.
 */

/** N days from today, as the `YYYY-MM-DD` the column actually stores. */
function isoDaysFromNow(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("daysUntil", () => {
  it("returns null for every shape of missing date, and never NaN", () => {
    for (const value of [null, undefined, "", "   ", "not a date", "2026-13-45"]) {
      const d = daysUntil(value);
      expect(d, `daysUntil(${JSON.stringify(value)})`).toBeNull();
      expect(Number.isNaN(d as unknown as number)).toBe(false);
    }
  });

  it("still counts real dates in whole days from today", () => {
    expect(daysUntil(isoDaysFromNow(0))).toBe(0);
    expect(daysUntil(isoDaysFromNow(1))).toBe(1);
    expect(daysUntil(isoDaysFromNow(-1))).toBe(-1);
    expect(daysUntil(isoDaysFromNow(45))).toBe(45);
  });

  it("reads the calendar day, not the instant", () => {
    // The column is a date, but a full timestamp reaches this from imports —
    // and a late-evening UTC stamp must not roll the renewal into tomorrow.
    const today = isoDaysFromNow(0);
    expect(daysUntil(`${today}T23:59:00Z`)).toBe(0);
    expect(daysUntil(`${today}T00:00:00Z`)).toBe(0);
  });

  it("takes the calendar day the string names, not the day it lands on locally", () => {
    // 🔴 The rule: a renewal date is a calendar date, not an instant. Going
    // through `new Date(iso)` converts to the reader's zone first, so an
    // offset-bearing stamp gets filed under a different day than it names —
    // here 2026-03-09 20:00 −08:00 is the 10th in India.
    //
    // The same conversion is why `new Date("2026-03-09")` — parsed as UTC
    // midnight by the language — reads as the 8th anywhere west of UTC, making
    // every countdown a day short. That half cannot be demonstrated from
    // Asia/Calcutta; this assertion is the part of the rule that can be.
    expect(daysUntil("2026-03-09T20:00:00-08:00")).toBe(daysUntil("2026-03-09"));
    expect(formatDueDate("2026-03-09T20:00:00-08:00")).toBe(formatDueDate("2026-03-09"));
  });
});

describe("policyUrgency", () => {
  it("calls a policy with no renewal date unknown, not ok and not overdue", () => {
    // 🔴 The whole point. "ok" would put it in the safe pile; "overdue" would
    // raise an alarm about a date nobody ever entered.
    expect(policyUrgency(null)).toBe("unknown");
    expect(policyUrgency("")).toBe("unknown");
    expect(policyUrgency("garbage")).toBe("unknown");
  });

  it("classifies real dates around the threshold", () => {
    expect(policyUrgency(isoDaysFromNow(-1))).toBe("overdue");
    expect(policyUrgency(isoDaysFromNow(0))).toBe("urgent");
    expect(policyUrgency(isoDaysFromNow(URGENT_DAYS - 1))).toBe("urgent");
    expect(policyUrgency(isoDaysFromNow(URGENT_DAYS))).toBe("ok");
    expect(policyUrgency(isoDaysFromNow(365))).toBe("ok");
  });

  it("puts every policy in exactly one bucket", () => {
    const dates = [null, "", "junk", isoDaysFromNow(-30), isoDaysFromNow(3), isoDaysFromNow(200)];
    const counts = { overdue: 0, urgent: 0, ok: 0, unknown: 0 };
    for (const d of dates) counts[policyUrgency(d)]++;
    expect(counts.overdue + counts.urgent + counts.ok + counts.unknown).toBe(dates.length);
    // The header counts read off this: a dateless policy must not inflate either.
    expect(counts.overdue).toBe(1);
    expect(counts.urgent).toBe(1);
    expect(counts.unknown).toBe(3);
  });
});

describe("formatDueDate", () => {
  it("says the field is empty instead of saying the app is broken", () => {
    for (const value of [null, undefined, "", "not a date"]) {
      expect(formatDueDate(value)).toBe(NO_DUE_DATE);
    }
    expect(formatDueDate("")).not.toMatch(/invalid/i);
  });

  it("formats a real date without the time", () => {
    const out = formatDueDate("2026-03-09");
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/Mar/i);
    expect(out).not.toMatch(/:/);
  });
});
