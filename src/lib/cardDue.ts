import { stableUuid } from "./importHoldings";
import type { GraceWindow, ReminderRecord } from "./remindersStore";

/**
 * Credit-card payment-due reminders.
 *
 * The workspace setting `card_due_days` holds, per credit-card account, the
 * day of the month its bill is due and how early to warn. From it each card
 * gets ONE monthly reminder (source "accounts", sourceId = the account) in
 * the reminders table — so it shows wherever reminders already do: the
 * Reminders page, the calendar, the phone.
 *
 * The day lives in the setting, not in the reminder's date, because a
 * reminder rolled forward by months forgets it: the 31st clamped into
 * February is the 28th, and every month after would stay the 28th. Here the
 * date is always worked out again from the day.
 *
 * Pure: [planCardReminders] says what to write; CardDueSync writes it.
 */

export type CardDue = { day: number; lead: GraceWindow };
export type CardDueDays = Record<string, CardDue>;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The [day] in a month, clamped to the month's last day (31 → 30, 28, 29). */
function dayIn(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(1, day), last));
}

/** The next due date on or after [from]: "yyyy-mm-dd". */
export function nextDueDate(day: number, from: Date): string {
  const f = startOfDay(from);
  const thisMonth = dayIn(f.getFullYear(), f.getMonth(), day);
  return iso(thisMonth >= f ? thisMonth : dayIn(f.getFullYear(), f.getMonth() + 1, day));
}

export type CardAccount = { id: string; name: string; type: string; last4?: string | null };

const titleFor = (a: CardAccount) =>
  `${a.name}${a.last4 ? ` ••${a.last4}` : ""} — card payment due`;

/**
 * The writes that make the reminders match the settings: one reminder per
 * credit card with a due day; none for a card without one, or a card that
 * has been deleted. A reminder marked done for this month moves to the next
 * due date. Only reminders this feature made (source "accounts") are ever
 * touched — a reminder the user wrote by hand is never changed or removed.
 */
export function planCardReminders(opts: {
  accounts: CardAccount[];
  dues: CardDueDays;
  reminders: ReminderRecord[];
  tenantId: string;
  today: Date;
}): { upserts: ReminderRecord[]; removes: string[] } {
  const { accounts, dues, reminders, tenantId, today } = opts;
  const mine = reminders.filter((r) => r.source === "accounts" && r.sourceId);
  const upserts: ReminderRecord[] = [];
  const keep = new Set<string>();

  for (const a of accounts) {
    const due = dues[a.id];
    if (a.type !== "credit" || !due || !(due.day >= 1 && due.day <= 31)) continue;
    const existing = mine.find((r) => r.sourceId === a.id);
    // Paid this month: count from the day after that due date.
    let from = startOfDay(today);
    if (existing?.status === "completed") {
      const after = new Date(`${existing.date}T00:00:00`);
      after.setDate(after.getDate() + 1);
      if (after > from) from = after;
    }
    const want: ReminderRecord = {
      id: existing?.id ?? stableUuid(`card-due|${tenantId}|${a.id}`),
      title: titleFor(a),
      context: "fixed_due",
      date: nextDueDate(due.day, from),
      source: "accounts",
      sourceId: a.id,
      frequency: "monthly",
      grace: due.lead,
      status: "scheduled",
      notes: existing?.notes,
      amount: existing?.amount,
      currency: existing?.currency,
      createdAt: existing?.createdAt ?? today.toISOString(),
    };
    keep.add(want.id);
    const same =
      existing &&
      existing.title === want.title &&
      existing.date === want.date &&
      existing.grace === want.grace &&
      existing.frequency === "monthly" &&
      existing.status !== "completed";
    if (!same) upserts.push(want);
  }

  const removes = mine.filter((r) => !keep.has(r.id)).map((r) => r.id);
  return { upserts, removes };
}

/** "5th of every month · 3 days before" — for the account card. */
export function describeCardDue(due: CardDue): string {
  const n = due.day;
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  const lead = due.lead === "exact" ? "on the day" : due.lead === "1d" ? "1 day before" : "3 days before";
  return `${n}${suffix} of every month · reminder ${lead}`;
}
