import IncomeStreams from "@/components/dashboard/IncomeStreams";
import MetricCard from "@/components/dashboard/MetricCard";
import { Wallet, TrendingUp, Globe, Briefcase } from "lucide-react";

const Income = () => {
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
        <MetricCard label="Total Monthly" value="₹1,32,500" change="+8.2% MoM" changeType="positive" icon={<Wallet className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Active Income" value="₹85,000" change="Salary + Freelance" changeType="neutral" icon={<Briefcase className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="Passive Income" value="₹28,500" change="+12% growth" changeType="positive" icon={<TrendingUp className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="Forex (USD)" value="$228" change="@ ₹83.5" changeType="neutral" icon={<Globe className="w-4 h-4" />} delay={0.2} />
      </div>

      <IncomeStreams />
    </div>
  );
};

export default Income;