import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useInvestments, getCurrent, getInvested, ASSET_LABELS, type AssetType } from "@/lib/investmentsStore";
import { formatCompact } from "@/lib/finance";
import { chartColor, useChartDark } from "@/lib/chartColors";
import { renderActiveSlice } from "@/lib/chartShapes";
import { cn } from "@/lib/utils";

const InvestmentBreakdown = () => {
  const { records } = useInvestments();
  const [active, setActive] = useState<number | null>(null);
  const dark = useChartDark();

  const { items, total } = useMemo(() => {
    const cur = new Map<string, number>();
    const inv = new Map<string, number>();
    records.forEach((r) => {
      cur.set(r.asset, (cur.get(r.asset) ?? 0) + getCurrent(r));
      inv.set(r.asset, (inv.get(r.asset) ?? 0) + getInvested(r));
    });
    const entries = Array.from(cur.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    const items = entries.map(([asset, value], i) => {
      const invested = inv.get(asset) ?? 0;
      const change = invested > 0 ? ((value - invested) / invested) * 100 : 0;
      return {
        name: ASSET_LABELS[asset as AssetType] ?? asset,
        value,
        change,
        pct: total > 0 ? Math.round((value / total) * 100) : 0,
        color: chartColor(i, dark),
      };
    });
    return { items, total };
  }, [records, dark]);

  const sel = active !== null ? items[active] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="glass-card p-5 h-full"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">Investments</h2>
        {total > 0 && <span className="text-xs font-display font-semibold text-primary">{formatCompact(total)}</span>}
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <TrendingUp className="w-6 h-6 opacity-40" />
          No investments yet. Add holdings on the Investments page.
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative w-40 h-40 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={52} outerRadius={64}
                  startAngle={90} endAngle={-270} paddingAngle={2}
                  stroke="hsl(var(--card))" strokeWidth={2}
                  activeIndex={active ?? undefined} activeShape={renderActiveSlice}
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  isAnimationActive={false}
                >
                  {items.map((entry, index) => (
                    <Cell key={index} fill={entry.color} fillOpacity={active === null || active === index ? 1 : 0.5} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center label — driven by the hovered slice (no overlapping tooltip). */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center text-center w-[74px]">
                {sel ? (
                  <>
                    <span className="text-xs text-muted-foreground truncate max-w-full">{sel.name}</span>
                    <span className="font-display text-base font-bold text-foreground tabular-nums leading-tight mt-0.5">
                      {formatCompact(sel.value)}
                    </span>
                    <span className="text-xs font-medium tabular-nums" style={{ color: sel.color }}>
                      {sel.pct}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</span>
                    <span className="text-sm font-display font-bold text-foreground tabular-nums">{formatCompact(total)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            {items.map((item, i) => (
              <button
                key={item.name}
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  "flex items-center gap-2 text-xs rounded-md px-1.5 py-1 -mx-1.5 transition-colors text-left",
                  active === i ? "bg-primary/10" : "hover:bg-muted/40",
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className={cn("truncate flex-1", active === i ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {item.name}
                </span>
                <span className="text-muted-foreground tabular-nums">{formatCompact(item.value)}</span>
                <span
                  className="font-medium font-display w-12 text-right tabular-nums"
                  style={{ color: item.change >= 0 ? "hsl(160, 60%, 45%)" : "hsl(12, 80%, 60%)" }}
                >
                  {item.change >= 0 ? "+" : ""}{item.change.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default InvestmentBreakdown;
