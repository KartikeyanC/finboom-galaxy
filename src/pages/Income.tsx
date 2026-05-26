import { useMemo } from "react";
import MetricCard from "@/components/dashboard/MetricCard";
import TransactionsTable from "@/components/transactions/TransactionsTable";
import { Wallet, TrendingUp, Globe, Layers } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { formatCompact, toINR } from "@/lib/finance";

const Income = () => {
  const { data: txns = [] } = useTransactions("income");

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = txns.filter((t) => new Date(t.occurred_at) >= monthStart);
    const monthlyINR = thisMonth.reduce((s, t) => s + toINR(Number(t.amount), t.currency), 0);
    const categories = new Set(txns.map((t) => t.category));
    const forex = txns
      .filter((t) => t.currency !== "INR")
      .reduce((s, t) => s + Number(t.amount), 0);
    return {
      monthlyINR,
      categoryCount: categories.size,
      forex,
      totalRecords: txns.length,
    };
  }, [txns]);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Income</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">Income Streams</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Track multi-currency earnings across active, passive, investment, and property income.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="This Month (INR eq.)" value={formatCompact(stats.monthlyINR)}
          change={`${txns.filter(t => new Date(t.occurred_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)).length} transactions`}
          changeType="positive" icon={<Wallet className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Total Records" value={String(stats.totalRecords)} change="All time"
          changeType="neutral" icon={<TrendingUp className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="Categories" value={String(stats.categoryCount)} change="Unique streams"
          changeType="neutral" icon={<Layers className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="Foreign Currency" value={stats.forex > 0 ? formatCompact(stats.forex, "USD") : "—"}
          change="Non-INR amounts" changeType="neutral" icon={<Globe className="w-4 h-4" />} delay={0.2} />
      </div>

      <TransactionsTable type="income" />
    </div>
  );
};

export default Income;