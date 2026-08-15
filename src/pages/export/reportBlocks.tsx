import { Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

import { PIE_COLORS, rupee } from "./reportData";

/**
 * The presentational blocks the export report is assembled from — split out of
 * Export.tsx in Stage 4.13.
 *
 * All six are pure: they take strings and numbers the page has already derived
 * and draw them. Nothing here fetches, filters or formats a date range, so a
 * change to what a statement *contains* never lands in this file.
 */

// Minimal structural types for the recharts tooltip render props we actually read.
// ── custom tooltip ────────────────────────────────────────────────────────────
// Minimal structural types for the recharts tooltip render props we actually read.
interface TooltipEntry {
  dataKey?: string | number;
  fill?: string;
  name?: string | number;
  value?: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}

export function BarTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-background/95 backdrop-blur-sm shadow-xl p-3 text-xs space-y-1">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{rupee(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-background/95 backdrop-blur-sm shadow-xl p-3 text-xs">
      <p className="font-semibold">{payload[0].name}</p>
      <p className="text-muted-foreground mt-0.5">{rupee(Number(payload[0].value ?? 0))}</p>
    </div>
  );
}
// ── sub-components ────────────────────────────────────────────────────────────

export function StatCard({ label, value, icon, valueClass, gradient }: {
  label: string; value: string; icon: React.ReactNode; valueClass: string; gradient: string;
}) {
  return (
    <Card className={cn("border-border/60 shadow-sm overflow-hidden relative", `bg-gradient-to-br ${gradient}`)}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          {icon}
        </div>
        <p className={cn("text-lg font-bold font-display mt-1.5 tracking-tight", valueClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function SectionBlock({ icon, iconBg, title, badge, badgeClass, children }: {
  icon: React.ReactNode; iconBg: string; title: string; badge: string; badgeClass: string; children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", iconBg)}>
              {icon}
            </div>
            {title}
          </CardTitle>
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", badgeClass)}>
            {badge}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {children}
      </CardContent>
    </Card>
  );
}

export function DonutCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium mb-2">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%" cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={0} />)}
          </Pie>
          <Tooltip content={<PieTooltip />} />
          <Legend
            wrapperStyle={{ fontSize:11 }}
            formatter={(value: string) => <span className="text-muted-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleTable({ headers, rows, empty, amountCol, amountClass, glCol }: {
  headers: string[];
  rows: string[][];
  empty: string;
  amountCol?: number;
  amountClass?: string;
  glCol?: number;
}) {
  if (!rows.length) return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Minus className="w-5 h-5 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">{empty}</p>
    </div>
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-border/40">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40 border-b border-border/40">
            {headers.map(h => (
              <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap first:rounded-tl-xl last:rounded-tr-xl">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20 transition-colors">
              {row.map((cell, j) => {
                const isGL = glCol !== undefined && j === glCol;
                const isAmt = amountCol !== undefined && j === amountCol && !isGL;
                const glPositive = isGL && cell.startsWith("+");
                const glNegative = isGL && !cell.startsWith("+");
                return (
                  <td key={j} className={cn(
                    "px-3 py-2",
                    isAmt && amountClass,
                    isGL && glPositive && "text-emerald-500 font-semibold",
                    isGL && glNegative && "text-rose-500 font-semibold",
                  )}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BudgetTable({ budgets }: { budgets: { bucket: string; allocated: number | string; spent: number | string }[] }) {
  if (!budgets.length) return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Minus className="w-5 h-5 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">No budget data</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {budgets.map((b, i) => {
        const a = Number(b.allocated), s = Number(b.spent);
        const pct = a > 0 ? Math.min((s / a) * 100, 100) : 0;
        const over = s > a;
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate max-w-[180px]">{b.bucket}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={over ? "text-rose-500 font-semibold" : "text-muted-foreground"}>
                  {rupee(s)}
                </span>
                <span className="text-muted-foreground/50">/</span>
                <span className="text-muted-foreground">{rupee(a)}</span>
                <span className={cn(
                  "text-xs font-semibold px-1.5 py-0.5 rounded-full",
                  over ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600"
                )}>
                  {a > 0 ? `${((s/a)*100).toFixed(0)}%` : "—"}
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", over ? "bg-rose-500" : "bg-emerald-500")}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}