import { motion } from "framer-motion";
import { Target } from "lucide-react";
import { useGoals } from "@/hooks/useGoals";
import { formatCompact } from "@/lib/finance";

const COLORS = ["hsl(160, 60%, 45%)", "hsl(210, 70%, 55%)", "hsl(35, 90%, 55%)", "hsl(280, 60%, 55%)", "hsl(190, 70%, 50%)"];

const GoalTracker = () => {
  const { data: goals = [] } = useGoals();
  const active = goals.filter((g) => g.status !== "completed").slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-card p-5 h-full"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">Goal Progress</h2>
        <Target className="w-4 h-4 text-muted-foreground" />
      </div>

      {active.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Target className="w-6 h-6 opacity-40" />
          No goals yet. Set one on the Goals page.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {active.map((goal, i) => {
            const color = COLORS[i % COLORS.length];
            const pct = Number(goal.target_amount) > 0
              ? Math.min(100, Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100))
              : 0;
            return (
              <div key={goal.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">{goal.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {goal.target_date ? new Date(goal.target_date).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—"}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, delay: 0.3 + i * 0.1, ease: "easeOut" }}
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {formatCompact(Number(goal.current_amount), goal.currency)} / {formatCompact(Number(goal.target_amount), goal.currency)}
                  </span>
                  <span className="font-display font-semibold" style={{ color }}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default GoalTracker;
