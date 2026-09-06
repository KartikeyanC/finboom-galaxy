import { describe, it, expect } from "vitest";
import {
  eventsInRange,
  groupEventsByDay,
  toDayKey,
  type CalendarEvent,
} from "./calendarEvents";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "goal-1",
  kind: "goal",
  dateKey: "2026-09-10",
  title: "Emergency fund",
  amount: 100000,
  currency: "INR",
  href: "/app/goals",
  ...over,
});

describe("toDayKey", () => {
  it("passes a date-only string straight through", () => {
    expect(toDayKey("2026-09-01")).toBe("2026-09-01");
  });

  it("converts a timestamp in local time", () => {
    const iso = new Date(2026, 8, 1, 23, 30).toISOString();
    expect(toDayKey(iso)).toBe("2026-09-01");
  });

  it("is empty for null or junk", () => {
    expect(toDayKey(null)).toBe("");
    expect(toDayKey("")).toBe("");
    expect(toDayKey("not a date")).toBe("");
  });
});

describe("groupEventsByDay", () => {
  it("buckets by day and drops keyless events", () => {
    const g = groupEventsByDay([
      ev({ id: "a", dateKey: "2026-09-10" }),
      ev({ id: "b", dateKey: "2026-09-10" }),
      ev({ id: "c", dateKey: "2026-09-11" }),
      ev({ id: "d", dateKey: "" }),
    ]);
    expect(g.get("2026-09-10")).toHaveLength(2);
    expect(g.get("2026-09-11")).toHaveLength(1);
    expect([...g.keys()]).not.toContain("");
  });

  it("orders a day by kind then title", () => {
    const g = groupEventsByDay([
      ev({ id: "1", kind: "insurance", title: "Car", dateKey: "2026-09-10" }),
      ev({ id: "2", kind: "budget", title: "Play", dateKey: "2026-09-10" }),
      ev({ id: "3", kind: "budget", title: "Needs", dateKey: "2026-09-10" }),
    ]);
    expect(g.get("2026-09-10")!.map((e) => e.title)).toEqual(["Needs", "Play", "Car"]);
  });
});

describe("eventsInRange", () => {
  it("keeps only keys inside the inclusive window", () => {
    const rows = [
      ev({ id: "1", dateKey: "2026-08-31" }),
      ev({ id: "2", dateKey: "2026-09-01" }),
      ev({ id: "3", dateKey: "2026-09-30" }),
      ev({ id: "4", dateKey: "2026-10-01" }),
    ];
    const kept = eventsInRange(rows, "2026-09-01", "2026-09-30").map((e) => e.id);
    expect(kept).toEqual(["2", "3"]);
  });
});
