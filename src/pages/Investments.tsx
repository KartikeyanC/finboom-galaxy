import InvestmentBreakdown from "@/components/dashboard/InvestmentBreakdown";
import NetWorthTrend from "@/components/dashboard/NetWorthTrend";
import MetricCard from "@/components/dashboard/MetricCard";
import { TrendingUp, PieChart, Coins, LineChart } from "lucide-react";

const Investments = () => {
  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Portfolio</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">Investments</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Monitor your portfolio across FDs, mutual funds, stocks, and bonds.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Portfolio Value" value="₹9.2L" change="+12.4% YTD" changeType="positive" icon={<TrendingUp className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Total Returns" value="₹1.04L" change="+11.3% gain" changeType="positive" icon={<LineChart className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="Asset Classes" value="4" change="Diversified" changeType="neutral" icon={<PieChart className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="SIP Active" value="₹18,000/mo" change="6 funds" changeType="neutral" icon={<Coins className="w-4 h-4" />} delay={0.2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><NetWorthTrend /></div>
        <InvestmentBreakdown />
      </div>
    </div>
  );
};

export default Investments;