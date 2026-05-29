import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock, CheckCircle2, Pencil, Plus, Trash2, Bell, ChevronDown, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  CONTEXT_LABEL, defaultMessage, priorityBucket, useReminders,
  type ReminderRecord,
} from "@/lib/remindersStore";
import { ReminderEditorDialog } from "./ReminderEditorDialog";
import { useDebts } from "@/lib/debtsStore";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { toast } from "sonner";

const TONE_STYLES = {
  danger: "border-destructive/60 text-destructive bg-destructive/10",
  warn: "border-amber-500/50 text-amber-500 bg-amber-500/10",
  safe: "border-emerald-500/40 text-emerald-500 bg-emerald-500/10",
} as const;

function formatAmount(amount?: number, currency?: string) {
  if (amount == null) return "";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return amount.toLocaleString();
  }
}

export function RemindersControlCenter() {
  const { records, upsert, remove, complete } = useReminders();
  const debts = useDebts();
  const createTxn = useCreateTransaction();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<ReminderRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const confirmDebtPayment = async (r: ReminderRecord) => {
    if (!r.debt) return;
    try {
      const txn = await createTxn.mutateAsync({
        type: "expense",
        amount: r.amount ?? 0,
        currency: r.currency ?? "INR",
        category: "Debt Repayment",
        description: `${r.debt.lender} · EMI ${r.debt.month}/${r.debt.totalMonths}`,
        occurred_at: new Date().toISOString(),
      });
      debts.markPaid(r.debt.debtId, r.debt.month, txn?.id);
      complete(r.id);
      toast.success(`Month ${r.debt.month} marked as paid`);
    } catch {
      /* createTxn handles its own toast */
    }
  };

  const sorted = useMemo(() => {
    return [...records].sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (b.status === "completed" && a.status !== "completed") return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [records]);

  const activeCount = records.filter((r) => r.status !== "completed").length;

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-display text-base font-semibold text-foreground">
              Upcoming Schedules &amp; Reminders
            </div>
            <div className="text-xs text-muted-foreground">
              {activeCount} active {activeCount === 1 ? "alert" : "alerts"} in your timeline
            </div>
          </div>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/40"
          >
            <div className="px-5 py-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Sorted chronologically. Items roll forward automatically when due dates pass.
              </p>
              <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> New reminder
              </Button>
            </div>

            {sorted.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No reminders yet — add your first one to start tracking.
              </div>
            ) : (
              <ul className="divide-y divide-border/30">
                <AnimatePresence initial={false}>
                  {sorted.map((r) => {
                    const bucket = priorityBucket(r.date);
                    const isDone = r.status === "completed";
                    return (
                      <motion.li
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className={cn(
                          "px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-accent/20 transition-colors",
                          isDone && "opacity-60",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("font-medium text-foreground truncate", isDone && "line-through")}>
                              {r.title}
                            </span>
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide",
                              isDone
                                ? "border-border text-muted-foreground bg-muted/40"
                                : TONE_STYLES[bucket.tone],
                            )}>
                              {isDone ? "Completed" : bucket.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-1">
                            <CalendarClock className="w-3 h-3" />
                            {new Date(r.date).toLocaleDateString(undefined, {
                              weekday: "short", day: "numeric", month: "short", year: "numeric",
                            })}
                            <span>·</span>
                            <span>{CONTEXT_LABEL[r.context]}</span>
                            {r.amount != null && (
                              <>
                                <span>·</span>
                                <span className="font-medium text-foreground">
                                  {formatAmount(r.amount, r.currency)}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-1">
                            {defaultMessage(r)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 self-end sm:self-center">
                          {r.debt && !isDone && (
                            <Button
                              size="sm"
                              className="h-8 px-2.5 text-xs gap-1"
                              onClick={() => confirmDebtPayment(r)}
                              disabled={createTxn.isPending}
                            >
                              <Wallet className="w-3.5 h-3.5" /> Confirm Monthly Payment
                            </Button>
                          )}
                          {!isDone && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-8 px-2 text-xs gap-1"
                              onClick={() => complete(r.id)}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Done
                            </Button>
                          )}
                          <Button
                            size="icon" variant="ghost" className="h-8 w-8"
                            aria-label="Edit reminder"
                            onClick={() => setEditing(r)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Delete reminder">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove {r.title}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This reminder will be deleted. You can always recreate it later.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(r.id)}>Remove</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ReminderEditorDialog
        open={creating || !!editing}
        record={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSave={(rec) => { upsert(rec); setCreating(false); setEditing(null); }}
      />
    </div>
  );
}
