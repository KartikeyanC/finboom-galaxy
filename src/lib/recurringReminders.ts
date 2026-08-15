/**
 * Pure helpers for per-recurring-item reminders.
 *
 * Stage 3.1 moved the DATA to `public.recurring_reminders` (see
 * `hooks/useRecurringReminders.ts`); what stays here is the arithmetic, which
 * has no business talking to a database and is far easier to test alone.
 *
 * Previously the whole thing lived in localStorage under
 * `finroot.recurring.reminders.v1` — unnamespaced, so reminders followed the
 * browser rather than the workspace, and a recurring item deleted on one device
 * left its reminder behind forever. The new table's FK cascades instead.
 */

export type ReminderSetting = {
  enabled: boolean;
  days_before: number;
  note: string;
};

export const DEFAULT_REMINDER: ReminderSetting = {
  enabled: false,
  days_before: 3,
  note: "",
};

/**
 * True when today falls inside the reminder window — that is, from
 * `days_before` ahead of the due date up to and including the due date itself.
 *
 * Compared on UTC date parts rather than local `Date` mutation: the old version
 * used `setHours(0,0,0,0)` + `setDate()`, which drifts across a DST boundary and
 * could fire a day early or late. Same lesson as `bumpDate()` in 2.12.
 */
export function isReminderDue(nextDueDate: string, setting: ReminderSetting): boolean {
  if (!setting.enabled) return false;

  const due = toUtcDay(nextDueDate);
  if (due === null) return false;

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const windowOpens = due - setting.days_before * 86_400_000;

  return today >= windowOpens && today <= due;
}

/** Midnight-UTC epoch ms for a date string, or null if unparseable. */
function toUtcDay(value: string): number | null {
  // Date-only strings ("2026-08-06") are the common case and must not be
  // shifted by the local zone, so read the parts directly.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}
