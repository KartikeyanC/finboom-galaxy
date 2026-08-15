import { useEffect, useMemo, useRef, useState } from "react";
import { useTenantSetting } from "@/hooks/useTenantSetting";
import { TENANT_SETTINGS, type BudgetPlannerState } from "@/lib/tenantSettings";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { RotateCcw, Wand2, PieChart } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";

type AllocationKey = "needs" | "wants" | "savings";

type AllocatorState = BudgetPlannerState;

const DEFAULTS: AllocatorState = TENANT_SETTINGS.budget_planner.defaultValue;

const BUCKET_META: Record<AllocationKey, { label: string; subtitle: string; tone: string; bar: string }> = {
  needs: { label: "Needs", subtitle: "Essentials & must-pays", tone: "border-sky-500/30 bg-sky-500/[0.06]", bar: "bg-sky-500" },
  wants: { label: "Wants", subtitle: "Lifestyle & freedom", tone: "border-fuchsia-500/30 bg-fuchsia-500/[0.06]", bar: "bg-fuchsia-500" },
  savings: { label: "Savings & Goals", subtitle: "Future wealth", tone: "border-emerald-500/30 bg-emerald-500/[0.06]", bar: "bg-emerald-500" },
};

const NEON: Record<AllocationKey, { range: string; thumb: string; text: string }> = {
  needs: { range: "bg-sky-500 shadow-[0_0_12px_hsl(199_89%_55%/0.7)]", thumb: "border-sky-400 shadow-[0_0_14px_hsl(199_89%_55%/0.9)]", text: "text-sky-500" },
  wants: { range: "bg-fuchsia-500 shadow-[0_0_12px_hsl(292_84%_61%/0.7)]", thumb: "border-fuchsia-400 shadow-[0_0_14px_hsl(292_84%_61%/0.9)]", text: "text-fuchsia-500" },
  savings: { range: "bg-emerald-500 shadow-[0_0_12px_hsl(160_84%_45%/0.7)]", thumb: "border-emerald-400 shadow-[0_0_14px_hsl(160_84%_45%/0.9)]", text: "text-emerald-500" },
};

function NeonSlider({ value, onChange, tone }: { value: number; onChange: (v: number) => void; tone: AllocationKey }) {
  const n = NEON[tone];
  return (
    <SliderPrimitive.Root
      value={[value]}
      max={100}
      step={1}
      onValueChange={([v]) => onChange(v)}
      className="relative flex w-full touch-none select-none items-center mt-4"
    >
      <SliderPrimitive.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className={cn("absolute h-full rounded-full transition-all", n.range)} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          "block h-5 w-5 rounded-full border-2 bg-background ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          n.thumb,
        )}
      />
    </SliderPrimitive.Root>
  );
}

/**
 * 50/30/20 target planner. Unlike the old version, income + spending are pulled
 * from REAL transactions (current month); the split is a what-if plan persisted
 * locally.
 */
export default function BudgetPlanner() {
  const { data: income = [] } = useTransactions("income");
  const { data: expenses = [] } = useTransactions("expense");

  const monthKey = new Date().toISOString().slice(0, 7);
  const inMonth = (iso: string) => (iso ?? "").slice(0, 7) === monthKey;

  const realIncome = useMemo(
    () => income.filter((t) => inMonth(t.occurred_at)).reduce((s, t) => s + Number(t.amount), 0),
    [income, monthKey],
  );
  const realSpent = useMemo(
    () => expenses.filter((t) => inMonth(t.occurred_at)).reduce((s, t) => s + Number(t.amount), 0),
    [expenses, monthKey],
  );
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    expenses.filter((t) => inMonth(t.occurred_at)).forEach((t) => {
      m[t.category] = (m[t.category] ?? 0) + Number(t.amount);
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [expenses, monthKey]);

  // Stage 3.1: the plan is workspace data now, not a browser artefact.
  const { value: savedPlan, setValue: persistPlan, loading: planLoading } =
    useTenantSetting("budget_planner");
  const [state, setState] = useState<AllocatorState>(DEFAULTS);
  const adopted = useRef(false);

  // Take the workspace's saved plan once it arrives, then let local state lead —
  // re-adopting on every render would fight the user mid-drag.
  useEffect(() => {
    if (planLoading || adopted.current) return;
    adopted.current = true;
    setState(savedPlan);
  }, [planLoading, savedPlan]);

  // The sliders fire continuously, so the old "write on every change" would be a
  // request per frame. Debounce, and skip entirely when local already matches
  // the server (which is the case immediately after adopting).
  useEffect(() => {
    if (planLoading || !adopted.current) return;
    if (JSON.stringify(state) === JSON.stringify(savedPlan)) return;
    const t = setTimeout(() => persistPlan(state), 700);
    return () => clearTimeout(t);
  }, [state, savedPlan, planLoading, persistPlan]);

  // Seed the planning income from real income once, if user hasn't set one.
  useEffect(() => {
    if (state.income === 0 && realIncome > 0) {
      setState((s) => ({ ...s, income: realIncome }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realIncome]);

  const adjust = (key: AllocationKey, raw: number) => {
    const value = Math.max(0, Math.min(100, Math.round(raw)));
    const others = (["needs", "wants", "savings"] as AllocationKey[]).filter((k) => k !== key);
    const remaining = 100 - value;
    const currentOther = others.reduce((s, k) => s + state[k], 0);
    const next: AllocatorState = { ...state, [key]: value };
    if (currentOther === 0) {
      const half = Math.floor(remaining / 2);
      next[others[0]] = half;
      next[others[1]] = remaining - half;
    } else {
      const a = Math.round((state[others[0]] / currentOther) * remaining);
      next[others[0]] = Math.max(0, Math.min(remaining, a));
      next[others[1]] = remaining - next[others[0]];
    }
    setState(next);
  };

  const bucketAmounts: Record<AllocationKey, number> = useMemo(
    () => ({
      needs: Math.round((state.income * state.needs) / 100),
      wants: Math.round((state.income * state.wants) / 100),
      savings: Math.round((state.income * state.savings) / 100),
    }),
    [state],
  );

  const total = state.needs + state.wants + state.savings;
  const spentPct = state.income > 0 ? Math.round((realSpent / state.income) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Planning Income (monthly)</Label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-display font-bold text-foreground">₹</span>
              <MoneyInput
                className="h-12 w-44 text-2xl font-display font-bold border-0 bg-muted/40 focus-visible:ring-1"
                value={state.income}
                onValueChange={(n) => setState({ ...state, income: Math.max(0, n ?? 0) })}
              />
              {realIncome > 0 && realIncome !== state.income && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setState({ ...state, income: realIncome })}>
                  <Wand2 className="w-4 h-4" /> Use actual {formatMoney(realIncome)}
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn("rounded-lg border px-3 py-2 text-xs font-medium", total === 100 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-destructive/40 bg-destructive/10 text-destructive")}>
              Total: {total}%
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setState({ ...DEFAULTS, income: state.income })}>
              <RotateCcw className="w-4 h-4" /> 50/30/20
            </Button>
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
                    <div className="text-xs text-muted-foreground">{meta.subtitle}</div>
                  </div>
                  <div className={cn("text-2xl font-display font-bold tabular-nums", NEON[k].text)}>
                    {state[k]}<span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
                <NeonSlider value={state[k]} onChange={(v) => adjust(k, v)} tone={k} />
                <div className="text-xs text-muted-foreground mt-3 flex items-center justify-between">
                  <span>Target</span>
                  <span className="font-semibold text-foreground">{formatMoney(bucketAmounts[k])}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Real spending vs plan */}
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">This month spent (actual)</span>
            <span className="font-semibold">
              {formatMoney(realSpent)} <span className="text-muted-foreground">of {formatMoney(state.income)} ({spentPct}%)</span>
            </span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", spentPct > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, spentPct)}%` }} />
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Where it went this month</h2>
        </div>
        {byCategory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            No expenses logged this month yet.
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60">
            {byCategory.map(([cat, amt]) => {
              const pct = realSpent > 0 ? Math.round((amt / realSpent) * 100) : 0;
              return (
                <div key={cat} className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-sm font-semibold text-foreground truncate">{cat}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{formatMoney(amt)}</span> · {pct}%
                    </span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
