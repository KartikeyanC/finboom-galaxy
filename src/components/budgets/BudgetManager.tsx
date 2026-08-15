import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BUDGET_BUCKETS, formatMoney } from "@/lib/finance";
import {
  useDeleteBudget,
  useSetBudgetAllocation,
  type Budget,
} from "@/hooks/useBudgets";
import { useBudgetSpend } from "@/hooks/useBudgetSpend";
import { isNonExpenseBucket, categoriesForBucket } from "@/lib/budgetBuckets";
import { toast } from "sonner";

// `spent` is deliberately absent: it is derived from transactions, never typed.
const schema = z.object({
  bucket: z.string().min(1),
  allocated: z.number().nonnegative().max(1e12),
  period_start: z.string().min(1),
});

function BudgetDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Budget | null;
}) {
  // One RPC covers both add and edit — it upserts on (workspace, bucket,
  // period), so the same bucket can never end up allocated twice.
  const save = useSetBudgetAllocation();
  const [bucket, setBucket] = useState<string>(BUDGET_BUCKETS[0]);
  const [allocated, setAllocated] = useState("0");
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setBucket(initial.bucket);
      setAllocated(String(initial.allocated));
      setPeriodStart(initial.period_start);
    } else {
      setBucket(BUDGET_BUCKETS[0]);
      setAllocated("0");
      const d = new Date();
      setPeriodStart(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
    }
  }, [open, initial]);

  const submit = async () => {
    const parsed = schema.safeParse({
      bucket,
      allocated: Number(allocated),
      period_start: periodStart,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      await save.mutateAsync({
        bucket: parsed.data.bucket,
        allocated: parsed.data.allocated,
        period_start: parsed.data.period_start,
        period: initial?.period ?? "monthly",
      });
      onOpenChange(false);
    } catch {/* hook toasts */}
  };

  const busy = save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display">
            {initial ? "Edit budget" : "Add budget"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Bucket</Label>
            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUDGET_BUCKETS.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Allocated</Label>
            <MoneyInput value={allocated} onValueChange={(n) => setAllocated(n === undefined ? "" : String(n))} />
            <p className="text-xs text-muted-foreground">
              {isNonExpenseBucket(bucket)
                ? "This jar is for money set aside, so no expense categories feed it — spend stays ₹0."
                : `Spend is measured from your ${categoriesForBucket(bucket).join(", ") || "expense"} transactions in this period.`}
            </p>
          </div>
          <DatePickerField
            label="Period start"
            value={periodStart}
            onChange={setPeriodStart}
            presets="any"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : initial ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BudgetManager() {
  // Rows carry `derivedSpent`, computed from transactions rather than stored.
  const { data, isLoading } = useBudgetSpend();
  const del = useDeleteBudget();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Budgets ({data?.length ?? 0})
        </h2>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add budget
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead className="text-right">Spent</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !data || data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No budgets yet.</TableCell></TableRow>
            ) : data.map((b) => {
              const remaining = b.remaining;
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.bucket}</TableCell>
                  <TableCell className="font-mono text-xs">{b.period_start}</TableCell>
                  <TableCell className="text-right font-display">{formatMoney(Number(b.allocated))}</TableCell>
                  <TableCell className="text-right font-display">{formatMoney(b.derivedSpent)}</TableCell>
                  <TableCell className={`text-right font-display ${remaining < 0 ? "text-coral" : "text-success"}`}>
                    {formatMoney(remaining)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* BUG-097 — see TransactionsTable: an icon is not a name. */}
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        aria-label={`Edit the ${b.bucket} budget`}
                        onClick={() => { setEditing(b); setOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-coral hover:text-coral"
                        aria-label={`Delete the ${b.bucket} budget`}
                        onClick={() => setDeleteId(b.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <BudgetDialog open={open} onOpenChange={setOpen} initial={editing} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete budget?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (deleteId) { await del.mutateAsync(deleteId); setDeleteId(null); }
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}