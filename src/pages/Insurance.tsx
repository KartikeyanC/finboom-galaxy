import { useMemo, useState } from "react";
import { Plus, Paperclip, ShieldCheck, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CATEGORY_META,
  daysUntil,
  useInsurance,
  type InsuranceCategory,
  type InsurancePolicy,
} from "@/lib/insuranceStore";
import { formatMoney } from "@/lib/finance";

const CATEGORY_ORDER: InsuranceCategory[] = ["health", "life", "vehicle", "gadget", "other"];

function CountdownRing({ days }: { days: number }) {
  const overdue = days < 0;
  const urgent = days >= 0 && days < 15;
  const max = 90;
  const clamped = Math.max(0, Math.min(max, days));
  const pct = (clamped / max) * 100;
  const tone = overdue
    ? "text-destructive"
    : urgent
      ? "text-amber-500"
      : "text-emerald-500";
  const trackTone = overdue
    ? "stroke-destructive/20"
    : urgent
      ? "stroke-amber-500/20"
      : "stroke-emerald-500/20";
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
        <circle cx="28" cy="28" r={r} className={cn("fill-none stroke-[4]", trackTone)} />
        <circle
          cx="28"
          cy="28"
          r={r}
          className={cn("fill-none stroke-[4] transition-all", tone.replace("text-", "stroke-"))}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className={cn("absolute inset-0 flex flex-col items-center justify-center", tone)}>
        <span className="text-sm font-bold leading-none">{overdue ? "!" : days}</span>
        <span className="text-[8px] uppercase tracking-wider opacity-70">{overdue ? "due" : "days"}</span>
      </div>
    </div>
  );
}

function AddPolicyDialog({ onAdd }: { onAdd: (p: Omit<InsurancePolicy, "id" | "createdAt">) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<InsurancePolicy, "id" | "createdAt">>({
    category: "health",
    provider: "",
    policyNumber: "",
    sumInsured: 0,
    premium: 0,
    dueDate: new Date().toISOString().slice(0, 10),
    documentName: "",
    notes: "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Policy
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Insurance Policy</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as InsuranceCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_META[c].emoji} {CATEGORY_META[c].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Input value={form.provider} placeholder="e.g. Star Health" onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Policy Number</Label>
            <Input value={form.policyNumber} onChange={(e) => setForm({ ...form, policyNumber: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sum Insured (₹)</Label>
              <Input type="number" value={form.sumInsured || ""} onChange={(e) => setForm({ ...form, sumInsured: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Premium (₹)</Label>
              <Input type="number" value={form.premium || ""} onChange={(e) => setForm({ ...form, premium: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Document name (optional)</Label>
            <Input value={form.documentName} placeholder="policy.pdf" onChange={(e) => setForm({ ...form, documentName: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!form.provider || !form.policyNumber}
            onClick={() => { onAdd(form); setOpen(false); }}
          >
            Save Policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Insurance = () => {
  const { items, add, remove } = useInsurance();

  const grouped = useMemo(() => {
    const g: Record<InsuranceCategory, InsurancePolicy[]> = {
      health: [], life: [], vehicle: [], gadget: [], other: [],
    };
    items.forEach((p) => g[p.category].push(p));
    return g;
  }, [items]);

  const overdueCount = items.filter((p) => daysUntil(p.dueDate) < 0).length;
  const urgentCount = items.filter((p) => { const d = daysUntil(p.dueDate); return d >= 0 && d < 15; }).length;

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Insurance</span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-1">Insurance Center</h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Track every active policy, renewal countdowns, and document vault links in one secure dashboard.
          </p>
        </div>
        <AddPolicyDialog onAdd={add} />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Active Policies</div>
          <div className="text-2xl font-display font-bold mt-1 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-500" />{items.length}</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">Renewing in 15 days</div>
          <div className="text-2xl font-display font-bold mt-1">{urgentCount}</div>
        </div>
        <div className={cn("rounded-xl border p-4", overdueCount > 0 ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card")}>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Overdue</div>
          <div className="text-2xl font-display font-bold mt-1 flex items-center gap-2">
            {overdueCount > 0 && <AlertTriangle className="w-5 h-5 text-destructive" />}
            {overdueCount}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState onAdd={() => {}} />
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.filter((c) => grouped[c].length > 0).map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", meta.tone)}>
                    <span>{meta.emoji}</span>{meta.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{grouped[cat].length} active</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {grouped[cat].map((p) => {
                    const d = daysUntil(p.dueDate);
                    const overdue = d < 0;
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "relative rounded-xl border bg-card p-5 transition-all",
                          overdue ? "border-destructive/50 animate-pulse-slow" : d < 15 ? "border-amber-500/40" : "border-border/60",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground truncate">{p.provider}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{p.policyNumber}</div>
                          </div>
                          <CountdownRing days={d} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sum Insured</div>
                            <div className="text-sm font-semibold mt-0.5">{formatMoney(p.sumInsured)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Premium</div>
                            <div className="text-sm font-semibold mt-0.5">{formatMoney(p.premium)}</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Premium Due</div>
                            <div className="text-sm font-semibold mt-0.5">{new Date(p.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                          </div>
                        </div>
                        {overdue && (
                          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5" /> Action Required: Renew Premium
                          </div>
                        )}
                        <div className="mt-4 flex items-center justify-between">
                          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
                            <Paperclip className="w-3.5 h-3.5" />
                            {p.documentName ? "View Policy Doc" : "Attach Doc"}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(p.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <ShieldCheck className="w-8 h-8 text-primary" />
      </div>
      <h3 className="font-display text-xl font-semibold">No policies yet</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
        Add your health, life and vehicle insurance to never miss a renewal.
      </p>
      <Button onClick={onAdd} className="mt-5 gap-1.5"><Plus className="w-4 h-4" /> Add Your First Policy</Button>
    </div>
  );
}

export default Insurance;