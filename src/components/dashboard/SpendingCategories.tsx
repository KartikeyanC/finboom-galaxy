import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Receipt } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { formatCompact } from "@/lib/finance";
import { chartColor, useChartDark } from "@/lib/chartColors";
import { renderActiveSlice } from "@/lib/chartShapes";
import { cn } from "@/lib/utils";

const SpendingCategories = () => {
  // Stage 4.2: the month's category split is grouped in Postgres. This widget
  // used to pull every expense the user had ever recorded to render one pie.
  const { summary } = useDashboardSummary();
  const [active, setActive] = useState<number | null>(null);
  const dark = useChartDark();

  const { cats, total } = useMemo(() => {
    const entries = summary.expenseCategories;
    const total = entries.reduce((s, c) => s + c.value, 0);
    const cats = entries.map((c, i) => ({
      name: c.name,
      amount: c.value,
      color: chartColor(i, dark),
      pct: total > 0 ? Math.round((c.value / total) * 100) : 0,
    }));
    return { cats, total };
  }, [summary.expenseCategories, dark]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="glass-card p-5 h-full"
    >
      <h2 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
        Spending This Month
      </h2>
      {cats.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Receipt className="w-6 h-6 opacity-40" />
          No expenses logged this month yet.
        </div>
      ) : (
        <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
          {/* Legend */}
          <ul className="flex flex-col gap-1 flex-1 min-w-0 order-2 sm:order-1">
            {cats.map((cat, i) => (
              <li key={cat.name}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-md px-1.5 py-1 -mx-1.5 transition-colors text-left",
                    active === i ? "bg-primary/10" : "hover:bg-muted/40",
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className={cn("text-sm truncate flex-1", active === i ? "text-foreground font-medium" : "text-foreground/90")}>{cat.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {formatCompact(cat.amount)}
                  </span>
                  <span className="text-xs font-medium tabular-nums shrink-0 w-9 text-right" style={{ color: cat.color }}>
                    {cat.pct}%
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Donut */}
          <div className="relative w-40 h-40 shrink-0 mx-auto sm:mx-0 order-1 sm:order-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={cats}
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={66}
                  paddingAngle={2}
                  dataKey="amount"
                  nameKey="name"
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={-270}
                  activeIndex={active ?? undefined}
                  activeShape={renderActiveSlice}
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  isAnimationActive={false}
                >
                  {cats.map((entry, index) => (
                    <Cell key={index} fill={entry.color} fillOpacity={active === null || active === index ? 1 : 0.5} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center text-center w-[78px]">
                {active !== null && cats[active] ? (
                  <>
                    <span className="text-xs text-muted-foreground truncate max-w-full">{cats[active].name}</span>
                    <span className="font-display text-base font-bold text-foreground tabular-nums leading-tight mt-0.5">{formatCompact(cats[active].amount)}</span>
                    <span className="text-xs font-medium tabular-nums" style={{ color: cats[active].color }}>{cats[active].pct}%</span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground leading-tight">Total for month</span>
                    <span className="font-display text-lg font-bold text-foreground tabular-nums mt-0.5">
                      {formatCompact(total)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default SpendingCategories;
