import { useMemo } from "react";
import MetricCard from "@/components/dashboard/MetricCard";
import TransactionsTable from "@/components/transactions/TransactionsTable";
import { Receipt, TrendingDown, AlertCircle, CreditCard } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { formatCompact, toINR } from "@/lib/finance";

const Expenses = () => {
  const { data: txns = [] } = useTransactions("expense");

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = txns.filter((t) => new Date(t.occurred_at) >= monthStart);
    const monthTotal = thisMonth.reduce((s, t) => s + toINR(Number(t.amount), t.currency), 0);
    const days = Math.max(1, now.getDate());
    const dailyAvg = monthTotal / days;
    const byCat = new Map<string, number>();
    thisMonth.forEach((t) =>
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + toINR(Number(t.amount), t.currency))
    );
    let largest: { name: string; amount: number } | null = null;
    byCat.forEach((amount, name) => {
      if (!largest || amount > largest.amount) largest = { name, amount };
    });
    return { monthTotal, dailyAvg, largest, totalRecords: txns.length };
  }, [txns]);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Expenses</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">Spending Overview</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Granular tracking across 8 behavioral categories with live budget utilization.
        </p>
      </header>

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

      <TransactionsTable type="expense" />
    </div>
  );
};

export default Expenses;