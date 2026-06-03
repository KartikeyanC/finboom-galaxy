import { motion } from "framer-motion";
import { BarChart3, TrendingUp } from "lucide-react";

interface Investment {
  name: string;
  value: number;
  change: number;
  color: string;
}

const INVESTMENTS: Investment[] = [
  { name: "Mutual Funds", value: 420000, change: 12.4, color: "hsl(160, 60%, 45%)" },
  { name: "Stocks", value: 310000, change: -2.1, color: "hsl(210, 70%, 55%)" },
  { name: "Fixed Deposits", value: 200000, change: 7.2, color: "hsl(35, 90%, 55%)" },
  { name: "Gold", value: 180000, change: 18.5, color: "hsl(45, 85%, 55%)" },
  { name: "Bonds", value: 120000, change: 5.8, color: "hsl(280, 60%, 55%)" },
  { name: "Emergency Fund", value: 210000, change: 0, color: "hsl(190, 70%, 50%)" },
];

const formatCurrency = (val: number) =>
  `₹${Math.round(val).toLocaleString("en-IN")}`;

const totalInvestment = INVESTMENTS.reduce((a, b) => a + b.value, 0);

const InvestmentBreakdown = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Investments
        </h3>
        <span className="text-xs font-display font-semibold text-primary">
          {formatCurrency(totalInvestment)}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {INVESTMENTS.map((inv, i) => {
          const pct = ((inv.value / totalInvestment) * 100).toFixed(0);
          return (
            <motion.div
              key={inv.name}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + i * 0.05 }}
              className="flex items-center gap-3"
            >
              <div
                className="w-1 h-8 rounded-full flex-shrink-0"
                style={{ backgroundColor: inv.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground font-medium">{inv.name}</span>
                  <span className="text-sm font-display font-semibold text-foreground">
                    {formatCurrency(inv.value)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <div className="flex-1 mr-3">
                    <div className="h-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: inv.color }}
                      />
                    </div>
                  </div>
                  <span
                    className="text-xs font-medium"
                    style={{ color: inv.change >= 0 ? "hsl(160, 60%, 45%)" : "hsl(12, 80%, 60%)" }}
                  >
                    {inv.change >= 0 ? "+" : ""}{inv.change}%
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default InvestmentBreakdown;
