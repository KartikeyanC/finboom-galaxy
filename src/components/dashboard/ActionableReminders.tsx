import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Bell, Shield, TrendingUp, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useReminders, priorityBucket, type ReminderRecord } from "@/lib/remindersStore";
import { useRecurring } from "@/hooks/useRecurring";
import { formatCompact } from "@/lib/finance";
import { cn } from "@/lib/utils";

type FilterMode = "all" | "soon" | "today";

// Unified display item combining reminders + recurring items
type DisplayItem = {
  id: string;
  title: string;
  subtitle: string;
  amount?: number;
  currency?: string;
  daysUntil: number;
  tone: "danger" | "warn" | "safe";
  isRecurring: boolean;
};

function toneFor(days: number): "danger" | "warn" | "safe" {
  if (days <= 2) return "danger";
  if (days <= 7) return "warn";
  return "safe";
}

const TONE_STYLES = {
  danger: { bg: "bg-destructive/10", border: "border-destructive/25", icon: "text-destructive", Icon: AlertTriangle },
  warn: { bg: "bg-amber-500/10", border: "border-amber-500/20", icon: "text-amber-500", Icon: Shield },
  safe: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: "text-emerald-500", Icon: TrendingUp },
};

const FILTER_LABELS: Record<FilterMode, string> = {
  all: "All",
  soon: "This Week",
  today: "Today",
};

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

const ActionableReminders = () => {
  const { records } = useReminders();
  const { data: recurringItems = [] } = useRecurring();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const items = useMemo<DisplayItem[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 30);

    // From reminders store
    const fromReminders: DisplayItem[] = records
      .filter((r) => r.status !== "completed")
      .map((r) => {
        const days = daysUntil(r.date);
        return {
          id: r.id,
          title: r.title,
          subtitle: days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "due today" : `in ${days}d`,
          amount: r.amount,
          currency: r.currency,
          daysUntil: days,
          tone: toneFor(days),
          isRecurring: false,
        };
      })
      .filter((i) => i.daysUntil <= 30);

    // From recurring items
    const fromRecurring: DisplayItem[] = recurringItems
      .filter((r) => r.is_active && r.next_due_date)
      .map((r) => {
        const days = daysUntil(r.next_due_date);
        return {
          id: `rec-${r.id}`,
          title: r.name,
          subtitle: `${r.category} · ${r.frequency}${days < 0 ? ` · ${Math.abs(days)}d overdue` : days === 0 ? " · due today" : ` · in ${days}d`}`,
          amount: r.amount,
          currency: r.currency,
          daysUntil: days,
          tone: toneFor(days),
          isRecurring: true,
        };
      })
      .filter((i) => i.daysUntil <= 30);

    const merged = [...fromReminders, ...fromRecurring].sort(
      (a, b) => a.daysUntil - b.daysUntil,
    );

    if (filter === "today") return merged.filter((i) => i.daysUntil === 0);
    if (filter === "soon") return merged.filter((i) => i.daysUntil <= 7);
    return merged.slice(0, 5);
  }, [records, recurringItems, filter]);

  const cycleFilter = () => {
    setFilter((f) => (f === "all" ? "soon" : f === "soon" ? "today" : "all"));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Reminders
        </h2>
        <button
          onClick={cycleFilter}
          title={`Filter: ${FILTER_LABELS[filter]}`}
          className={cn(
            // Stage 4.7: py-1.5 + min-w-6 take this filter pill to 26x30 —
            // it was 30x22, under the 24 px minimum (WCAG 2.5.8).
            "flex items-center gap-1.5 rounded-full px-2 py-1.5 min-w-6 text-[11px] font-semibold uppercase tracking-wide transition-colors",
            filter === "all"
              ? "text-muted-foreground hover:text-foreground"
              : filter === "soon"
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
          )}
        >
          <Bell className="w-3.5 h-3.5" />
          {filter !== "all" && FILTER_LABELS[filter]}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <CheckCircle2 className="w-6 h-6 opacity-40" />
          {filter === "today"
            ? "Nothing due today."
            : filter === "soon"
            ? "Nothing due this week."
            : "You're all caught up — no upcoming reminders."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const c = TONE_STYLES[item.tone];
            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${c.bg} ${c.border}`}
              >
                <span className={`mt-0.5 ${c.icon}`}>
                  {item.isRecurring
                    ? <RefreshCw className="w-4 h-4" />
                    : <c.Icon className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-foreground block truncate">
                    {item.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.amount ? `${formatCompact(item.amount)} · ` : ""}
                    {item.subtitle}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default ActionableReminders;
