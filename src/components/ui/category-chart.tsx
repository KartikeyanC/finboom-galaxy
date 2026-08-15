import { useState } from "react";
import { List, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList } from "recharts";
import { chartColor, useChartDark } from "@/lib/chartColors";
import { cn } from "@/lib/utils";

export type ChartView = "list" | "donut" | "bar";
export interface ChartSlice { name: string; value: number; }

/** Shared view state for a list/donut/bar switch. */
export function useChartView(initial: ChartView = "list") {
  return useState<ChartView>(initial);
}

/** Segmented List / Donut / Bar control. */
export function ChartViewToggle({
  view,
  onChange,
  className,
}: {
  view: ChartView;
  onChange: (v: ChartView) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5", className)}>
      {([["list", List], ["donut", PieChartIcon], ["bar", BarChart3]] as const).map(([v, Icon]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-label={`${v} view`}
          aria-pressed={view === v}
          title={`${v[0].toUpperCase()}${v.slice(1)} view`}
          className={cn(
            "h-7 w-7 grid place-items-center rounded-md transition-colors",
            view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      ))}
    </div>
  );
}

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/**
 * Donut (centre readout + legend) or horizontal bar chart from pre-aggregated
 * slices. No floating tooltips — values stay OUTSIDE the graph: the donut shows
 * them in the legend (and the hovered one in the centre), the bar shows them at
 * the end of each bar. Hovering a slice highlights its legend row and vice-versa.
 */
export function CategoryChart({
  data,
  view,
  centerLabel = "Total",
  emptyText = "Nothing to chart yet.",
}: {
  data: ChartSlice[];
  view: "donut" | "bar";
  centerLabel?: string;
  emptyText?: string;
}) {
  const dark = useChartDark();
  const [active, setActive] = useState<number | null>(null);
  const cats = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = cats.reduce((s, c) => s + c.value, 0);

  if (cats.length === 0) {
    return <p className="text-center text-muted-foreground py-10 text-sm">{emptyText}</p>;
  }

  if (view === "bar") {
    return (
      <div className="mt-4" style={{ width: "100%", height: Math.max(220, cats.length * 46) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={cats} layout="vertical" margin={{ top: 4, right: 84, bottom: 4, left: 8 }}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tickLine={false}
              axisLine={false}
              tick={{ fill: dark ? "#9aa3a0" : "#475569", fontSize: 12 }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
              {cats.map((_, i) => (
                <Cell key={i} fill={chartColor(i, dark)} />
              ))}
              {/* value printed at the end of each bar — outside the bar */}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v: number) => fmt(v)}
                fill={dark ? "#e7eae8" : "#334155"}
                fontSize={11}
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="mt-4 grid sm:grid-cols-2 gap-6 items-center">
      <div className="relative" style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={cats}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={68}
              outerRadius={104}
              paddingAngle={2}
              stroke="none"
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {cats.map((_, i) => (
                <Cell
                  key={i}
                  fill={chartColor(i, dark)}
                  fillOpacity={active === null || active === i ? 1 : 0.35}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* centre readout — total, or the hovered slice's name + value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-10 text-center">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground truncate max-w-full">
            {active !== null ? cats[active].name : centerLabel}
          </span>
          <span className="font-display text-lg font-bold text-foreground tabular-nums">
            {fmt(active !== null ? cats[active].value : total)}
          </span>
        </div>
      </div>
      <ul className="space-y-1">
        {cats.map((c, i) => (
          <li
            key={c.name}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={cn(
              "flex items-center gap-2 text-xs rounded-md px-1.5 py-1 transition-colors cursor-default",
              active === i ? "bg-white/[0.06]" : active !== null ? "opacity-45" : "",
            )}
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: chartColor(i, dark) }} />
            <span className="text-foreground truncate capitalize flex-1">{c.name}</span>
            <span className="text-muted-foreground tabular-nums">{total ? Math.round((c.value / total) * 100) : 0}%</span>
            <span className="text-foreground font-medium tabular-nums w-16 text-right">{fmt(c.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
