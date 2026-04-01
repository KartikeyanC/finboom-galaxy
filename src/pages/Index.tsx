import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Zap,
} from "lucide-react";
import MetricCard from "@/components/dashboard/MetricCard";
import NetWorthTrend from "@/components/dashboard/NetWorthTrend";
import BudgetAllocation from "@/components/dashboard/BudgetAllocation";
import GoalTracker from "@/components/dashboard/GoalTracker";
import InvestmentBreakdown from "@/components/dashboard/InvestmentBreakdown";
import IncomeStreams from "@/components/dashboard/IncomeStreams";
import SpendingCategories from "@/components/dashboard/SpendingCategories";
import ActionableReminders from "@/components/dashboard/ActionableReminders";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-xl bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="font-display text-xl font-bold text-gradient-primary">Finboom</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground hidden sm:block">April 2026</span>
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <span className="text-xs font-semibold text-foreground">AK</span>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="font-display text-2xl font-bold text-foreground">
            Good morning, Arun 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your wealth grew <span className="text-success font-semibold">+5.8%</span> this month. Keep it up.
          </p>
        </motion.div>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Net Worth"
            value="₹12.8L"
            change="+5.8% this month"
            changeType="positive"
            icon={<TrendingUp className="w-4 h-4" />}
            delay={0.05}
          />
          <MetricCard
            label="Total Assets"
            value="₹16.5L"
            change="+3.8% from last month"
            changeType="positive"
            icon={<BarChart3 className="w-4 h-4" />}
            delay={0.1}
          />
          <MetricCard
            label="Liabilities"
            value="₹3.7L"
            change="-2.6% reducing"
            changeType="positive"
            icon={<TrendingDown className="w-4 h-4" />}
            delay={0.15}
          />
          <MetricCard
            label="Monthly Savings"
            value="₹42,500"
            change="32% savings rate"
            changeType="neutral"
            icon={<Wallet className="w-4 h-4" />}
            delay={0.2}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <NetWorthTrend />
          </div>
          <BudgetAllocation />
        </div>

        {/* Middle Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InvestmentBreakdown />
          <GoalTracker />
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <IncomeStreams />
          <SpendingCategories />
          <ActionableReminders />
        </div>
      </main>
    </div>
  );
};

export default Index;
