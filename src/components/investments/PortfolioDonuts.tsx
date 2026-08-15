import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { chartColor, useChartDark } from "@/lib/chartColors";
import { renderActiveSlice } from "@/lib/chartShapes";

export interface Slice {
  name: string;
  value: number;
  /** Optional group key — used by NestedDonut to map an outer slice to its inner ring. */
  group?: string;
}

function Legend({
  items, colors, total, active, onHover,
}: {
  items: Slice[]; colors: string[]; total: number;
  active: number | null; onHover: (i: number | null) => void;
}) {
  return (
    <ul className="flex flex-col gap-1 flex-1 min-w-0 max-h-[176px] overflow-y-auto pr-1 fr-legend-scroll">
      {items.map((it, i) => {
        const pct = total > 0 ? (it.value / total) * 100 : 0;
        const on = active === i;
        return (
          <li key={`${it.name}-${i}`}>
            <button
              type="button"
              onMouseEnter={() => onHover(i)}
              onFocus={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1 rounded-md text-left transition-colors",
                on ? "bg-primary/10" : "hover:bg-muted/50",
              )}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[i] }} />
              <span className={cn("text-xs truncate flex-1", on ? "text-foreground font-medium" : "text-muted-foreground")}>
                {it.name}
              </span>
              <span className="text-xs tabular-nums shrink-0 text-foreground">{pct.toFixed(2)}%</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────── Single interactive donut ───────────────────────── */
export function InteractiveDonut({
  title, items, currency = "INR", delay = 0,
}: { title: string; items: Slice[]; currency?: string; delay?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const dark = useChartDark();
  const colors = useMemo(() => items.map((_, i) => chartColor(i, dark)), [items, dark]);
  const total = items.reduce((s, x) => s + x.value, 0);
  const sel = active !== null ? items[active] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }} className="glass-card p-5"
    >
      <h3 className="font-display text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">{title}</h3>
      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No data to display yet.</div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative w-44 h-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={52} outerRadius={72}
                  startAngle={90} endAngle={-270} paddingAngle={1.5} strokeWidth={0}
                  activeIndex={active ?? undefined} activeShape={renderActiveSlice}
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  isAnimationActive={false}
                >
                  {items.map((_, i) => (
                    <Cell key={i} fill={colors[i]} fillOpacity={active === null || active === i ? 1 : 0.5} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center text-center w-[92px]">
                {sel ? (
                  <>
                    <span className="text-xs text-muted-foreground truncate max-w-full">{sel.name}</span>
                    <span className="font-display text-base font-bold text-foreground tabular-nums">{formatMoney(sel.value, currency)}</span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">{title}</span>
                )}
              </div>
            </div>
          </div>
          <Legend items={items} colors={colors} total={total} active={active} onHover={setActive} />
        </div>
      )}
    </motion.div>
  );
}

/* ───────────────────────── Nested two-level donut ───────────────────────── */
export function NestedDonut({
  title, groups, items, currency = "INR", delay = 0, toggle,
}: {
  title: string;
  groups: Slice[];                 // inner ring (e.g. asset classes)
  items: (Slice & { group: string })[]; // outer ring (e.g. individual holdings)
  currency?: string;
  delay?: number;
  toggle?: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void };
}) {
  const [active, setActive] = useState<number | null>(null);
  const dark = useChartDark();
  const total = items.reduce((s, x) => s + x.value, 0);

  // inner ring colour per group; outer slice inherits its group's hue (lighter)
  const groupColors = useMemo(
    () => Object.fromEntries(groups.map((g, i) => [g.name, chartColor(i, dark)])),
    [groups, dark],
  );
  const innerColors = groups.map((g) => groupColors[g.name]);
  const outerColors = items.map((it) => groupColors[it.group] ?? chartColor(0, dark));
  const activeGroup = active !== null ? items[active]?.group : null;
  const sel = active !== null ? items[active] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }} className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h3>
        {toggle && (
          <div className="inline-flex rounded-full border border-border/60 p-0.5 bg-card/40">
            {toggle.options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle.onChange(o.id)}
                className={cn(
                  "px-2.5 py-0.5 text-xs rounded-full transition-colors",
                  toggle.value === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No holdings to display yet.</div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative w-44 h-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/* inner ring: groups */}
                <Pie
                  data={groups} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={34} outerRadius={50}
                  startAngle={90} endAngle={-270} paddingAngle={1} strokeWidth={0}
                  isAnimationActive={false}
                >
                  {groups.map((g, i) => (
                    <Cell key={i} fill={innerColors[i]} fillOpacity={activeGroup === null || activeGroup === g.name ? 1 : 0.45} />
                  ))}
                </Pie>
                {/* outer ring: items */}
                <Pie
                  data={items} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={54} outerRadius={72}
                  startAngle={90} endAngle={-270} paddingAngle={0.6} strokeWidth={0}
                  activeIndex={active ?? undefined} activeShape={renderActiveSlice}
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  isAnimationActive={false}
                >
                  {items.map((_, i) => (
                    <Cell key={i} fill={outerColors[i]} fillOpacity={active === null || active === i ? 1 : 0.5} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center text-center w-[58px]">
                {sel ? (
                  <>
                    <span className="text-xs text-muted-foreground truncate max-w-full">{sel.name}</span>
                    <span className="font-display text-sm font-bold text-foreground tabular-nums">{formatMoney(sel.value, currency)}</span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">{title}</span>
                )}
              </div>
            </div>
          </div>
          <Legend
            items={items} colors={outerColors} total={total}
            active={active} onHover={setActive}
          />
        </div>
      )}
    </motion.div>
  );
}
