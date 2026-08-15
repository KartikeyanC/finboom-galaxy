import { Bell } from "lucide-react";
import { DEFAULT_REMINDER, isReminderDue } from "@/lib/recurringReminders";
import { useRecurringReminders } from "@/hooks/useRecurringReminders";
import { useRecurring } from "@/hooks/useRecurring";

/**
 * The one-line "N active · N with reminder · N due now" strip above each
 * recurring list — split out of WorkspaceManage.tsx in Stage 4.13. It fetches
 * its own two lists, so the page passes it nothing but which side it counts.
 */
export default function ReminderSummaryBar({ type }: { type: "income" | "expense" }) {
  const { data: items = [] } = useRecurring(type);
  const { settings: reminders } = useRecurringReminders();
  const active = items.filter((i) => i.is_active);
  const dueCount = active.filter((i) => {
    const r = reminders[i.id] ?? DEFAULT_REMINDER;
    return isReminderDue(i.next_due_date, r);
  }).length;
  const withReminder = active.filter((i) => (reminders[i.id] ?? DEFAULT_REMINDER).enabled).length;

  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-4 py-2.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{active.length} active</span>
      <span className="text-muted-foreground/40">·</span>
      <span className="flex items-center gap-1">
        <Bell className="h-3 w-3 text-primary" />
        {withReminder} with reminder
      </span>
      {dueCount > 0 && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1 text-amber-400 font-medium">
            <Bell className="h-3 w-3" />
            {dueCount} reminder{dueCount > 1 ? "s" : ""} active now
          </span>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────── main page ───────────────────────────────── */
