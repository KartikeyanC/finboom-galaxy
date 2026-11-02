import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Clock, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { debtSummary, useDebts, type DebtRecord } from "@/lib/debtsStore";
import { useReminders } from "@/lib/remindersStore";
import { BulkDeleteBar, SelectAllBox, SelectBox } from "@/components/bulk/BulkSelect";
import { useBulkSelection, type BulkSelection } from "@/components/bulk/useBulkSelection";

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(n);
  } catch { return `${currency} ${n.toFixed(0)}`; }
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="-rotate-90">
      <circle cx={28} cy={28} r={r} stroke="hsl(var(--muted))" strokeWidth={4} fill="none" />
      <circle
        cx={28} cy={28} r={r}
        stroke="hsl(var(--primary))" strokeWidth={4} strokeLinecap="round"
        fill="none" strokeDasharray={`${dash} ${c}`}
        className="transition-[stroke-dasharray] duration-500"
      />
      <text x="28" y="32" textAnchor="middle"
        className="rotate-90 origin-center fill-foreground font-display text-xs font-semibold"
        transform="rotate(90 28 28)">
        {pct}%
      </text>
    </svg>
  );
}

function DebtCard({
  debt,
  sel,
  onDelete,
}: {
  debt: DebtRecord;
  sel: BulkSelection;
  onDelete: () => void;
}) {
  const s = debtSummary(debt);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={cn(
        "rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3",
        sel.isSelected(debt.id) && "border-primary/40 bg-primary/[0.06]",
      )}
      data-state={sel.isSelected(debt.id) ? "selected" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <SelectBox sel={sel} id={debt.id} name={debt.lender} />
          <ProgressRing pct={s.pct} />
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{debt.lender}</div>
            <div className="text-xs text-muted-foreground">
              {fmt(debt.totalAmount, debt.currency)} · {debt.duration}-month EMI
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {s.pct}% paid · {s.remainingCount} {s.remainingCount === 1 ? "month" : "months"} remaining ·{" "}
              <span className="text-foreground font-medium">{fmt(s.remaining, debt.currency)}</span> outstanding
            </div>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Delete debt">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {debt.lender}?</AlertDialogTitle>
              <AlertDialogDescription>
                Deletes the debt plus all linked upcoming installment reminders. Already-paid
                installments stay in your expense ledger.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {debt.installments.map((i) => {
          const paid = i.status === "paid";
          return (
            <div
              key={i.month}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs",
                paid
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-border/50 bg-background/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Month {i.month}</span>
                {paid ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="mt-1 font-medium text-foreground">{fmt(i.amount, debt.currency)}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(i.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                {" · "}
                <span className={paid ? "text-emerald-500" : "text-muted-foreground"}>
                  {paid ? "Paid" : "Pending"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

export default function DebtLedger() {
  const debts = useDebts();
  const reminders = useReminders();
  const visibleIds = useMemo(() => debts.records.map((d) => d.id), [debts.records]);
  const sel = useBulkSelection(visibleIds);

  if (debts.records.length === 0) return null;

  const handleDelete = (debtId: string) => {
    // Cascade: purge linked unpaid reminders
    reminders.records
      .filter((r) => r.source === "debt" && r.sourceId === debtId && r.status !== "completed")
      .forEach((r) => reminders.remove(r.id));
    debts.remove(debtId);
  };

  // Same cascade as one delete, in two batch calls: the ticked debts' open
  // reminders first (so none is left pointing at a deleted debt), then the debts.
  const handleDeleteMany = async (ids: string[]) => {
    const picked = new Set(ids);
    const reminderIds = reminders.records
      .filter((r) => r.source === "debt" && !!r.sourceId && picked.has(r.sourceId) && r.status !== "completed")
      .map((r) => r.id);
    await reminders.removeMany(reminderIds);
    await debts.removeMany(ids);
  };

  return (
    <section className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-primary" />
        <h2 className="font-display text-base font-semibold text-foreground">
          Active Debt &amp; Installments
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {debts.records.length} active {debts.records.length === 1 ? "plan" : "plans"}
        </span>
      </div>
      <div className="flex items-center gap-2 px-4 text-xs text-muted-foreground">
        <SelectAllBox sel={sel} />
        <span>{sel.all ? "Clear all" : "Select all"}</span>
      </div>
      <BulkDeleteBar
        sel={sel}
        noun={["debt", "debts"]}
        description="Their upcoming installment reminders go too; already-paid installments stay in your expense ledger."
        onDelete={handleDeleteMany}
      />
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {debts.records.map((d) => (
            <DebtCard key={d.id} debt={d} sel={sel} onDelete={() => handleDelete(d.id)} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
