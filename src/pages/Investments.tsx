import { useMemo, useState } from "react";
import MetricCard from "@/components/dashboard/MetricCard";
import NetWorthTrend from "@/components/dashboard/NetWorthTrend";
import { TrendingUp, PieChart, Coins, LineChart, Plus } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { useGoals } from "@/hooks/useGoals";
import { useBudgets } from "@/hooks/useBudgets";
import { formatCompact, toINR } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import AddInvestmentDialog from "@/components/investments/AddInvestmentDialog";

const INVEST_CATS = new Set(["Investment", "Dividend", "Interest"]);

const Investments = () => {
  const { data: txns = [] } = useTransactions();
  const { data: goals = [] } = useGoals();
  const { data: budgets = [] } = useBudgets();
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => {
    const investIncome = txns
      .filter((t) => t.type === "income" && INVEST_CATS.has(t.category))
      .reduce((s, t) => s + toINR(Number(t.amount), t.currency), 0);

    const savingsBucket = budgets
      .filter((b) => ["Long-Term Savings", "Financial Freedom"].includes(b.bucket))
      .reduce((s, b) => s + Number(b.spent), 0);

    const portfolioValue = investIncome + savingsBucket;

    const investCategories = new Set(
      txns.filter((t) => INVEST_CATS.has(t.category)).map((t) => t.category)
    );

    const retirementGoals = goals.filter((g) =>
      ["Retirement", "Emergency Fund"].includes(g.category ?? "")
    );

    return {
      portfolioValue,
      investIncome,
      classes: investCategories.size,
      retirementGoals: retirementGoals.length,
    };
  }, [txns, goals, budgets]);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Portfolio</span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-1">Investments</h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Derived from your investment-category transactions, long-term savings buckets, and retirement goals.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} size="lg" className="shrink-0">
          <Plus className="w-4 h-4" /> Add Investment
        </Button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Portfolio Value" value={formatCompact(stats.portfolioValue)}
          change="Income + savings" changeType="positive"
          icon={<TrendingUp className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Investment Income" value={formatCompact(stats.investIncome)}
          change="Dividends + interest" changeType="positive"
          icon={<LineChart className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="Asset Classes" value={String(stats.classes)}
          change="From your data" changeType="neutral"
          icon={<PieChart className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="Retirement Goals" value={String(stats.retirementGoals)}
          change="Active tracking" changeType="neutral"
          icon={<Coins className="w-4 h-4" />} delay={0.2} />
      </div>

      <NetWorthTrend />

      <AddInvestmentDialog open={open} onOpenChange={setOpen} />
    </div>
  );
};

export default Investments;