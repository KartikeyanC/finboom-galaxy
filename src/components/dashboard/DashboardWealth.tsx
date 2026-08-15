import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Wallet,
  HeartPulse, Activity, PieChart as PieIcon, CalendarClock, LineChart as LineIcon,
  CheckCircle2, Circle, Sparkles,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis,
} from "recharts";
import { renderActiveSlice } from "@/lib/chartShapes";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useAccounts } from "@/lib/accountsStore";
import { useLiveAccountBalances, calcLiveTotalBalance } from "@/hooks/useLiveAccountBalances";
import { useInvestments, getCurrent, getInvested } from "@/lib/investmentsStore";
import { useDebts, debtSummary } from "@/lib/debtsStore";
import { useGoals } from "@/hooks/useGoals";
import { useRecurring } from "@/hooks/useRecurring";
import { formatCompact, formatMoney } from "@/lib/finance";
import { IconChip } from "@/components/ui/icon-chip";
import { chartColor, useChartDark } from "@/lib/chartColors";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/contexts/AccessContext";
import { useBranding } from "@/hooks/useBranding";
import { cn } from "@/lib/utils";

const card = "glass-card p-5";
const heading = "font-display text-sm font-semibold text-foreground uppercase tracking-wider";

/* ════════════════════════ Net-worth hero ════════════════════════ */
function NetWorthHero({
  netWorth, income, expense, incomeSeries, expenseSeries, incomeMoM, expenseMoM,
}: {
  netWorth: number; income: number; expense: number;
  incomeSeries: number[]; expenseSeries: number[];
  incomeMoM: number | null; expenseMoM: number | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }} className={cn(card, "h-full")}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground">Net worth</div>
      <div className="font-display text-4xl font-bold text-gradient-primary tabular-nums mt-1">
        {formatCompact(netWorth)}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <MiniStat label="Income" value={income} series={incomeSeries} mom={incomeMoM} positive />
        <MiniStat label="Expenses" value={expense} series={expenseSeries} mom={expenseMoM} positive={false} />
      </div>
    </motion.div>
  );
}

function MiniStat({
  label, value, series, mom, positive,
}: { label: string; value: number; series: number[]; mom: number | null; positive: boolean }) {
  const max = Math.max(1, ...series);
  const accent = positive ? "bg-emerald-500" : "bg-rose-500";
  const dim = positive ? "bg-emerald-500/25" : "bg-rose-500/25";
  const momTone = mom === null ? "text-muted-foreground"
    : (positive ? mom >= 0 : mom <= 0) ? "text-emerald-500" : "text-rose-500";
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {mom !== null && (
          <span className={cn("text-xs font-medium tabular-nums", momTone)}>
            {mom >= 0 ? "+" : ""}{mom.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="font-display text-lg font-bold text-foreground tabular-nums mt-0.5">
        {formatCompact(value)}
      </div>
      <div className="flex items-end gap-1 h-6 mt-2">
        {series.map((v, i) => (
          <div
            key={i}
            className={cn("flex-1 rounded-sm", i === series.length - 1 ? accent : dim)}
            style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════ Financial health score ════════════════════════ */
function HealthScore({
  score, checks,
}: { score: number; checks: { label: string; ok: boolean }[] }) {
  const R = 40, C = 2 * Math.PI * R;
  const offset = C * (1 - score / 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 }} className={cn(card, "h-full")}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className={heading}>Financial health</h2>
        <HeartPulse className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-[104px] h-[104px] shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" strokeWidth="9"
              className="text-secondary" stroke="currentColor" />
            <motion.circle
              cx="50" cy="50" r={R} fill="none" strokeWidth="9" strokeLinecap="round"
              className="text-primary" stroke="currentColor"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-bold text-foreground tabular-nums">{score}%</span>
            <span className="text-xs text-muted-foreground">
              {score >= 75 ? "on track" : score >= 50 ? "steady" : "needs work"}
            </span>
          </div>
        </div>
        <ul className="flex flex-col gap-2 min-w-0">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-xs">
              {c.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                : <Circle className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
              <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

/* ════════════════════════ Cash flow ════════════════════════ */
function CashFlowPanel({
  inflows, outflows,
}: { inflows: { name: string; value: number }[]; outflows: { name: string; value: number }[] }) {
  const max = Math.max(1, ...inflows.map((x) => x.value), ...outflows.map((x) => x.value));
  const empty = inflows.length === 0 && outflows.length === 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }} className={cn(card, "h-full")}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className={heading}>Cash flow</h2>
        <Activity className="w-4 h-4 text-muted-foreground" />
      </div>
      {empty ? (
        <EmptyRow icon={<Activity className="w-6 h-6 opacity-40" />} text="Log income and expenses to see your flow." />
      ) : (
        <div className="space-y-4">
          <FlowGroup label="In" rows={inflows} max={max} tone="emerald" />
          <FlowGroup label="Out" rows={outflows} max={max} tone="rose" />
        </div>
      )}
    </motion.div>
  );
}

function FlowGroup({
  label, rows, max, tone,
}: { label: string; rows: { name: string; value: number }[]; max: number; tone: "emerald" | "rose" }) {
  if (rows.length === 0) return null;
  const bar = tone === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  const txt = tone === "emerald" ? "text-emerald-500" : "text-rose-500";
  return (
    <div className="space-y-2">
      <div className={cn("text-[11px] uppercase tracking-wider font-semibold", txt)}>{label}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2.5">
          <div className="w-20 text-xs text-muted-foreground text-right truncate">{r.name}</div>
          <div className="flex-1 h-3.5 rounded-full bg-secondary overflow-hidden">
            <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
          </div>
          <div className="w-14 text-xs text-foreground tabular-nums">{formatCompact(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════ Net spending donut ════════════════════════ */
function NetSpendingDonut({ data }: { data: { name: string; value: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const dark = useChartDark();
  const total = data.reduce((s, d) => s + d.value, 0);
  const items = data.map((d, i) => ({ ...d, color: chartColor(i, dark), pct: total > 0 ? Math.round((d.value / total) * 100) : 0 }));
  const sel = active !== null ? items[active] : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }} className={cn(card, "h-full")}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className={heading}>Net spending</h2>
        <PieIcon className="w-4 h-4 text-muted-foreground" />
      </div>
      {items.length === 0 ? (
        <EmptyRow icon={<PieIcon className="w-6 h-6 opacity-40" />} text="No expenses logged this month yet." />
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative w-32 h-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={32} outerRadius={50} paddingAngle={3}
                  stroke="hsl(var(--card))" strokeWidth={2}
                  activeIndex={active ?? undefined} activeShape={renderActiveSlice}
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  isAnimationActive={false}
                >
                  {items.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={active === null || active === i ? 1 : 0.5} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center text-center w-[54px]">
                {sel ? (
                  <>
                    <span className="text-xs text-muted-foreground truncate max-w-full">{sel.name}</span>
                    <span className="text-sm font-display font-bold text-foreground tabular-nums leading-tight">{formatCompact(sel.value)}</span>
                    <span className="text-xs font-medium tabular-nums" style={{ color: sel.color }}>{sel.pct}%</span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Spent</span>
                    <span className="text-sm font-display font-bold text-foreground">{formatCompact(total)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            {items.slice(0, 5).map((it, i) => (
              <button
                key={it.name}
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  "flex items-center gap-2 text-xs rounded-md px-1.5 py-1 -mx-1.5 transition-colors text-left",
                  active === i ? "bg-primary/10" : "hover:bg-muted/40",
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                <span className={cn("truncate flex-1", active === i ? "text-foreground font-medium" : "text-muted-foreground")}>{it.name}</span>
                <span className="font-medium text-foreground tabular-nums">{it.pct}%</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ════════════════════════ Upcoming bills ════════════════════════ */
function UpcomingBills({ items }: { items: { id: string; name: string; icon: string | null; amount: number; currency: string; next_due_date: string }[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }} className={cn(card, "h-full")}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className={heading}>Upcoming bills</h2>
        <CalendarClock className="w-4 h-4 text-muted-foreground" />
      </div>
      {items.length === 0 ? (
        <EmptyRow icon={<CalendarClock className="w-6 h-6 opacity-40" />} text="No upcoming bills. Add recurring expenses to track them." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((b) => (
            <div key={b.id} className="flex items-center gap-3">
              <IconChip name={b.icon ?? "Receipt"} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground truncate">{b.name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(b.next_due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </div>
              </div>
              <span className="text-sm text-rose-500 tabular-nums">−{formatMoney(b.amount, b.currency)}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ════════════════════════ Investment performance ════════════════════════ */
function InvestmentPerformance({
  current, invested, series,
}: { current: number; invested: number; series: { name: string; value: number }[] }) {
  const delta = current - invested;
  const pct = invested > 0 ? (delta / invested) * 100 : 0;
  const positive = delta >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }} className={cn(card, "h-full")}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className={heading}>Investment performance</h2>
          <div className="font-display text-2xl font-bold text-foreground tabular-nums mt-1.5 flex items-center gap-2">
            {formatCompact(current)}
            {invested > 0 && (
              <span className={cn("text-xs font-medium flex items-center gap-0.5", positive ? "text-emerald-500" : "text-rose-500")}>
                {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {positive ? "+" : ""}{pct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <LineIcon className="w-4 h-4 text-muted-foreground" />
      </div>
      {series.length === 0 ? (
        <EmptyRow icon={<LineIcon className="w-6 h-6 opacity-40" />} text="Add holdings on the Investments page to track performance." />
      ) : (
        <div className="h-[120px] mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
              <defs>
                <linearGradient id="wealthInvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(160,60%,45%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(160,60%,45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" hide />
              <Tooltip
                cursor={false}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                formatter={(v: number) => [formatCompact(Number(v)), "Cumulative"]}
              />
              <Area type="monotone" dataKey="value" stroke="hsl(160,60%,45%)" strokeWidth={2} fill="url(#wealthInvFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        {series.length > 0 ? `Cumulative value across ${series.length} holding${series.length === 1 ? "" : "s"}.` : ""}
      </p>
    </motion.div>
  );
}

function EmptyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
      {icon}{text}
    </div>
  );
}

/* ════════════════════════ Dashboard ════════════════════════ */
const DashboardWealth = () => {
  const { user } = useAuth();
  const { canAccess } = useAccess();
  const { appName } = useBranding();
  const showNetWorth = canAccess("net-worth");
  const showBudget = canAccess("budget");
  const showInvestments = canAccess("investments");
  const showExpenses = canAccess("expenses");
  const showReminders = canAccess("reminders");

  const fullName =
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email?.split("@")[0] || "there";
  const firstName = fullName.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Stage 4.2: month totals, the six-month series and the current month's
  // category split all arrive pre-grouped. This component used to reduce every
  // transaction row in the workspace three separate times to build them.
  const { summary } = useDashboardSummary(6);
  const { accounts } = useAccounts();
  const { records: investments } = useInvestments();
  const debts = useDebts();
  const { data: goals = [] } = useGoals();
  const { data: bills = [] } = useRecurring("expense");
  const liveBalances = useLiveAccountBalances();

  const d = useMemo(() => {
    const { income, expense, savings, savingsRate } = summary;

    const cash = calcLiveTotalBalance(accounts, liveBalances);
    const invCurrent = investments.reduce((s, r) => s + getCurrent(r), 0);
    const invInvested = investments.reduce((s, r) => s + getInvested(r), 0);
    const assets = cash + invCurrent;
    const liabilities = debts.records.reduce((s, x) => s + Math.max(0, debtSummary(x).remaining), 0);
    const netWorth = assets - liabilities;

    // 6-month income / expense series for sparkbars — bucketed by Postgres in
    // the browser's own timezone (see the dashboard_summary migration).
    const incomeSeries = summary.incomeSeries;
    const expenseSeries = summary.expenseSeries;
    const mom = (s: number[]) => {
      const prev = s[s.length - 2];
      const cur = s[s.length - 1];
      if (!prev) return null;
      return ((cur - prev) / prev) * 100;
    };

    // cash flow: top income categories (in) / expense categories (out).
    // Already filtered to the current month, positive-only and sorted desc.
    const inflows = summary.incomeCategories.slice(0, 4);
    const outflows = summary.expenseCategories.slice(0, 4);
    const spending = summary.expenseCategories;

    // investment cumulative series (build-up by holding)
    const sorted = [...investments].map((r) => getCurrent(r)).filter((v) => v > 0).sort((a, b) => b - a);
    let acc = 0;
    const invSeries = sorted.map((v, i) => { acc += v; return { name: `#${i + 1}`, value: Math.round(acc) }; });

    // health score
    const rateScore = Math.max(0, Math.min(30, savingsRate)) / 30 * 40;
    const goalPcts = goals.filter((g) => Number(g.target_amount) > 0).map((g) => Math.min(1, Number(g.current_amount) / Number(g.target_amount)));
    const goalAvg = goalPcts.length ? goalPcts.reduce((s, x) => s + x, 0) / goalPcts.length : 0;
    const goalScore = (goalPcts.length ? goalAvg : 0.5) * 30;
    const debtRatio = assets > 0 ? liabilities / assets : (liabilities > 0 ? 1 : 0);
    const debtScore = Math.max(0, 1 - debtRatio) * 30;
    const score = Math.round(Math.max(0, Math.min(100, rateScore + goalScore + debtScore)));
    const checks = [
      { label: "Saved money this month", ok: savings > 0 },
      { label: "Healthy savings rate (20%+)", ok: savingsRate >= 20 },
      { label: "Low debt load", ok: liabilities <= assets * 0.5 },
      { label: "Goals on track", ok: goalAvg >= 0.3 && goalPcts.length > 0 },
    ];

    return {
      income, expense, savings, savingsRate, assets, liabilities, netWorth,
      invCurrent, invInvested, incomeSeries, expenseSeries,
      incomeMoM: mom(incomeSeries), expenseMoM: mom(expenseSeries),
      inflows, outflows, spending, invSeries, score, checks,
    };
  }, [summary, accounts, investments, debts.records, goals, liveBalances]);

  const upcomingBills = useMemo(
    () => bills.filter((b) => b.is_active).slice(0, 4)
      .map((b) => ({ id: b.id, name: b.name, icon: b.icon, amount: Number(b.amount), currency: b.currency, next_due_date: b.next_due_date })),
    [bills],
  );

  return (
    <div className="px-6 sm:px-8 py-8 space-y-5 max-w-[1400px] mx-auto">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="flex items-end justify-between gap-4 flex-wrap"
      >
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Dashboard
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mt-1">
            {greeting}, {firstName}
          </h1>
        </div>
        <Link
          to="/app/expenses"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity flex items-center gap-2 font-display"
        >
          Add transaction <ArrowUpRight className="w-4 h-4" />
        </Link>
      </motion.div>

      {/* Row 1: Net worth + Health */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-4 items-stretch">
        {showNetWorth ? (
          <NetWorthHero
            netWorth={d.netWorth} income={d.income} expense={d.expense}
            incomeSeries={d.incomeSeries} expenseSeries={d.expenseSeries}
            incomeMoM={d.incomeMoM} expenseMoM={d.expenseMoM}
          />
        ) : (
          <div className={cn(card, "h-full flex items-center justify-center text-sm text-muted-foreground")}>
            Net worth is not available on your plan.
          </div>
        )}
        <HealthScore score={d.score} checks={d.checks} />
      </div>

      {/* Row 2: Cash flow + Net spending */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-4 items-stretch">
        <CashFlowPanel inflows={d.inflows} outflows={d.outflows} />
        {showExpenses && <NetSpendingDonut data={d.spending} />}
      </div>

      {/* Row 3: Upcoming bills + Investment performance */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.25fr] gap-4 items-stretch">
        {showReminders && <UpcomingBills items={upcomingBills} />}
        {showInvestments && (
          <InvestmentPerformance current={d.invCurrent} invested={d.invInvested} series={d.invSeries} />
        )}
      </div>

      {/* Metrics strip */}
      {showNetWorth && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="Total assets" value={formatCompact(d.assets)} icon={<TrendingUp className="w-4 h-4" />} />
          <Metric label="Liabilities" value={formatCompact(d.liabilities)} icon={<TrendingDown className="w-4 h-4" />} />
          <Metric label="Monthly savings" value={formatCompact(d.savings)} icon={<Wallet className="w-4 h-4" />} />
          {showBudget && <Metric label="Savings rate" value={`${d.savingsRate}%`} icon={<Activity className="w-4 h-4" />} />}
        </div>
      )}

      <footer className="border-t border-border/30 pt-6 pb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">© 2026 {appName}. All rights reserved.</span>
        {/* Stage 5.7: these were three <span>s styled to look like links and
            wired to nothing — a "Help" that does nothing is worse than no help
            at all. */}
        <div className="flex items-center gap-4">
          <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
          <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
          <a href="/status" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Status</a>
          <a href="/support" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Help</a>
        </div>
      </footer>
    </div>
  );
};

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className={cn(card, "flex flex-col gap-2")}>
      <div className="flex items-center justify-between">
        <span className="metric-label">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="metric-value text-foreground">{value}</div>
    </div>
  );
}

export default DashboardWealth;
