import { useMemo } from "react";
import { useGoals } from "@/hooks/useGoals";
import { useInvestments } from "@/lib/investmentsStore";
import { useLivePrices } from "@/lib/livePrices";
import { investedByGoal, type GoalInvested } from "@/lib/goalHoldings";

const NONE: GoalInvested = { value: 0, holdings: [] };

/** For each goal, today's value of the holdings linked to it (goalHoldings.ts). */
export function useGoalInvested(): (goalId: string) => GoalInvested {
  const { data: goals = [] } = useGoals();
  const { records } = useInvestments();
  const { live } = useLivePrices(records);
  const byGoal = useMemo(() => {
    const liveValue = Object.fromEntries(Object.entries(live).map(([id, t]) => [id, t.currentValue]));
    return investedByGoal(records, goals, liveValue);
  }, [records, goals, live]);
  return (goalId) => byGoal.get(goalId) ?? NONE;
}
