import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TransactionDialog from "@/components/transactions/TransactionDialog";
import { useDeleteTransaction, type Transaction, type TxnType } from "@/hooks/useTransactions";
import { useTrackerNameMap } from "@/hooks/useTrackers";
import TrackerBadge from "@/components/trackers/TrackerBadge";
import { formatMoney } from "@/lib/finance";
import { categoryBadgeClass } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { useAccess } from "@/contexts/AccessContext";
import { EVENT_META, type CalendarEvent } from "@/lib/calendarEvents";

interface Props {
  /** Local `YYYY-MM-DD` of the selected day. */
  dateKey: string;
  date: Date;
  rows: Transaction[];
  /** Investments / budgets / goals / insurance dated to this day (read-only). */
  events: CalendarEvent[];
  isLight: boolean;
}

/**
 * The rows for whichever day is selected on the grid — the "one place" the
 * month's activity is reviewed from. Add lands on the selected day; edit and
 * delete reuse the same dialog and mutation the ledger uses.
 */
export default function DayDetail({ dateKey, date, rows, events, isLight }: Props) {
  const del = useDeleteTransaction();
  const trackerNames = useTrackerNameMap();
  const { canWrite } = useAccess();
  const writable = canWrite("expenses");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [addType, setAddType] = useState<TxnType>("expense");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
    [rows],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of rows) {
      if (t.type === "income") income += Number(t.amount);
      else if (t.type === "expense") expense += Number(t.amount);
    }
    return { income, expense };
  }, [rows]);

  // Seed the dialog's date with the selected day, keeping the current time.
  const seededDate = useMemo(() => {
    const now = new Date();
    const d = new Date(date);
    d.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return d.toISOString();
  }, [date]);

  const openAdd = (type: TxnType) => {
    setAddType(type);
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <section
      aria-label={`Transactions on ${date.toLocaleDateString(undefined, { dateStyle: "full" })}`}
      className="glass-card p-4 sm:p-5 flex flex-col"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {date.toLocaleDateString(undefined, { weekday: "long" })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        {writable && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-8" onClick={() => openAdd("income")}>
              <Plus className="w-3.5 h-3.5 mr-1" /> In
            </Button>
            <Button size="sm" className="h-8" onClick={() => openAdd("expense")}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Out
            </Button>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="flex gap-4 text-sm mb-3 mt-2">
          <span className="text-success font-medium">+{formatMoney(totals.income)}</span>
          <span className="text-coral font-medium">-{formatMoney(totals.expense)}</span>
        </div>
      )}

      <div className="space-y-2 overflow-y-auto max-h-[52vh] -mx-1 px-1">
        {sorted.length === 0 && events.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nothing recorded on this day.
          </p>
        )}

        {sorted.map((t) => (
            <div
              key={t.id}
              className="group flex items-center gap-3 rounded-lg border border-border/50 bg-card/40 p-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {t.tracker_id && trackerNames.get(t.tracker_id) ? (
                    <TrackerBadge name={trackerNames.get(t.tracker_id) as string} isLight={isLight} />
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                        categoryBadgeClass(t.type, t.category, isLight),
                      )}
                    >
                      {t.category}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.occurred_at).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {t.description && (
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{t.description}</p>
                )}
              </div>

              <span
                className={cn(
                  "font-display font-semibold tabular-nums shrink-0",
                  t.type === "income" && "text-success",
                  t.type === "expense" && "text-coral",
                  t.type === "transfer" && "text-sky-400",
                )}
              >
                {t.type === "income" ? "+" : t.type === "expense" ? "-" : ""}
                {formatMoney(Number(t.amount), t.currency)}
              </span>

              {writable && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${t.description ?? t.category}`}
                    className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                    onClick={() => {
                      setEditing(t);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${t.description ?? t.category}`}
                    className="h-7 w-7 text-coral hover:text-coral hover:bg-destructive/10"
                    onClick={() => setDeleteId(t.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}

        {events.length > 0 && (
          <div className={cn(sorted.length > 0 && "pt-3 mt-1 border-t border-border/40")}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Also on this day
            </h3>
            <div className="space-y-2">
              {events.map((e) => (
                <Link
                  key={e.id}
                  to={e.href}
                  className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/40 p-2.5 hover:border-primary/40 transition-colors"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", EVENT_META[e.kind].dot)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {EVENT_META[e.kind].label} · {EVENT_META[e.kind].verb}
                    </p>
                  </div>
                  {e.amount != null && (
                    <span className="font-display font-semibold tabular-nums shrink-0 text-foreground">
                      {formatMoney(e.amount, e.currency)}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <TransactionDialog
        key={editing?.id ?? `add-${dateKey}-${addType}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={editing?.type ?? addType}
        initial={editing}
        defaultDate={seededDate}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteId) {
                  await del.mutateAsync(deleteId);
                  setDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
