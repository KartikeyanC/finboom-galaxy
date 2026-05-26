import { useMemo } from "react";
import MetricCard from "@/components/dashboard/MetricCard";
import GoalManager from "@/components/goals/GoalManager";
import { Target, Trophy, Clock, Flame } from "lucide-react";
import { useGoals } from "@/hooks/useGoals";

const Goals = () => {
  const { data: goals = [] } = useGoals();

  const stats = useMemo(() => {
    const active = goals.filter((g) => g.status === "active");
    const completed = goals.filter((g) => g.status === "completed").length;
    const avgProgress = goals.length
      ? Math.round(
          goals.reduce((s, g) => {
            const pct = Number(g.target_amount) > 0
              ? Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100)
              : 0;
            return s + pct;
          }, 0) / goals.length
        )
      : 0;

    const upcoming = active
      .filter((g) => g.target_date)
      .map((g) => ({
        title: g.title,
        days: Math.ceil((new Date(g.target_date!).getTime() - Date.now()) / 86400000),
      }))
      .filter((g) => g.days >= 0)
      .sort((a, b) => a.days - b.days)[0];

    return { activeCount: active.length, completed, avgProgress, upcoming };
  }, [goals]);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Goals</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">Financial Goals</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Track progress on emergency funds, insurance, and personal milestones.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Active Goals" value={String(stats.activeCount)}
          change={`${goals.length} total`} changeType="neutral"
          icon={<Target className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Completed" value={String(stats.completed)}
          change="All time" changeType="positive"
          icon={<Trophy className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="Avg. Progress" value={`${stats.avgProgress}%`}
          change="Across all goals" changeType="positive"
          icon={<Flame className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="Next Milestone"
          value={stats.upcoming ? `${stats.upcoming.days} days` : "—"}
          change={stats.upcoming?.title ?? "No upcoming"} changeType="neutral"
          icon={<Clock className="w-4 h-4" />} delay={0.2} />
      </div>

      <GoalManager />
    </div>
  );
};

export default Goals;