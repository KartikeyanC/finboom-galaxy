import BudgetAllocation from "@/components/dashboard/BudgetAllocation";
import SpendingCategories from "@/components/dashboard/SpendingCategories";
import MetricCard from "@/components/dashboard/MetricCard";
import { PieChart, CheckCircle2, AlertCircle, Wallet } from "lucide-react";

const Budget = () => {
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
        <MetricCard label="Budgeted" value="₹1,32,500" change="100% allocated" changeType="neutral" icon={<PieChart className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Spent" value="₹68,200" change="51% used" changeType="positive" icon={<Wallet className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="On Track" value="5 buckets" change="Healthy" changeType="positive" icon={<CheckCircle2 className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="Overspent" value="2 buckets" change="Needs attention" changeType="negative" icon={<AlertCircle className="w-4 h-4" />} delay={0.2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BudgetAllocation />
        <div className="lg:col-span-2"><SpendingCategories /></div>
      </div>
    </div>
  );
};

export default Budget;