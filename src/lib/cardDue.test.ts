import { describe, it, expect } from "vitest";
import { describeCardDue, nextDueDate, planCardReminders, type CardAccount } from "./cardDue";
import type { ReminderRecord } from "./remindersStore";

const d = (s: string) => new Date(`${s}T10:00:00`);

describe("nextDueDate", () => {
  it("this month when the day is still ahead (or today)", () => {
    expect(nextDueDate(15, d("2026-11-03"))).toBe("2026-11-15");
    expect(nextDueDate(3, d("2026-11-03"))).toBe("2026-11-03");
  });

  it("next month once it has passed, across the year end", () => {
    expect(nextDueDate(2, d("2026-11-03"))).toBe("2026-12-02");
    expect(nextDueDate(5, d("2026-12-20"))).toBe("2027-01-05");
  });

  it("a day past the month's end falls on its last day — and comes back", () => {
    expect(nextDueDate(31, d("2026-11-03"))).toBe("2026-11-30");
    expect(nextDueDate(31, d("2027-02-01"))).toBe("2027-02-28");
    expect(nextDueDate(31, d("2028-02-01"))).toBe("2028-02-29");
    expect(nextDueDate(31, d("2027-03-01"))).toBe("2027-03-31"); // not stuck on the 28th
  });
});

const card: CardAccount = { id: "c1", name: "HDFC Regalia", type: "credit", last4: "4321" };
const bank: CardAccount = { id: "b1", name: "SBI Savings", type: "bank" };
const base = { tenantId: "t1", today: d("2026-11-03") };

const reminder = (p: Partial<ReminderRecord>): ReminderRecord => ({
  id: "r1",
  title: "x",
  context: "fixed_due",
  date: "2026-11-05",
  createdAt: "2026-10-01T00:00:00Z",
  ...p,
});

describe("planCardReminders", () => {
  it("makes a monthly reminder for a card with a due day", () => {
    const { upserts, removes } = planCardReminders({
      ...base,
      accounts: [card, bank],
      dues: { c1: { day: 5, lead: "3d" } },
      reminders: [],
    });
    expect(removes).toEqual([]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      title: "HDFC Regalia ••4321 — card payment due",
      context: "fixed_due",
      date: "2026-11-05",
      frequency: "monthly",
      grace: "3d",
      source: "accounts",
      sourceId: "c1",
      status: "scheduled",
    });
  });

  it("does nothing when the reminder already matches", () => {
    const first = planCardReminders({
      ...base,
      accounts: [card],
      dues: { c1: { day: 5, lead: "3d" } },
      reminders: [],
    }).upserts[0];
    const again = planCardReminders({
      ...base,
      accounts: [card],
      dues: { c1: { day: 5, lead: "3d" } },
      reminders: [first],
    });
    expect(again).toEqual({ upserts: [], removes: [] });
  });

  it("moves a passed or paid reminder to the next due date, keeping its id and note", () => {
    const paid = reminder({
      id: "r1",
      source: "accounts",
      sourceId: "c1",
      date: "2026-11-05",
      status: "completed",
      notes: "autopay on",
      title: "HDFC Regalia ••4321 — card payment due",
      frequency: "monthly",
      grace: "3d",
    });
    const { upserts } = planCardReminders({
      ...base,
      accounts: [card],
      dues: { c1: { day: 5, lead: "3d" } },
      reminders: [paid],
    });
    expect(upserts[0]).toMatchObject({ id: "r1", date: "2026-12-05", status: "scheduled", notes: "autopay on" });
  });

  it("removes the reminder when the day is cleared or the card is deleted", () => {
    const existing = reminder({ id: "r1", source: "accounts", sourceId: "c1" });
    expect(
      planCardReminders({ ...base, accounts: [card], dues: {}, reminders: [existing] }).removes,
    ).toEqual(["r1"]);
    expect(
      planCardReminders({
        ...base,
        accounts: [],
        dues: { c1: { day: 5, lead: "3d" } },
        reminders: [existing],
      }).removes,
    ).toEqual(["r1"]);
  });

  it("never touches a reminder the user wrote", () => {
    const manual = reminder({ id: "m1", source: "manual", title: "Pay HDFC card" });
    const { upserts, removes } = planCardReminders({
      ...base,
      accounts: [card],
      dues: {},
      reminders: [manual],
    });
    expect(upserts).toEqual([]);
    expect(removes).toEqual([]);
  });

  it("only credit cards get one", () => {
    const { upserts } = planCardReminders({
      ...base,
      accounts: [bank],
      dues: { b1: { day: 5, lead: "3d" } },
      reminders: [],
    });
    expect(upserts).toEqual([]);
  });
});

describe("describeCardDue", () => {
  it("reads naturally", () => {
    expect(describeCardDue({ day: 1, lead: "3d" })).toBe("1st of every month · reminder 3 days before");
    expect(describeCardDue({ day: 22, lead: "exact" })).toBe("22nd of every month · reminder on the day");
    expect(describeCardDue({ day: 13, lead: "1d" })).toBe("13th of every month · reminder 1 day before");
  });
});
