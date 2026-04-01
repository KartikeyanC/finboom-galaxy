import { motion } from "framer-motion";
import { Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Goal {
  name: string;
  target: number;
  current: number;
  deadline: string;
  color: string;
}

const GOALS: Goal[] = [
  { name: "Emergency Fund", target: 300000, current: 210000, deadline: "Aug 2025", color: "hsl(160, 60%, 45%)" },
  { name: "Term Insurance (Annual)", target: 48000, current: 32000, deadline: "Dec 2025", color: "hsl(210, 70%, 55%)" },
  { name: "International Trip", target: 200000, current: 85000, deadline: "Mar 2026", color: "hsl(35, 90%, 55%)" },
  { name: "New Laptop", target: 120000, current: 96000, deadline: "Jun 2025", color: "hsl(280, 60%, 55%)" },
];

const formatCurrency = (val: number) => {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val}`;
};

const GoalTracker = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Goal Progress
        </h3>
        <Target className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-4">
        {GOALS.map((goal, i) => {
          const pct = Math.round((goal.current / goal.target) * 100);
          return (
            <div key={goal.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{goal.name}</span>
                <span className="text-xs text-muted-foreground">{goal.deadline}</span>
              </div>
              <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, delay: 0.5 + i * 0.1, ease: "easeOut" }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: goal.color }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {formatCurrency(goal.current)} / {formatCurrency(goal.target)}
                </span>
                <span className="font-display font-semibold" style={{ color: goal.color }}>
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default GoalTracker;
