import { Bell } from "lucide-react";
import { RemindersControlCenter } from "@/components/reminders/RemindersControlCenter";
import { useReminders, priorityBucket } from "@/lib/remindersStore";

export default function RemindersPage() {
  const { records } = useReminders();
  const active = records.filter((r) => r.status !== "completed");
  const dueSoon = active.filter((r) => priorityBucket(r.date).tone !== "safe").length;

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[1000px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
          Stay on track
        </span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
          <Bell className="w-7 h-7" /> Reminders
        </h1>
        <p className="text-muted-foreground mt-2">
          {active.length} active · {dueSoon} need attention within the next 7 days.
        </p>
      </header>

      <RemindersControlCenter />
    </div>
  );
}
