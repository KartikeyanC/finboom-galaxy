import { describe, it, expect, afterEach, vi } from "vitest";
import { isReminderDue, DEFAULT_REMINDER, type ReminderSetting } from "./recurringReminders";

/**
 * The reminder window is inclusive on both ends: it opens `days_before` days
 * ahead of the due date and closes at end of the due date itself.
 *
 * Stage 3.1 rewrote this on UTC date parts. The old version mutated a local
 * `Date` with `setHours(0,0,0,0)` and `setDate(due.getDate() - n)`, which drifts
 * across a DST boundary — the same family of bug as `bumpDate()` in 2.12.
 */

/**
 * Freeze the clock at LOCAL noon on the given calendar day.
 *
 * "Today" is deliberately the user's local calendar day — a reminder due today
 * should fire on the day their calendar says, not UTC's. So these tests must
 * pin a local day, not a UTC instant: an instant like `2026-08-06T23:00:00Z` is
 * already the 7th in IST, which made an earlier draft of this suite fail on a
 * UTC+5:30 machine and pass in London. Noon is far from either boundary.
 */
const at = (y: number, m: number, d: number) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
};

afterEach(() => vi.useRealTimers());

const on = (days_before: number): ReminderSetting => ({
  enabled: true,
  days_before,
  note: "",
});

describe("isReminderDue", () => {
  it("is false when the reminder is switched off", () => {
    at(2026, 8, 6);
    expect(isReminderDue("2026-08-06", { ...on(3), enabled: false })).toBe(false);
  });

  it("is false by default (a new item does not nag)", () => {
    at(2026, 8, 6);
    expect(isReminderDue("2026-08-06", DEFAULT_REMINDER)).toBe(false);
  });

  it("fires on the day the window opens", () => {
    at(2026, 8, 3);
    expect(isReminderDue("2026-08-06", on(3))).toBe(true);
  });

  it("does not fire the day before the window opens", () => {
    at(2026, 8, 2);
    expect(isReminderDue("2026-08-06", on(3))).toBe(false);
  });

  it("still fires on the due date itself", () => {
    at(2026, 8, 6);
    expect(isReminderDue("2026-08-06", on(3))).toBe(true);
  });

  it("stops after the due date passes", () => {
    at(2026, 8, 7);
    expect(isReminderDue("2026-08-06", on(3))).toBe(false);
  });

  it("supports days_before = 0 (only on the day)", () => {
    at(2026, 8, 6);
    expect(isReminderDue("2026-08-06", on(0))).toBe(true);
    at(2026, 8, 5);
    expect(isReminderDue("2026-08-06", on(0))).toBe(false);
  });

  it("spans a month boundary", () => {
    at(2026, 7, 30);
    expect(isReminderDue("2026-08-02", on(3))).toBe(true);
  });

  it("spans a year boundary", () => {
    at(2025, 12, 30);
    expect(isReminderDue("2026-01-01", on(5))).toBe(true);
  });

  it("handles a leap day", () => {
    at(2028, 2, 27);
    expect(isReminderDue("2028-02-29", on(2))).toBe(true);
  });

  it("does not shift a date-only string by the local timezone", () => {
    // The regression this guards: parsing "2026-08-06" as UTC midnight and then
    // reading LOCAL date parts moves the due date a day in negative offsets.
    at(2026, 8, 6);
    expect(isReminderDue("2026-08-06", on(1))).toBe(true);
  });

  it("accepts a full timestamp, not just a date", () => {
    at(2026, 8, 6);
    expect(isReminderDue("2026-08-06T18:30:00Z", on(1))).toBe(true);
  });

  it("returns false rather than throwing on an unparseable date", () => {
    at(2026, 8, 6);
    expect(isReminderDue("not-a-date", on(3))).toBe(false);
  });
});
