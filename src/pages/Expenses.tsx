import SpendingCategories from "@/components/dashboard/SpendingCategories";
import MetricCard from "@/components/dashboard/MetricCard";
import { Receipt, TrendingDown, AlertCircle, CreditCard } from "lucide-react";

const Expenses = () => {
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
        <MetricCard label="This Month" value="₹68,200" change="-4.1% vs last" changeType="positive" icon={<Receipt className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Daily Average" value="₹2,273" change="On track" changeType="neutral" icon={<CreditCard className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="Largest Category" value="Needs" value2="₹34,100" change="50% of spend" changeType="neutral" icon={<TrendingDown className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="Over Budget" value="2 cats" change="Food & Play" changeType="negative" icon={<AlertCircle className="w-4 h-4" />} delay={0.2} />
      </div>

      <SpendingCategories />
    </div>
  );
};

export default Expenses;