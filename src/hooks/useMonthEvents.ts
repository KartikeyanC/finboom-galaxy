import { useMemo } from "react";
import { useAccess } from "@/contexts/AccessContext";
import { useBudgets } from "@/hooks/useBudgets";
import { useGoals } from "@/hooks/useGoals";
import { useInsurance } from "@/lib/insuranceStore";
import { getInvested, getRecordName, useInvestments } from "@/lib/investmentsStore";
import {
  eventsInRange,
  toDayKey,
  type CalendarEvent,
} from "@/lib/calendarEvents";

/**
 * The non-transaction records that fall inside the visible month grid:
 * investments logged, budgets set, goal target dates, insurance premiums due.
 *
 * A module is included ONLY when `canAccess` grants its menu — the Calendar
 * itself is navigation-only, but it must not surface a plan-locked feature's
 * data to someone who cannot open that feature (the menuContract rule, applied
 * to a read-through view).
 *
 * These hooks are already mounted app-wide via React Query's cache, so this is
 * a projection over data usually in memory, not four fresh round-trips.
 */
export function useMonthEvents(startKey: string, endKey: string): CalendarEvent[] {
  const { canAccess } = useAccess();

  const showInvestments = canAccess("investments");
  const showBudget = canAccess("budget");
  const showGoals = canAccess("goals");
  const showInsurance = canAccess("insurance");

  const { records: investments } = useInvestments();
  const { data: budgets } = useBudgets();
  const { data: goals } = useGoals();
  const { items: policies } = useInsurance();

  return useMemo(() => {
    const out: CalendarEvent[] = [];

    if (showInvestments) {
      for (const r of investments) {
        const invested = getInvested(r);
        out.push({
          id: `investment-${r.id}`,
          kind: "investment",
          dateKey: toDayKey(r.savedAt),
          title: getRecordName(r),
          amount: invested > 0 ? invested : null,
          currency: r.currency,
          href: "/app/investments",
        });
      }
    }

    if (showBudget) {
      for (const b of budgets ?? []) {
        out.push({
          id: `budget-${b.id}`,
          kind: "budget",
          dateKey: toDayKey(b.period_start),
          title: b.bucket,
          amount: Number(b.allocated) || null,
          currency: "INR",
          href: "/app/budget",
        });
      }
    }

    if (showGoals) {
      for (const g of goals ?? []) {
        if (!g.target_date) continue;
        out.push({
          id: `goal-${g.id}`,
          kind: "goal",
          dateKey: toDayKey(g.target_date),
          title: g.title,
          amount: Number(g.target_amount) || null,
          currency: g.currency || "INR",
          href: "/app/goals",
        });
      }
    }

    if (showInsurance) {
      for (const p of policies) {
        if (!p.dueDate) continue;
        out.push({
          id: `insurance-${p.id}`,
          kind: "insurance",
          dateKey: toDayKey(p.dueDate),
          title: p.policyName,
          amount: Number(p.premium) || null,
          currency: "INR",
          href: "/app/insurance",
        });
      }
    }

    return eventsInRange(
      out.filter((e) => e.dateKey),
      startKey,
      endKey,
    );
  }, [
    showInvestments,
    showBudget,
    showGoals,
    showInsurance,
    investments,
    budgets,
    goals,
    policies,
    startKey,
    endKey,
  ]);
}
