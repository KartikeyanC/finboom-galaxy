import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, BellOff, CheckCircle2, Trash2, Repeat, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { IconChip } from "@/components/ui/icon-chip";
import { formatMoney } from "@/lib/finance";
import {
  useRecurring, useMarkRecurring, useDeleteRecurring, type RecurringType,
} from "@/hooks/useRecurring";
import {
  DEFAULT_REMINDER, isReminderDue, type ReminderSetting,
} from "@/lib/recurringReminders";
import { useRecurringReminders } from "@/hooks/useRecurringReminders";

const REMINDER_DAYS = [1, 2, 3, 5, 7, 10, 14];

function daysUntil(iso: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(iso); due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function dueInfo(iso: string) {
  const d = daysUntil(iso);
  if (d < 0)
    return {
      text: `${Math.abs(d)}d overdue`,
      cls: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      dot: "bg-rose-400",
      pulse: true,
      overdue: true,
    };
  if (d === 0)
    return {
      text: "Due today",
      cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      dot: "bg-amber-400",
      pulse: true,
      overdue: false,
    };
  if (d <= 7)
    return {
      text: `Due in ${d}d`,
      cls: "bg-sky-500/10 text-sky-400 border-sky-500/25",
      dot: "bg-sky-400",
      pulse: false,
      overdue: false,
    };
  return {
    text: new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    cls: "bg-muted/40 text-muted-foreground border-border/60",
    dot: "bg-muted-foreground/50",
    pulse: false,
    overdue: false,
  };
}

function ReminderPopover({
  itemId,
  nextDueDate,
  setting,
}: {
  itemId: string;
  nextDueDate: string;
  setting: ReminderSetting;
}) {
  const [draft, setDraft] = useState<ReminderSetting>({ ...setting });
  const [open, setOpen] = useState(false);
  const due = isReminderDue(nextDueDate, setting);
  // React Query dedupes, so reading the hook here beats drilling a callback
  // through the card for the one place that actually writes.
  const { save: saveReminder } = useRecurringReminders();

  const save = () => {
    saveReminder(itemId, draft);
    setOpen(false);
  };

  const discard = () => {
    setDraft({ ...setting });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { if (v) setDraft({ ...setting }); setOpen(v); }}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "h-8 w-8 rounded-lg transition-colors",
            setting.enabled
              ? due
                ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                : "text-primary hover:text-primary/80 hover:bg-primary/10"
              : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50",
          )}
          title={setting.enabled ? `Reminder: ${setting.days_before}d before` : "No reminder set"}
        >
          {setting.enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="end">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">Reminder</p>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {draft.enabled && (
          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Notify me</Label>
              <Select
                value={String(draft.days_before)}
                onValueChange={(v) => setDraft((d) => ({ ...d, days_before: Number(v) }))}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_DAYS.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {n} {n === 1 ? "day" : "days"} before due date
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                className="h-7 text-xs"
                placeholder="e.g. Check bank first"
                maxLength={80}
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={save}>
            <Save className="h-3 w-3" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={discard}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface Props { type: RecurringType }

export default function RecurringList({ type }: Props) {
  const { data: items = [], isLoading } = useRecurring(type);
  const mark = useMarkRecurring();
  const del = useDeleteRecurring();
  const { settings: allReminders } = useRecurringReminders();

  const active = items.filter((i) => i.is_active);
  const isIncome = type === "income";

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading recurring items…</div>;
  }

  if (active.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-muted-foreground">
        <Repeat className="w-6 h-6 mx-auto mb-2 opacity-50" />
        No recurring {isIncome ? "income" : "expenses"} yet. Add one to start tracking.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <AnimatePresence initial={false}>
        {active.map((item) => {
          const due = dueInfo(item.next_due_date);
          const reminder = allReminders[item.id] ?? DEFAULT_REMINDER;
          const reminderDue = isReminderDue(item.next_due_date, reminder);

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className={cn(
                "group glass-card relative overflow-hidden p-4 flex flex-col gap-3 transition-all duration-300",
                "hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20",
                reminderDue && "ring-1 ring-amber-500/40",
              )}
            >
              {/* Soft glass top sheen — calm accent (no hard status bar). */}
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent transition-opacity duration-300 opacity-70 group-hover:opacity-100",
                  isIncome ? "via-emerald-400/45" : "via-white/20",
                )}
              />

              {/* Reminder-due ribbon */}
              {reminderDue && (
                <div className="absolute top-0 left-0 right-0 rounded-t-[inherit] bg-amber-500/10 border-b border-amber-500/20 px-3 py-1 flex items-center gap-1.5">
                  <Bell className="h-3 w-3 text-amber-400" />
                  <span className="text-xs font-medium text-amber-400">
                    Reminder: due in {daysUntil(item.next_due_date)}d
                    {reminder.note ? ` — ${reminder.note}` : ""}
                  </span>
                </div>
              )}

              <div className={cn("flex items-start justify-between gap-2", reminderDue && "mt-5")}>
                <div className="flex items-center gap-3 min-w-0">
                  <IconChip name={item.icon ?? "Coins"} size="md" />
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground truncate tracking-tight">{item.name}</div>
                    <div className="text-xs text-muted-foreground truncate capitalize">
                      {item.category} · {item.frequency}
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0 whitespace-nowrap",
                    due.cls,
                  )}
                >
                  <span className="relative flex h-1.5 w-1.5">
                    {due.pulse && (
                      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", due.dot)} />
                    )}
                    <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", due.dot)} />
                  </span>
                  {due.text}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className={cn("font-display text-2xl font-bold tabular-nums", isIncome ? "text-emerald-400" : "text-rose-400")}>
                  {formatMoney(item.amount, item.currency)}
                </span>
                {item.currency !== "INR" && (
                  <span className="text-xs text-muted-foreground font-normal">
                    ≈ {formatMoney(item.amount * Number(item.fx_rate), "INR")}
                  </span>
                )}
              </div>

              {item.notes && (
                <p className="text-xs text-muted-foreground">{item.notes}</p>
              )}

              <div className="flex gap-1.5 items-center border-t border-border/40 pt-3 mt-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "group/btn relative flex-1 h-8 gap-1.5 rounded-lg text-xs font-semibold border overflow-hidden transition-colors",
                    isIncome
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 hover:text-emerald-300"
                      : "bg-muted/40 text-foreground border-border hover:bg-muted",
                  )}
                  onClick={() => mark.mutate(item)}
                  disabled={mark.isPending}
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full" />
                  <CheckCircle2 className="relative w-3.5 h-3.5" />
                  <span className="relative">{isIncome ? "Mark received" : "Mark paid"}</span>
                </Button>

                {/* Reminder toggle */}
                <ReminderPopover
                  itemId={item.id}
                  nextDueDate={item.next_due_date}
                  setting={reminder}
                />

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-rose-400 hover:bg-rose-500/10"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {item.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This stops future occurrences. Past transactions stay in your log.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate(item.id)}>
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
