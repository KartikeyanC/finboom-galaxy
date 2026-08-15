import { useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import MetricCard from "@/components/dashboard/MetricCard";
import IncomeCard from "@/components/income/IncomeCard";
import ManageCategoriesSheet from "@/components/income/ManageCategoriesSheet";
import AddIncomeDialog from "@/components/income/AddIncomeDialog";
import { Wallet, Globe, Layers, Sparkles } from "lucide-react";
import { useIncomeStreams } from "@/hooks/useIncomeStreams";
import { formatCompact } from "@/lib/finance";
import TransactionsTable from "@/components/transactions/TransactionsTable";
import RecurringList from "@/components/recurring/RecurringList";
import RecurringDialog from "@/components/recurring/RecurringDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryChart, ChartViewToggle, useChartView, type ChartSlice } from "@/components/ui/category-chart";

const Income = () => {
  const { streams, visible, toggleVisible, reorder, move, add, remove, resetAll } = useIncomeStreams();
  const dragId = useRef<string | null>(null);
  const [tab, setTab] = useState("streams");
  const [view, setView] = useChartView();
  const streamSlices: ChartSlice[] = visible.map((s) => ({ name: s.name, value: s.amount * s.exchangeRateToINR }));

  const stats = useMemo(() => {
    const totalINR = visible.reduce((s, x) => s + x.amount * x.exchangeRateToINR, 0);
    const activeINR = visible
      .filter((x) => x.type === "active")
      .reduce((s, x) => s + x.amount * x.exchangeRateToINR, 0);
    const passiveINR = totalINR - activeINR;
    const forexCount = visible.filter((x) => x.currency !== "INR").length;
    return { totalINR, activeINR, passiveINR, forexCount };
  }, [visible]);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Income</span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-1">Income Streams</h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Personalize, reorder, and hide your multi-currency earnings. Everything converts to INR instantly.
          </p>
        </div>
        {tab === "streams" && <AddIncomeDialog onAdd={add} />}
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-full bg-secondary/60 p-1 h-auto">
          <TabsTrigger value="streams" className="rounded-full px-4 py-1.5">Income Streams</TabsTrigger>
          <TabsTrigger value="recurring" className="rounded-full px-4 py-1.5">Recurring Income</TabsTrigger>
        </TabsList>

        <TabsContent value="streams" className="space-y-8 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Monthly (INR)" value={formatCompact(stats.totalINR)}
          change={`${visible.length} active streams`} changeType="positive"
          icon={<Wallet className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Active Income" value={formatCompact(stats.activeINR)} change="Salary & work"
          changeType="neutral"
          icon={<Sparkles className="w-4 h-4 text-emerald-400" />} delay={0.1} />
        <MetricCard label="Passive Income" value={formatCompact(stats.passiveINR)} change="Recurring & flexible"
          changeType="neutral"
          icon={<Layers className="w-4 h-4 text-violet-300" />} delay={0.15} />
        <MetricCard label="Foreign Streams" value={String(stats.forexCount)} change="Non-INR currencies"
          changeType="neutral" icon={<Globe className="w-4 h-4" />} delay={0.2} />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Your Streams</h2>
            <p className="text-sm text-muted-foreground">Drag handles to reorder. Tap the gear to hide or show.</p>
          </div>
          <div className="flex items-center gap-2">
            <ChartViewToggle view={view} onChange={setView} />
            <ManageCategoriesSheet streams={streams} onToggle={toggleVisible} onReset={resetAll} />
          </div>
        </div>

        {view !== "list" ? (
          <CategoryChart data={streamSlices} view={view} centerLabel="Monthly" emptyText="No income streams to chart." />
        ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {visible.map((s, i) => (
              <IncomeCard
                key={s.id}
                stream={s}
                isFirst={i === 0}
                isLast={i === visible.length - 1}
                onDragStart={(id) => { dragId.current = id; }}
                onDropOn={(targetId) => {
                  if (dragId.current && dragId.current !== targetId) reorder(dragId.current, targetId);
                  dragId.current = null;
                }}
                onMove={move}
                onRemove={remove}
              />
            ))}
          </AnimatePresence>

          {visible.length === 0 && (
            <div className="glass-card p-8 text-center text-muted-foreground">
              All streams hidden. Open <span className="font-medium text-foreground">Manage Categories</span> to show some.
            </div>
          )}
        </div>
        )}
      </section>

      <TransactionsTable type="income" />
        </TabsContent>

        <TabsContent value="recurring" className="mt-4">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-foreground">Recurring Income</h2>
                <p className="text-sm text-muted-foreground">Salary, rent, dividends — mark received to log a transaction.</p>
              </div>
              <RecurringDialog type="income" />
            </div>
            <RecurringList type="income" />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Income;