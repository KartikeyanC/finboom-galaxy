import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useUpdateGoal,
  type Goal,
} from "@/hooks/useGoals";
import { toast } from "sonner";

const schema = z.object({
  title: z.string().trim().min(1, "Title required").max(120),
  category: z.string().min(1),
  target_amount: z.number().positive().max(1e12),
  current_amount: z.number().nonnegative().max(1e12),
  currency: z.string().min(1),
  target_date: z.string().optional(),
  status: z.string().min(1),
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
              <Input type="number" min="0" step="0.01"
                value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Saved so far</Label>
              <Input type="number" min="0" step="0.01"
                value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Target date</Label>
              <Input type="date" value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)} />
            </div>
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

export default function GoalManager() {
  const { data, isLoading } = useGoals();
  const del = useDeleteGoal();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Goals ({data?.length ?? 0})
        </h3>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add goal
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm py-6 text-center">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-muted-foreground text-sm py-6 text-center">
          No goals yet. Set your first financial milestone.
        </p>
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
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {g.status}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {g.category ?? "—"} {g.target_date ? `· by ${new Date(g.target_date).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
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