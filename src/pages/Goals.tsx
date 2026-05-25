import GoalTracker from "@/components/dashboard/GoalTracker";
import ActionableReminders from "@/components/dashboard/ActionableReminders";
import MetricCard from "@/components/dashboard/MetricCard";
import { Target, Trophy, Clock, Flame } from "lucide-react";

const Goals = () => {
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
        <MetricCard label="Active Goals" value="6" change="2 near complete" changeType="neutral" icon={<Target className="w-4 h-4" />} delay={0.05} />
        <MetricCard label="Completed" value="3" change="This year" changeType="positive" icon={<Trophy className="w-4 h-4" />} delay={0.1} />
        <MetricCard label="Avg. Progress" value="62%" change="+7% MoM" changeType="positive" icon={<Flame className="w-4 h-4" />} delay={0.15} />
        <MetricCard label="Next Milestone" value="22 days" change="Emergency Fund" changeType="neutral" icon={<Clock className="w-4 h-4" />} delay={0.2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GoalTracker />
        <ActionableReminders />
      </div>
    </div>
  );
};

export default Goals;