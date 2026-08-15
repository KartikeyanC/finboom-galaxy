import { useMemo, useState } from "react";
import {
  Printer, FileText, FileSpreadsheet, CalendarDays, LayoutGrid,
  TrendingUp, TrendingDown, Wallet, HandCoins, PiggyBank,
  Landmark, Target, BarChart3,
  ArrowUpRight, ArrowDownRight, Sparkles, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { useTransactions } from "@/hooks/useTransactions";
import { useBudgets } from "@/hooks/useBudgets";
import { useAccounts } from "@/lib/accountsStore";
import {
  useInvestments,
  getCurrent,
  getInvested,
  getRecordName,
} from "@/lib/investmentsStore";
import { cn } from "@/lib/utils";

import {
  DATE_PRESETS,
  SECTIONS,
  calcRange,
  clean,
  dlBlob,
  makeCSV,
  rupee,
  withinRange,
  type DatePreset,
  type SectionId,
} from "./export/reportData";
import FullDataExportCard from "./export/FullDataExportCard";
import {
  BarTooltip,
  BudgetTable,
  DonutCard,
  SectionBlock,
  SimpleTable,
  StatCard,
} from "./export/reportBlocks";

// ── main component ────────────────────────────────────────────────────────────
export default function ExportPage() {
  const [active, setActive]    = useState<Set<SectionId>>(new Set(["expenses","income","investments","budget","accounts"]));
  const [preset, setPreset]    = useState<DatePreset>("this_month");
  const [customFrom, setFrom]  = useState("");
  const [customTo,   setTo]    = useState("");

  const { data: rawTxns = [] }   = useTransactions();
  const { data: budgets  = [] }  = useBudgets();
  const { accounts }             = useAccounts();
  const { records: investments } = useInvestments();

  const range = useMemo(() => calcRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const expenses = useMemo(() => rawTxns.filter(t => t.type === "expense" && withinRange(new Date(t.occurred_at), range)), [rawTxns, range]);
  const incomes  = useMemo(() => rawTxns.filter(t => t.type === "income"  && withinRange(new Date(t.occurred_at), range)), [rawTxns, range]);

  const expByCategory = useMemo(() => {
    const m = new Map<string, number>();
    expenses.forEach(t => m.set(t.category, (m.get(t.category) ?? 0) + Number(t.amount)));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [expenses]);

  const incByCategory = useMemo(() => {
    const m = new Map<string, number>();
    incomes.forEach(t => m.set(t.category, (m.get(t.category) ?? 0) + Number(t.amount)));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [incomes]);

  const monthlyBar = useMemo(() => {
    const m = new Map<string, { month: string; income: number; expense: number }>();
    [...incomes, ...expenses].forEach(t => {
      const d = new Date(t.occurred_at);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (!m.has(k)) m.set(k, { month: k, income: 0, expense: 0 });
      const row = m.get(k)!;
      if (t.type === "income") row.income += Number(t.amount);
      else row.expense += Number(t.amount);
    });
    return [...m.values()].sort((a,b) => a.month.localeCompare(b.month));
  }, [incomes, expenses]);

  const totalInc  = incomes.reduce((s,t)  => s + Number(t.amount), 0);
  const totalExp  = expenses.reduce((s,t) => s + Number(t.amount), 0);
  const net       = totalInc - totalExp;
  const portfolio = investments.reduce((s,r) => s + getCurrent(r), 0);

  const toggle = (id: SectionId) =>
    setActive(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // ── export handlers ───────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  const handleCSV = () => {
    const toRow = (t: typeof rawTxns[0]) => ({ Date: t.occurred_at.slice(0,10), Type: t.type, Category: t.category, Description: clean(t.description), Amount: Number(t.amount), Currency: t.currency });
    if (active.has("expenses")    && expenses.length)    dlBlob(makeCSV(expenses.map(toRow)),    "expenses.csv",    "text/csv");
    if (active.has("income")      && incomes.length)     dlBlob(makeCSV(incomes.map(toRow)),     "income.csv",      "text/csv");
    if (active.has("investments") && investments.length) dlBlob(makeCSV(investments.map(r => ({ Name: getRecordName(r), Asset: r.asset, Broker: r.broker ?? "", Invested: getInvested(r), Current: getCurrent(r), GL: getCurrent(r)-getInvested(r) }))), "investments.csv", "text/csv");
    if (active.has("budget")      && budgets.length)     dlBlob(makeCSV(budgets.map(b => ({ Bucket: b.bucket, Allocated: Number(b.allocated), Spent: Number(b.spent) }))), "budget.csv", "text/csv");
  };

  const handleExcel = async () => {
    const xlsx = await import("xlsx");
    const wb   = xlsx.utils.book_new();
    const toRow = (t: typeof rawTxns[0]) => ({ Date: t.occurred_at.slice(0,10), Type: t.type, Category: t.category, Description: clean(t.description), Amount: Number(t.amount), Currency: t.currency });
    const add = (name: string, rows: object[]) => {
      if (!rows.length) return;
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), name.slice(0,31));
    };
    if (active.has("expenses"))    add("Expenses",    expenses.map(toRow));
    if (active.has("income"))      add("Income",      incomes.map(toRow));
    if (active.has("investments")) add("Investments", investments.map(r => ({ Name: getRecordName(r), Asset: r.asset, Broker: r.broker ?? "", Invested: getInvested(r), Current: getCurrent(r), GL: getCurrent(r)-getInvested(r) })));
    if (active.has("budget"))      add("Budget",      budgets.map(b => ({ Bucket: b.bucket, Allocated: Number(b.allocated), Spent: Number(b.spent) })));
    if (active.has("accounts"))    add("Accounts",    accounts.map(a => ({ Name: a.name, Type: a.type, Bank: a.bank ?? "" })));
    if (wb.SheetNames.length) xlsx.writeFile(wb, "finroot_export.xlsx");
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 max-w-[1400px] mx-auto space-y-8">

      {/* ── page header ──────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Download className="w-4 h-4 text-primary" />
            </div>
            <Badge variant="secondary" className="text-[11px] uppercase tracking-widest font-semibold">
              Reports & Export
            </Badge>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Export Data</h1>
          <p className="text-muted-foreground text-sm">Filter, preview and download your financial data.</p>
        </div>

        {/* export action buttons */}
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-2 h-9 border-border/60 hover:bg-muted/60"
          >
            <Printer className="w-4 h-4 text-red-500" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCSV}
            className="gap-2 h-9 border-border/60 hover:bg-muted/60"
          >
            <FileText className="w-4 h-4 text-emerald-500" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button
            size="sm"
            onClick={handleExcel}
            className="gap-2 h-9 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0 shadow-md shadow-indigo-500/20"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

        {/* ── sidebar controls ──────────────────────────────────────────── */}
        <aside className="space-y-4 print:hidden">

          {/* Date Range */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CalendarDays className="w-3.5 h-3.5 text-primary" />
                </div>
                Date Range
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {DATE_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPreset(p.value)}
                    className={cn(
                      "text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all duration-150",
                      preset === p.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {preset === "custom" && (
                <div className="space-y-1.5 pt-1">
                  <Input type="date" className="h-8 text-xs" value={customFrom} onChange={e => setFrom(e.target.value)} />
                  <Input type="date" className="h-8 text-xs" value={customTo}   onChange={e => setTo(e.target.value)} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sections */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <LayoutGrid className="w-3.5 h-3.5 text-primary" />
                </div>
                Sections
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-1.5">
              {SECTIONS.map(s => {
                const Icon = s.icon;
                const checked = active.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left",
                      checked
                        ? `${s.bg} border border-current/10`
                        : "hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", s.bg)}>
                      <Icon className={cn("w-3.5 h-3.5", s.color)} />
                    </div>
                    <span className={cn("text-sm font-medium flex-1", checked ? "text-foreground" : "text-muted-foreground")}>
                      {s.label}
                    </span>
                    <div className={cn(
                      "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                      checked ? "bg-primary border-primary" : "border-border"
                    )}>
                      {checked && <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* format legend */}
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3.5 space-y-2 text-xs">
            <p className="font-semibold text-foreground/80 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary" /> Export formats
            </p>
            <Separator className="opacity-40" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Printer className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span className="text-muted-foreground"><strong className="text-foreground">PDF</strong> — charts + tables via print</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-muted-foreground"><strong className="text-foreground">CSV</strong> — one file per section</span>
              </div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                <span className="text-muted-foreground"><strong className="text-foreground">Excel</strong> — one workbook, multi-sheet</span>
              </div>
            </div>
          </div>
          <FullDataExportCard />
        </aside>

        {/* ── preview panel ─────────────────────────────────────────────── */}
        <div className="space-y-6" id="export-preview">

          {/* ── stat cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Total Income"
              value={rupee(totalInc)}
              icon={<ArrowUpRight className="w-4 h-4 text-emerald-500" />}
              valueClass="text-emerald-500"
              gradient="from-emerald-500/10 to-teal-500/5"
            />
            <StatCard
              label="Total Expenses"
              value={rupee(totalExp)}
              icon={<ArrowDownRight className="w-4 h-4 text-rose-500" />}
              valueClass="text-rose-500"
              gradient="from-rose-500/10 to-orange-500/5"
            />
            <StatCard
              label="Net Savings"
              value={rupee(net)}
              icon={net >= 0
                ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                : <TrendingDown className="w-4 h-4 text-rose-500" />}
              valueClass={net >= 0 ? "text-emerald-500" : "text-rose-500"}
              gradient={net >= 0 ? "from-emerald-500/10 to-teal-500/5" : "from-rose-500/10 to-orange-500/5"}
            />
            <StatCard
              label="Portfolio"
              value={rupee(portfolio)}
              icon={<PiggyBank className="w-4 h-4 text-indigo-500" />}
              valueClass="text-indigo-500"
              gradient="from-indigo-500/10 to-purple-500/5"
            />
          </div>

          {/* ── monthly bar chart ───────────────────────────────────────── */}
          {(active.has("expenses") || active.has("income")) && monthlyBar.length > 0 && (
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-2 px-5 pt-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-primary" />
                  </div>
                  Income vs Expenses by Month
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyBar} margin={{ top:4, right:12, left:0, bottom:0 }} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:11, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill:"hsl(var(--muted))", radius:6 }} />
                    <Legend wrapperStyle={{ fontSize:12 }} />
                    <Bar dataKey="income"  name="Income"  fill="#22c55e" radius={[5,5,0,0]} />
                    <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[5,5,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* ── expenses section ────────────────────────────────────────── */}
          {active.has("expenses") && (
            <SectionBlock
              icon={<HandCoins className="w-4 h-4 text-rose-500" />}
              iconBg="bg-rose-500/10"
              title={`Expenses`}
              badge={`${expenses.length} transactions`}
              badgeClass="bg-rose-500/10 text-rose-600"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {expByCategory.length > 0 && (
                  <DonutCard title="By Category" data={expByCategory} />
                )}
                <SimpleTable
                  headers={["Date","Category","Description","Amount"]}
                  rows={expenses.slice(0,60).map(t => [
                    t.occurred_at.slice(0,10),
                    t.category,
                    clean(t.description),
                    rupee(Number(t.amount)),
                  ])}
                  empty="No expenses in range"
                  amountCol={3}
                  amountClass="text-rose-500 font-semibold"
                />
              </div>
            </SectionBlock>
          )}

          {/* ── income section ──────────────────────────────────────────── */}
          {active.has("income") && (
            <SectionBlock
              icon={<Wallet className="w-4 h-4 text-emerald-500" />}
              iconBg="bg-emerald-500/10"
              title="Income"
              badge={`${incomes.length} transactions`}
              badgeClass="bg-emerald-500/10 text-emerald-600"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {incByCategory.length > 0 && (
                  <DonutCard title="By Category" data={incByCategory} />
                )}
                <SimpleTable
                  headers={["Date","Category","Description","Amount"]}
                  rows={incomes.slice(0,60).map(t => [
                    t.occurred_at.slice(0,10),
                    t.category,
                    clean(t.description),
                    rupee(Number(t.amount)),
                  ])}
                  empty="No income in range"
                  amountCol={3}
                  amountClass="text-emerald-500 font-semibold"
                />
              </div>
            </SectionBlock>
          )}

          {/* ── investments section ─────────────────────────────────────── */}
          {active.has("investments") && (
            <SectionBlock
              icon={<TrendingUp className="w-4 h-4 text-indigo-500" />}
              iconBg="bg-indigo-500/10"
              title="Investments"
              badge={`${investments.length} holdings`}
              badgeClass="bg-indigo-500/10 text-indigo-600"
            >
              <SimpleTable
                headers={["Name","Asset","Broker","Invested","Current","G/L"]}
                rows={investments.map(r => {
                  const inv = getInvested(r), cur = getCurrent(r), gl = cur - inv;
                  return [getRecordName(r), r.asset, r.broker ?? "—", rupee(inv), rupee(cur), `${gl>=0?"+":""}${rupee(gl)}`];
                })}
                empty="No investments"
                amountCol={5}
                amountClass=""
                glCol={5}
              />
            </SectionBlock>
          )}

          {/* ── budget section ──────────────────────────────────────────── */}
          {active.has("budget") && (
            <SectionBlock
              icon={<Target className="w-4 h-4 text-amber-500" />}
              iconBg="bg-amber-500/10"
              title="Budget"
              badge={`${budgets.length} buckets`}
              badgeClass="bg-amber-500/10 text-amber-600"
            >
              <BudgetTable budgets={budgets} />
            </SectionBlock>
          )}

          {/* ── accounts section ────────────────────────────────────────── */}
          {active.has("accounts") && (
            <SectionBlock
              icon={<Landmark className="w-4 h-4 text-sky-500" />}
              iconBg="bg-sky-500/10"
              title="Accounts"
              badge={`${accounts.length} accounts`}
              badgeClass="bg-sky-500/10 text-sky-600"
            >
              <SimpleTable
                headers={["Name","Type","Bank","Opening Balance"]}
                rows={accounts.map(a => [a.name, a.type, a.bank ?? "—", a.openingBalance ? rupee(Number(a.openingBalance)) : "—"])}
                empty="No accounts"
              />
            </SectionBlock>
          )}

          {/* print footer */}
          <p className="hidden print:block text-xs text-center text-muted-foreground border-t pt-3 mt-8">
            FinRoot Financial Report · Exported {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
          </p>
        </div>
      </div>
    </div>
  );
}
