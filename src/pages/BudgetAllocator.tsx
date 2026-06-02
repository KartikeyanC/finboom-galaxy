import { useEffect, useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { PieChart, RotateCcw, Save } from "lucide-react";

type AllocationKey = "needs" | "wants" | "savings";

const PARENT_CATEGORIES: { id: string; label: string; bucket: AllocationKey; weight: number; spent: number }[] = [
  { id: "food", label: "Food & Dining", bucket: "needs", weight: 0.22, spent: 9800 },
  { id: "housing", label: "Housing & Utilities", bucket: "needs", weight: 0.45, spent: 24500 },
  { id: "healthcare", label: "Healthcare", bucket: "needs", weight: 0.12, spent: 3200 },
  { id: "commute", label: "Travel & Commute", bucket: "needs", weight: 0.21, spent: 6400 },
  { id: "social", label: "Social & Entertainment", bucket: "wants", weight: 0.4, spent: 8200 },
  { id: "shopping", label: "Shopping & Lifestyle", bucket: "wants", weight: 0.35, spent: 11400 },
  { id: "travel", label: "Leisure Travel", bucket: "wants", weight: 0.25, spent: 2100 },
  { id: "investments", label: "Investments & SIPs", bucket: "savings", weight: 0.65, spent: 18000 },
  { id: "emergency", label: "Emergency Fund", bucket: "savings", weight: 0.25, spent: 5000 },
  { id: "goals", label: "Long-term Goals", bucket: "savings", weight: 0.1, spent: 2000 },
];

const STORE_KEY = "budgetAllocator.v1";

interface AllocatorState {
  income: number;
  needs: number;
  wants: number;
  savings: number;
}

const DEFAULTS: AllocatorState = { income: 120000, needs: 50, wants: 30, savings: 20 };

function load(): AllocatorState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return DEFAULTS;
}

const BUCKET_META: Record<AllocationKey, { label: string; subtitle: string; tone: string; bar: string }> = {
  needs: { label: "Needs", subtitle: "Essentials & must-pays", tone: "border-sky-500/30 bg-sky-500/5", bar: "bg-sky-500" },
  wants: { label: "Wants", subtitle: "Lifestyle & freedom", tone: "border-amber-500/30 bg-amber-500/5", bar: "bg-amber-500" },
  savings: { label: "Savings & Goals", subtitle: "Future wealth", tone: "border-emerald-500/30 bg-emerald-500/5", bar: "bg-emerald-500" },
};

const BudgetAllocator = () => {
  const [state, setState] = useState<AllocatorState>(() => load());

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }, [state]);

  // Adjusts other two sliders proportionally so total stays 100.
  const adjust = (key: AllocationKey, value: number) => {
    const others = (["needs", "wants", "savings"] as AllocationKey[]).filter((k) => k !== key);
    const remaining = Math.max(0, 100 - value);
    const currentOther = others.reduce((s, k) => s + state[k], 0);
    let next: AllocatorState = { ...state, [key]: value };
    if (currentOther === 0) {
      next[others[0]] = Math.round(remaining / 2);
      next[others[1]] = remaining - next[others[0]];
    } else {
      const a = Math.round((state[others[0]] / currentOther) * remaining);
      next[others[0]] = a;
      next[others[1]] = remaining - a;
    }
    setState(next);
  };

  const bucketAmounts: Record<AllocationKey, number> = useMemo(() => ({
    needs: Math.round((state.income * state.needs) / 100),
    wants: Math.round((state.income * state.wants) / 100),
    savings: Math.round((state.income * state.savings) / 100),
  }), [state]);

  const total = state.needs + state.wants + state.savings;

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Budget Allocator</span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-1">Target Budget Allocator</h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Drag sliders to balance the classic 50 / 30 / 20 split across Needs, Wants and Savings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setState(DEFAULTS)}>
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
        </div>
      </header>

      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Income</Label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-display font-bold text-foreground">₹</span>
              <Input
                type="number"
                className="h-12 w-44 text-2xl font-display font-bold border-0 bg-muted/40 focus-visible:ring-1"
                value={state.income}
                onChange={(e) => setState({ ...state, income: Math.max(0, Number(e.target.value)) })}
              />
            </div>
          </div>
          <div className={cn("rounded-lg border px-3 py-2 text-xs font-medium", total === 100 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-destructive/40 bg-destructive/10 text-destructive")}>
            Total: {total}%
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(["needs", "wants", "savings"] as AllocationKey[]).map((k) => {
            const meta = BUCKET_META[k];
            return (
              <div key={k} className={cn("rounded-xl border p-4", meta.tone)}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="font-display font-semibold">{meta.label}</div>
                    <div className="text-[11px] text-muted-foreground">{meta.subtitle}</div>
                  </div>
                  <div className="text-2xl font-display font-bold tabular-nums">{state[k]}<span className="text-sm text-muted-foreground">%</span></div>
                </div>
                <Slider value={[state[k]]} max={100} step={1} className="mt-4" onValueChange={([v]) => adjust(k, v)} />
                <div className="text-xs text-muted-foreground mt-3 flex items-center justify-between">
                  <span>Target</span>
                  <span className="font-semibold text-foreground">{formatMoney(bucketAmounts[k])}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Category Allocation</h2>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60">
          {PARENT_CATEGORIES.map((c) => {
            const bucketTotal = bucketAmounts[c.bucket];
            const target = Math.round(bucketTotal * c.weight);
            const pct = target > 0 ? Math.round((c.spent / target) * 100) : 0;
            const over = c.spent > target;
            const meta = BUCKET_META[c.bucket];
            return (
              <div key={c.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("inline-block w-1.5 h-6 rounded-full", meta.bar)} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{c.label}</div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{meta.label}</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Spent <span className={cn("font-semibold", over ? "text-destructive" : "text-foreground")}>{formatMoney(c.spent)}</span>
                    <span className="mx-1.5">/</span>
                    Target <span className="font-semibold text-foreground">{formatMoney(target)}</span>
                  </div>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : meta.bar)}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground mt-1.5">{pct}% used</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default BudgetAllocator;