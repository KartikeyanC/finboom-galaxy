import { useMemo } from "react";
import { motion } from "framer-motion";
import { useBudgetSpend } from "@/hooks/useBudgetSpend";
import { formatCompact } from "@/lib/finance";
import { chartColor, useChartDark } from "@/lib/chartColors";
import { cn } from "@/lib/utils";

/** Utilization tone: green under budget, amber tight, red over. */
function utilTone(pct: number) {
  if (pct > 100) return { text: "text-rose-400", bar: "hsl(4, 74%, 58%)", chip: "bg-rose-500/15 text-rose-400" };
  if (pct >= 85) return { text: "text-amber-400", bar: "hsl(38, 82%, 55%)", chip: "bg-amber-500/15 text-amber-400" };
  return { text: "text-emerald-400", bar: "", chip: "bg-emerald-500/15 text-emerald-400" };
}

const BudgetAllocation = () => {
  // Spend is derived from real transactions, not the hand-typed `spent` column.
  const { data: budgets = [] } = useBudgetSpend();
  const dark = useChartDark();

  const { rows, totalAllocated, totalSpent, usedPct } = useMemo(() => {
    const alloc = new Map<string, number>();
    const spend = new Map<string, number>();
    budgets.forEach((b) => {
      alloc.set(b.bucket, (alloc.get(b.bucket) ?? 0) + Number(b.allocated));
      spend.set(b.bucket, (spend.get(b.bucket) ?? 0) + b.derivedSpent);
    });
    const entries = Array.from(alloc.entries()).filter(([, v]) => v > 0);
    const totalAllocated = entries.reduce((s, [, v]) => s + v, 0);
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const rows = sorted.map(([name, allocated], i) => {
      const spent = spend.get(name) ?? 0;
      return {
        name,
        allocated,
        spent,
        util: allocated > 0 ? Math.round((spent / allocated) * 100) : 0,
        color: chartColor(i, dark),
      };
    });
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
    const usedPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;
    return { rows, totalAllocated, totalSpent, usedPct };
  }, [budgets, dark]);

  const headTone = utilTone(usedPct);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-card p-5 h-full"
    >
      <h2 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
        Budget Allocation
      </h2>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No budget set yet. Add allocations on the <span className="text-foreground font-medium">Budget</span> page to see your split here.
        </div>
      ) : (
        <>
          {/* Headline strip: total allocated + overall utilization */}
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Allocated</div>
              <div className="font-display text-2xl font-bold text-foreground tabular-nums leading-tight">
                {formatCompact(totalAllocated)}
              </div>
            </div>
            <div className="text-right">
              <span className={cn("inline-block text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums", headTone.chip)}>
                {usedPct}% used
              </span>
              <div className="text-xs text-muted-foreground tabular-nums mt-1">
                {formatCompact(totalSpent)} spent
              </div>
            </div>
          </div>

          {/* Ranked utilization bars */}
          <div className="flex flex-col gap-2.5">
            {rows.map((r) => {
              const tone = utilTone(r.util);
              const barColor = tone.bar || r.color;
              return (
                <div key={r.name}>
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="truncate flex-1 capitalize text-foreground/90">{r.name}</span>
                    <span className="text-muted-foreground tabular-nums">{formatCompact(r.allocated)}</span>
                    <span className={cn("font-medium tabular-nums w-10 text-right", tone.text)}>{r.util}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(r.util, 100)}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default BudgetAllocation;
