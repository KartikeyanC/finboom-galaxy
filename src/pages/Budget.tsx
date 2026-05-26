import { useMemo } from "react";
import MetricCard from "@/components/dashboard/MetricCard";
import BudgetManager from "@/components/budgets/BudgetManager";
import { PieChart, CheckCircle2, AlertCircle, Wallet } from "lucide-react";
import { useBudgets } from "@/hooks/useBudgets";
import { formatCompact } from "@/lib/finance";

const Budget = () => {
  const { data: budgets = [] } = useBudgets();

  const stats = useMemo(() => {
    const allocated = budgets.reduce((s, b) => s + Number(b.allocated), 0);
    const spent = budgets.reduce((s, b) => s + Number(b.spent), 0);
    const onTrack = budgets.filter((b) => Number(b.spent) <= Number(b.allocated)).length;
    const overspent = budgets.filter((b) => Number(b.spent) > Number(b.allocated)).length;
    return { allocated, spent, onTrack, overspent };
  }, [budgets]);

  const pct = stats.allocated > 0 ? Math.round((stats.spent / stats.allocated) * 100) : 0;

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Budget</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">Micro-Budget Allocation</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Your 7-bucket allocation: Needs, Freedom, Education, Play, Savings, Giving, and Agri.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Budgeted" value={formatCompact(stats.allocated)}
          change={`${budgets.length} buckets`} changeType="neutral"
          icon={<PieChart className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Spent" value={formatCompact(stats.spent)}
          change={`${pct}% used`} changeType={pct > 90 ? "negative" : "positive"}
          icon={<Wallet className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="On Track" value={`${stats.onTrack} buckets`}
          change="Within budget" changeType="positive"
          icon={<CheckCircle2 className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="Overspent" value={`${stats.overspent} buckets`}
          change={stats.overspent > 0 ? "Needs attention" : "All good"}
          changeType={stats.overspent > 0 ? "negative" : "positive"}
          icon={<AlertCircle className="w-4 h-4" />} delay={0.2} />
      </div>

      <BudgetManager />
    </div>
  );
};

export default Budget;