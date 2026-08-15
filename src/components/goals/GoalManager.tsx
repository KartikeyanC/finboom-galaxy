import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Plus, Trash2, PiggyBank } from "lucide-react";
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
import { CURRENCIES, GOAL_CATEGORIES, formatCompact } from "@/lib/finance";
import { cn } from "@/lib/utils";
import {
  useContributeToGoal,
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useUpdateGoal,
  type Goal,
} from "@/hooks/useGoals";
import { CategoryChart, ChartViewToggle, useChartView, type ChartSlice } from "@/components/ui/category-chart";
import { toast } from "sonner";

const schema = z.object({
  title: z.string().trim().min(1, "Title required").max(120),
  category: z.string().min(1),
  target_amount: z.number().positive().max(1e12),
  current_amount: z.number().nonnegative().max(1e12),
  currency: z.string().min(1),
  target_date: z.string().optional(),
  status: z.string().min(1),
}).refine((v) => v.current_amount <= v.target_amount, {
  // Same ceiling `goal_contribute` enforces; without it this form would be the
  // one way to push a goal past its own target.
  message: "Saved so far cannot exceed the target",
  path: ["current_amount"],
});

function GoalDialog({
  open, onOpenChange, initial,
}: { open: boolean; onOpenChange: (v: boolean) => void; initial: Goal | null }) {
  const create = useCreateGoal();
  const update = useUpdateGoal();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(GOAL_CATEGORIES[0]);
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("0");
  const [currency, setCurrency] = useState("INR");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState("active");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setTitle(initial.title);
      setCategory(initial.category ?? GOAL_CATEGORIES[0]);
      setTarget(String(initial.target_amount));
      setCurrent(String(initial.current_amount));
      setCurrency(initial.currency);
      setTargetDate(initial.target_date ?? "");
      setStatus(initial.status);
    } else {
      setTitle(""); setCategory(GOAL_CATEGORIES[0]); setTarget(""); setCurrent("0");
      setCurrency("INR"); setTargetDate(""); setStatus("active");
    }
  }, [open, initial]);

  const submit = async () => {
    const parsed = schema.safeParse({
      title, category,
      target_amount: Number(target),
      current_amount: Number(current),
      currency,
      target_date: targetDate || undefined,
      status,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const payload = {
      title: parsed.data.title,
      category: parsed.data.category,
      target_amount: parsed.data.target_amount,
      current_amount: parsed.data.current_amount,
      currency: parsed.data.currency,
      target_date: parsed.data.target_date ?? null,
      status: parsed.data.status,
    };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, ...payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch {/* */}
  };

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display">
            {initial ? "Edit goal" : "Add goal"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} maxLength={120}
              placeholder="e.g. Emergency Fund"
              onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Target amount</Label>
              <MoneyInput value={target} onValueChange={(n) => setTarget(n === undefined ? "" : String(n))} />
            </div>
            <div className="space-y-1.5">
              <Label>Saved so far</Label>
              <MoneyInput value={current} onValueChange={(n) => setCurrent(n === undefined ? "" : String(n))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DatePickerField
              label="Target date"
              value={targetDate}
              onChange={setTargetDate}
              presets="future"
              placeholder="Set target date"
            />
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
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

function ContributeDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const contribute = useContributeToGoal();
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (goal) setAmount("");
  }, [goal]);

  const amt = Number(amount);
  const remaining = goal ? Math.max(0, Number(goal.target_amount) - Number(goal.current_amount)) : 0;
  const willCap = !!goal && amt > remaining && remaining >= 0;

  const submit = async () => {
    if (!goal) return;
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      // The server decides how much actually lands: it locks the row, so a
      // simultaneous contribution from another tab or member cannot be lost.
      await contribute.mutateAsync({ goalId: goal.id, amount: amt });
      onClose();
    } catch {
      /* error toast handled in hook */
    }
  };

  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="font-display">Add funds{goal ? ` · ${goal.title}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {goal && (
            <p className="text-xs text-muted-foreground">
              Currently {formatCompact(Number(goal.current_amount), goal.currency)} of{" "}
              {formatCompact(Number(goal.target_amount), goal.currency)} ·{" "}
              {formatCompact(remaining, goal.currency)} to go.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Amount to add</Label>
            <MoneyInput
              autoFocus
              value={amount}
              placeholder="0"
              onValueChange={(n) => setAmount(n === undefined ? "" : String(n))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          {willCap && goal && (
            <p className="text-xs text-amber-400">
              Only {formatCompact(remaining, goal.currency)} is needed to finish this goal — that is
              all we will add.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={contribute.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={contribute.isPending}>
            {contribute.isPending ? "Adding..." : "Add funds"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GoalManager() {
  const { data, isLoading } = useGoals();
  const del = useDeleteGoal();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [funding, setFunding] = useState<Goal | null>(null);
  const [view, setView] = useChartView();
  const goalSlices: ChartSlice[] = (data ?? []).map((g) => ({ name: g.title, value: Number(g.current_amount) }));

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Goals ({data?.length ?? 0})
        </h2>
        <div className="flex items-center gap-2">
          {data && data.length > 0 && <ChartViewToggle view={view} onChange={setView} />}
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add goal
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm py-6 text-center">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-muted-foreground text-sm py-6 text-center">
          No goals yet. Set your first financial milestone.
        </p>
      ) : view !== "list" ? (
        <CategoryChart data={goalSlices} view={view} centerLabel="Saved" emptyText="No funded goals to chart yet." />
      ) : (
        <div className="flex flex-col gap-4">
          {data.map((g, i) => {
            const pct = g.target_amount > 0
              ? Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100))
              : 0;
            return (
              <div key={g.id} className="space-y-2 p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{g.title}</span>
                      <span className={cn(
                        "text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold",
                        g.status === "active"    && "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
                        g.status === "paused"    && "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
                        g.status === "completed" && "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30",
                      )}>
                        {g.status}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {g.category ?? "—"} {g.target_date ? `· by ${new Date(g.target_date).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-emerald-500 hover:text-emerald-500"
                      onClick={() => setFunding(g)}>
                      <PiggyBank className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-xs">Add funds</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => { setEditing(g); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-coral hover:text-coral"
                      onClick={() => setDeleteId(g.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: i * 0.05 }}
                    className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {formatCompact(Number(g.current_amount), g.currency)} / {formatCompact(Number(g.target_amount), g.currency)}
                  </span>
                  <span className="font-display font-semibold text-primary">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <GoalDialog open={open} onOpenChange={setOpen} initial={editing} />

      <ContributeDialog goal={funding} onClose={() => setFunding(null)} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete goal?</AlertDialogTitle>
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