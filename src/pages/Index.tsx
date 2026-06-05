import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TransactionDialog from "@/components/transactions/TransactionDialog";
import MetricCard from "@/components/dashboard/MetricCard";
import NetWorthTrend from "@/components/dashboard/NetWorthTrend";
import BudgetAllocation from "@/components/dashboard/BudgetAllocation";
import GoalTracker from "@/components/dashboard/GoalTracker";
import InvestmentBreakdown from "@/components/dashboard/InvestmentBreakdown";
import IncomeStreams from "@/components/dashboard/IncomeStreams";
import SpendingCategories from "@/components/dashboard/SpendingCategories";
import ActionableReminders from "@/components/dashboard/ActionableReminders";

const Index = () => {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Hero Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-card to-chart-2/5 border border-primary/10 p-8"
      >
        <div className="absolute top-4 right-4 opacity-10">
          <Sparkles className="w-32 h-32 text-primary" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Welcome back</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-2">
            Good morning, Arun 👋
          </h1>
          <p className="text-muted-foreground max-w-lg">
            Your wealth grew <span className="text-success font-semibold">+5.8%</span> this month.
            You're on track for your emergency fund goal.
          </p>
          <div className="flex items-center gap-4 mt-6">
            <button
              onClick={() => navigate("/app/net-worth")}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity flex items-center gap-2 font-display"
            >
              View Full Report <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="px-5 py-2.5 bg-secondary text-foreground rounded-lg font-medium text-sm hover:bg-accent transition-colors font-display"
            >
              Add Transaction
            </button>
          </div>
        </div>
      </motion.div>

      <TransactionDialog open={addOpen} onOpenChange={setAddOpen} type="expense" />

      {/* Metrics Strip */}
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

      {/* Section: Wealth Overview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">Wealth Overview</h2>
          <span className="text-xs text-muted-foreground font-display">Last 12 months</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <NetWorthTrend />
          </div>
          <BudgetAllocation />
        </div>
      </section>

      {/* Section: Portfolio & Goals */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Portfolio & Goals</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InvestmentBreakdown />
          <GoalTracker />
        </div>
      </section>

      {/* Section: Activity */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Activity & Insights</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <IncomeStreams />
          <SpendingCategories />
          <ActionableReminders />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 pt-6 pb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">© 2026 FinRoots. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Privacy</span>
          <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Terms</span>
          <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Help</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
