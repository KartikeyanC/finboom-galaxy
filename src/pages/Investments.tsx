import { useMemo, useState } from "react";
import { toast } from "sonner";
import MetricCard from "@/components/dashboard/MetricCard";
import NetWorthTrend from "@/components/dashboard/NetWorthTrend";
import { TrendingUp, PieChart, Coins, LineChart, Plus } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { useGoals } from "@/hooks/useGoals";
import { useBudgets } from "@/hooks/useBudgets";
import { formatCompact, toINR } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import AddInvestmentDialog from "@/components/investments/AddInvestmentDialog";
import PortfolioList from "@/components/investments/PortfolioList";
import DematAccountsSection from "@/components/investments/DematAccountsSection";
import { InteractiveDonut, NestedDonut } from "@/components/investments/PortfolioDonuts";
import {
  getCurrent,
  getInvested,
  getRecordName,
  ASSET_LABELS,
  useInvestments,
  type InvestmentRecord,
} from "@/lib/investmentsStore";

const INVEST_CATS = new Set(["Investment", "Dividend", "Interest"]);

const Investments = () => {
  const { data: txns = [] } = useTransactions();
  const { data: goals = [] } = useGoals();
  const { data: budgets = [] } = useBudgets();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvestmentRecord | null>(null);
  const [allocMode, setAllocMode] = useState<"current" | "invested">("current");
  const { records, upsert, remove } = useInvestments();

  const alloc = useMemo(() => {
    // "Account" ring — allocation by asset class at current value.
    const accMap = new Map<string, number>();
    records.forEach((r) => {
      const lbl = ASSET_LABELS[r.asset] ?? r.asset;
      accMap.set(lbl, (accMap.get(lbl) ?? 0) + getCurrent(r));
    });
    const account = Array.from(accMap.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    // Nested "Holdings" — outer = individual holdings, inner = asset class.
    const valOf = (r: InvestmentRecord) => (allocMode === "current" ? getCurrent(r) : getInvested(r));
    const items = records
      .map((r) => ({ name: getRecordName(r), value: valOf(r), group: ASSET_LABELS[r.asset] ?? r.asset }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    const gMap = new Map<string, number>();
    items.forEach((it) => gMap.set(it.group, (gMap.get(it.group) ?? 0) + it.value));
    const groups = Array.from(gMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return { account, groups, items };
  }, [records, allocMode]);

  const stats = useMemo(() => {
    const investIncome = txns
      .filter((t) => t.type === "income" && INVEST_CATS.has(t.category))
      .reduce((s, t) => s + toINR(Number(t.amount), t.currency), 0);

    const savingsBucket = budgets
      .filter((b) => ["Long-Term Savings", "Financial Freedom"].includes(b.bucket))
      .reduce((s, b) => s + Number(b.spent), 0);

    const recordsValue = records.reduce(
      (s, r) => s + toINR(getCurrent(r), r.currency),
      0,
    );

    const portfolioValue = investIncome + savingsBucket + recordsValue;

    const investCategories = new Set(
      txns.filter((t) => INVEST_CATS.has(t.category)).map((t) => t.category)
    );
    records.forEach((r) => investCategories.add(r.asset));

    const retirementGoals = goals.filter((g) =>
      ["Retirement", "Emergency Fund"].includes(g.category ?? "")
    );

    return {
      portfolioValue,
      investIncome,
      classes: investCategories.size,
      retirementGoals: retirementGoals.length,
    };
  }, [txns, goals, budgets, records]);

  const handleOpenAdd = () => {
    setEditing(null);
    setOpen(true);
  };

  const handleEdit = (rec: InvestmentRecord) => {
    setEditing(rec);
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    remove(id);
    toast.success("Investment successfully removed.");
  };

  const handleSave = (rec: InvestmentRecord) => {
    upsert(rec);
  };

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
        <Button onClick={handleOpenAdd} size="lg" className="shrink-0">
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

      <DematAccountsSection />

      {records.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-foreground">Portfolio Allocation</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <InteractiveDonut title="Account" items={alloc.account} delay={0.05} />
            <NestedDonut
              title="Holdings"
              groups={alloc.groups}
              items={alloc.items}
              delay={0.1}
              toggle={{
                value: allocMode,
                options: [
                  { id: "current", label: "Current" },
                  { id: "invested", label: "Invested" },
                ],
                onChange: (id) => setAllocMode(id as "current" | "invested"),
              }}
            />
          </div>
        </section>
      )}

      <PortfolioList
        records={records}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <AddInvestmentDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        onSave={handleSave}
        initial={editing}
      />
    </div>
  );
};

export default Investments;