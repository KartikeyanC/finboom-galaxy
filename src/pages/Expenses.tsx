import { useMemo } from "react";
import MetricCard from "@/components/dashboard/MetricCard";
import { Receipt, TrendingDown, AlertCircle, CreditCard } from "lucide-react";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { formatCompact } from "@/lib/finance";
import DebtLedger from "@/components/expenses/DebtLedger";
import ExpenseLedger from "@/components/expenses/ExpenseLedger";
import RecurringList from "@/components/recurring/RecurringList";
import RecurringDialog from "@/components/recurring/RecurringDialog";
import SubscriptionsPanel from "@/components/subscriptions/SubscriptionsPanel";
import SmartSplit from "@/components/expenses/SmartSplit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Expenses = () => {
  // Stage 4.2: this strip used to be computed from an unbounded fetch of every
  // expense the workspace had ever recorded — on a page whose ledger is now
  // explicitly windowed, which would have been an odd pairing. All four figures
  // come from the same aggregate the dashboard uses, including the "all time"
  // record count, which is why `by_type` exists.
  const { summary } = useDashboardSummary();

  const stats = useMemo(() => {
    const now = new Date();
    const monthTotal = summary.expense;
    const days = Math.max(1, now.getDate());
    const largest = summary.expenseCategories[0]
      ? { name: summary.expenseCategories[0].name, amount: summary.expenseCategories[0].value }
      : null;
    return {
      monthTotal,
      dailyAvg: monthTotal / days,
      largest,
      totalRecords: summary.countByType.expense ?? 0,
    };
  }, [summary]);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Expenses</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">Spending Overview</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Granular tracking across 8 behavioral categories with live budget utilization.
        </p>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="rounded-full bg-secondary/60 p-1 h-auto flex-wrap">
          <TabsTrigger value="overview" className="rounded-full px-4 py-1.5">Spending Overview</TabsTrigger>
          <TabsTrigger value="split" className="rounded-full px-4 py-1.5">Smart Split</TabsTrigger>
          <TabsTrigger value="recurring" className="rounded-full px-4 py-1.5">Recurring Expenses</TabsTrigger>
          <TabsTrigger value="subscriptions" className="rounded-full px-4 py-1.5">Subscriptions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="This Month" value={formatCompact(stats.monthTotal)}
          change="INR equivalent" changeType="neutral" icon={<Receipt className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Daily Average" value={formatCompact(stats.dailyAvg)}
          change="Month-to-date" changeType="neutral" icon={<CreditCard className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="Largest Category"
          value={stats.largest ? formatCompact(stats.largest.amount) : "—"}
          change={stats.largest?.name ?? "No data"} changeType="neutral"
          icon={<TrendingDown className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="Total Records" value={String(stats.totalRecords)}
          change="All time" changeType="neutral" icon={<AlertCircle className="w-4 h-4" />} delay={0.2} />
      </div>

      <DebtLedger />

      <ExpenseLedger />
        </TabsContent>

        <TabsContent value="split" className="mt-4">
          <SmartSplit />
        </TabsContent>

        <TabsContent value="recurring" className="mt-4">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-foreground">Recurring Expenses</h2>
                <p className="text-sm text-muted-foreground">Rent, EMIs, utilities — mark paid to log a transaction.</p>
              </div>
              <RecurringDialog type="expense" />
            </div>
            <RecurringList type="expense" />
          </section>
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4">
          <SubscriptionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Expenses;