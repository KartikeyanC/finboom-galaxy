import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useAccounts } from "@/lib/accountsStore";
import { useLiveAccountBalances, calcLiveTotalBalance } from "@/hooks/useLiveAccountBalances";
import { useInvestments, getCurrent } from "@/lib/investmentsStore";
import { useDebts, debtSummary } from "@/lib/debtsStore";
import { formatCompact } from "@/lib/finance";
import MetricCard from "@/components/dashboard/MetricCard";
import NetWorthTrend from "@/components/dashboard/NetWorthTrend";
import BudgetAllocation from "@/components/dashboard/BudgetAllocation";
import GoalTracker from "@/components/dashboard/GoalTracker";
import InvestmentBreakdown from "@/components/dashboard/InvestmentBreakdown";
import IncomeStreams from "@/components/dashboard/IncomeStreams";
import SpendingCategories from "@/components/dashboard/SpendingCategories";
import ActionableReminders from "@/components/dashboard/ActionableReminders";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/contexts/AccessContext";
import { useBranding } from "@/hooks/useBranding";

/**
 * Classic FinRoot dashboard — the original layout. Preserved as a selectable
 * option (Settings → Dashboard layout). Not removed; kept in disabled mode.
 */
const DashboardClassic = () => {
  const { user } = useAuth();
  const { canAccess } = useAccess();
  const { appName } = useBranding();
  const showNetWorth = canAccess("net-worth");
  const showBudget = canAccess("budget");
  const showInvestments = canAccess("investments");
  const showGoals = canAccess("goals");
  const showIncome = canAccess("income");
  const showExpenses = canAccess("expenses");
  const showReminders = canAccess("reminders");
  const fullName =
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "there";
  const firstName = fullName.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Stage 4.2: month income/expense come pre-aggregated from the server rather
  // than from every transaction row the workspace has ever held.
  const { summary } = useDashboardSummary();
  const { accounts } = useAccounts();
  const { records: investments } = useInvestments();
  const debts = useDebts();
  const liveBalances = useLiveAccountBalances();
  const fin = useMemo(() => {
    const { income, expense, savings, savingsRate } = summary;
    const cash = calcLiveTotalBalance(accounts, liveBalances);
    const inv = investments.reduce((s, r) => s + getCurrent(r), 0);
    const assets = cash + inv;
    const liabilities = debts.records.reduce((s, d) => s + Math.max(0, debtSummary(d).remaining), 0);
    const netWorth = assets - liabilities;
    return { income, expense, savings, savingsRate, assets, liabilities, netWorth };
  }, [summary, accounts, investments, debts.records, liveBalances]);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Hero + Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`${showReminders ? "lg:col-span-2" : "lg:col-span-3"} relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-card to-chart-2/5 border border-primary/10 p-8`}
      >
        <div className="absolute top-4 right-4 opacity-10">
          <Sparkles className="w-32 h-32 text-primary" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Welcome back</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-2">
            {greeting}, {firstName}
          </h1>
          <p className="text-muted-foreground max-w-lg">
            {fin.income > 0 ? (
              <>
                You've saved <span className="text-success font-semibold">{formatCompact(fin.savings)}</span> this month
                {" "}— a {fin.savingsRate}% savings rate.
              </>
            ) : (
              <>Welcome to {appName}. Add your income and expenses to see your money come to life.</>
            )}
          </p>
          <div className="flex items-center gap-4 mt-6">
            <button className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity flex items-center gap-2 font-display">
              View Full Report <ArrowUpRight className="w-4 h-4" />
            </button>
            <button className="px-5 py-2.5 bg-secondary text-foreground rounded-lg font-medium text-sm hover:bg-accent transition-colors font-display">
              Add Transaction
            </button>
          </div>
        </div>
      </motion.div>

        {showReminders && <ActionableReminders />}
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {showNetWorth && (
          <MetricCard
            label="Net Worth"
            value={formatCompact(fin.netWorth)}
            change="Assets − liabilities"
            changeType="neutral"
            icon={<TrendingUp className="w-4 h-4" />}
            delay={0.05}
          />
        )}
        {showNetWorth && (
          <MetricCard
            label="Total Assets"
            value={formatCompact(fin.assets)}
            change="Cash + investments"
            changeType="neutral"
            icon={<BarChart3 className="w-4 h-4" />}
            delay={0.1}
          />
        )}
        {showNetWorth && (
          <MetricCard
            label="Liabilities"
            value={formatCompact(fin.liabilities)}
            change="Outstanding debts"
            changeType="neutral"
            icon={<TrendingDown className="w-4 h-4" />}
            delay={0.15}
          />
        )}
        {showBudget && (
          <MetricCard
            label="Monthly Savings"
            value={formatCompact(fin.savings)}
            change={`${fin.savingsRate}% savings rate`}
            changeType={fin.savings >= 0 ? "positive" : "negative"}
            icon={<Wallet className="w-4 h-4" />}
            delay={0.2}
          />
        )}
      </div>

      {/* Section: Wealth Overview */}
      {(showNetWorth || showBudget) && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">Wealth Overview</h2>
            {showNetWorth && (
              <span className="text-xs text-muted-foreground font-display">Last 12 months</span>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            {showNetWorth && (
              <div className="lg:col-span-2 h-full">
                <NetWorthTrend />
              </div>
            )}
            {showBudget && (
              <div className={showNetWorth ? "h-full" : "lg:col-span-2 lg:max-w-2xl h-full"}>
                <BudgetAllocation />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Section: Portfolio & Goals */}
      {(showInvestments || showGoals) && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-foreground">Portfolio & Goals</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {showInvestments && (
              <div className={showGoals ? "h-full" : "lg:col-span-2 h-full"}><InvestmentBreakdown /></div>
            )}
            {showGoals && (
              <div className={showInvestments ? "h-full" : "lg:col-span-2 h-full"}><GoalTracker /></div>
            )}
          </div>
        </section>
      )}

      {/* Section: Activity */}
      {(showIncome || showExpenses) && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-foreground">Activity & Insights</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {showIncome && (
              <div className={showExpenses ? "h-full" : "lg:col-span-2 h-full"}><IncomeStreams /></div>
            )}
            {showExpenses && (
              <div className={showIncome ? "h-full" : "lg:col-span-2 h-full"}><SpendingCategories /></div>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border/30 pt-6 pb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">© 2026 {appName}. All rights reserved.</span>
        {/* Stage 5.7: these were three <span>s styled to look like links and
            wired to nothing — a "Help" that does nothing is worse than no help
            at all. */}
        <div className="flex items-center gap-4">
          <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
          <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
          <a href="/status" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Status</a>
          <a href="/support" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Help</a>
        </div>
      </footer>
    </div>
  );
};

export default DashboardClassic;
