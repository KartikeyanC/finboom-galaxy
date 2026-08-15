import { useMemo, useState } from "react";
import { Plus, Trash2, Repeat, TrendingDown, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  annualEquivalent, monthlyEquivalent, useSubscriptions, type BillingFrequency, type SubscriptionRecord,
} from "@/lib/subscriptionsStore";
import { formatMoney } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { resolveBrand } from "@/lib/subscriptionBrands";

function freqMeta(f: BillingFrequency) {
  if (f === "monthly") return { label: "Monthly", tone: "bg-sky-500/10 text-sky-500 border-sky-500/20" };
  if (f === "annual") return { label: "Annual", tone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };
  return { label: "Weekly", tone: "bg-amber-500/10 text-amber-500 border-amber-500/20" };
}

function daysUntil(iso: string) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

function AddDialog({ onAdd }: { onAdd: (s: Omit<SubscriptionRecord, "id" | "createdAt">) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<SubscriptionRecord, "id" | "createdAt">>({
    name: "", icon: "💳", amount: 0, currency: "INR", frequency: "monthly", renewalDate: new Date().toISOString().slice(0, 10), status: "active",
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add Subscription</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Subscription</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div className="space-y-1.5"><Label>Icon</Label><Input value={form.icon} maxLength={2} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Service Name</Label><Input value={form.name} placeholder="Netflix" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Amount (₹)</Label><MoneyInput value={form.amount || ""} onValueChange={(n) => setForm({ ...form, amount: n ?? 0 })} /></div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as BillingFrequency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DatePickerField
            label="Next Renewal Date"
            value={form.renewalDate}
            onChange={(v) => setForm({ ...form, renewalDate: v })}
            presets="future"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!form.name || form.amount <= 0} onClick={() => { onAdd(form); setOpen(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubscriptionRow({
  s, d, meta, urgent, overdue, cancelled, onToggle, onRemove,
}: {
  s: SubscriptionRecord;
  d: number;
  meta: { label: string; tone: string };
  urgent: boolean;
  overdue: boolean;
  cancelled: boolean;
  onToggle: (v: boolean) => void;
  onRemove: () => void;
}) {
  const brand = resolveBrand(s.name);
  const { Icon } = brand;
  return (
    <div className={cn("group relative p-4 sm:p-5 flex flex-wrap items-center gap-4 transition-all hover:bg-muted/30", cancelled && "opacity-60")}>
      <div className={cn("relative w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br ring-1 transition-transform group-hover:scale-105", brand.gradient, brand.ring)}>
        <Icon className={cn("w-5 h-5", brand.iconClass)} strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-[160px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{s.name}</span>
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", meta.tone)}>{meta.label}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Renews {new Date(s.renewalDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ·{" "}
          <span className={cn(overdue ? "text-destructive font-medium" : urgent ? "text-amber-500 font-medium" : "")}>
            {overdue ? `${Math.abs(d)}d overdue` : d === 0 ? "today" : `in ${d}d`}
          </span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-display font-bold tabular-nums">{formatMoney(s.amount)}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">/{s.frequency === "annual" ? "yr" : s.frequency === "weekly" ? "wk" : "mo"}</div>
      </div>
      <div className="flex items-center gap-3 pl-2 border-l border-border/60">
        <div className="flex flex-col items-center gap-0.5">
          <Switch checked={s.status === "active"} onCheckedChange={onToggle} />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.status === "active" ? "Active" : "Cancel"}</span>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Embeddable subscriptions tracker (finance feature). Lives inside Expenses. */
export default function SubscriptionsPanel() {
  const { items, add, update, remove } = useSubscriptions();
  const sorted = useMemo(() => [...items].sort((a, b) => +new Date(a.renewalDate) - +new Date(b.renewalDate)), [items]);
  const active = items.filter((i) => i.status === "active");
  const monthlyTotal = active.reduce((s, i) => s + monthlyEquivalent(i), 0);
  const annualTotal = active.reduce((s, i) => s + annualEquivalent(i), 0);
  const cancelCount = items.filter((i) => i.status === "cancel").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <Repeat className="w-5 h-5 text-primary" /> Subscriptions
        </h2>
        <AddDialog onAdd={add} />
      </div>

      <div className="rounded-2xl border border-border/60 bg-gradient-to-r from-primary/10 via-card to-chart-2/5 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> Monthly Burn</div>
            <div className="text-3xl font-display font-bold mt-1 tabular-nums">{formatMoney(monthlyTotal)}</div>
            <div className="text-xs text-muted-foreground mt-1">{active.length} active services</div>
          </div>
          <div className="sm:border-l sm:pl-6 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5" /> Projected Annual</div>
            <div className="text-3xl font-display font-bold mt-1 tabular-nums">{formatMoney(annualTotal)}</div>
            <div className="text-xs text-muted-foreground mt-1">If nothing changes</div>
          </div>
          <div className="sm:border-l sm:pl-6 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Marked for Cancel</div>
            <div className="text-3xl font-display font-bold mt-1 tabular-nums">{cancelCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Pending review</div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Repeat className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-display text-lg font-semibold">No subscriptions tracked yet</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">Add streaming, SaaS and memberships to see where money quietly disappears.</p>
          <div className="mt-4 inline-block"><AddDialog onAdd={add} /></div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60">
          {sorted.map((s) => {
            const d = daysUntil(s.renewalDate);
            const meta = freqMeta(s.frequency);
            return (
              <SubscriptionRow
                key={s.id}
                s={s}
                d={d}
                meta={meta}
                urgent={d >= 0 && d <= 7}
                overdue={d < 0}
                cancelled={s.status === "cancel"}
                onToggle={(v) => update(s.id, { status: v ? "active" : "cancel" })}
                onRemove={() => remove(s.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
