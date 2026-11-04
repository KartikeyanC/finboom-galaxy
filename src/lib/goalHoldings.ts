import { fromINR, toINR } from "./finance";
import { getCurrent, getRecordName, type InvestmentRecord } from "./investmentsStore";

/**
 * Holdings linked to a goal count toward it at what they are worth today.
 *
 * A holding names its goal by id (`fields.goal_id`). Older holdings carry one
 * of four fixed labels instead ("Retirement", "House Fund", …) in `goal`;
 * those still count, toward the goal whose title or category is that label,
 * so nothing linked before has to be linked again.
 *
 * The goal's own saved amount (`current_amount`) is kept apart from this:
 * the two are shown side by side, not merged, so money added by hand AND
 * invested is visible as two figures rather than silently counted twice.
 *
 * Pure: live values are an input.
 */

export type GoalRef = { id: string; title: string; category: string | null; currency: string };

export type GoalInvested = {
  /** Today's value of the linked holdings, in the goal's currency. */
  value: number;
  holdings: { id: string; name: string; value: number }[];
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The goal a holding counts toward, or undefined. */
export function goalOf(r: InvestmentRecord, goals: GoalRef[]): GoalRef | undefined {
  const id = r.fields?.goal_id;
  if (id) return goals.find((g) => g.id === id);
  if (!r.goal) return undefined;
  return goals.find((g) => same(g.title, r.goal)) ?? goals.find((g) => same(g.category, r.goal));
}

export function investedByGoal(
  records: InvestmentRecord[],
  goals: GoalRef[],
  /** Live current value by record id, when known. */
  liveValue: Record<string, number | undefined> = {},
): Map<string, GoalInvested> {
  const out = new Map<string, GoalInvested>();
  for (const r of records) {
    const g = goalOf(r, goals);
    if (!g) continue;
    const own = liveValue[r.id] ?? getCurrent(r);
    const value = fromINR(toINR(own, r.currency), g.currency);
    const acc = out.get(g.id) ?? { value: 0, holdings: [] };
    acc.value += value;
    acc.holdings.push({ id: r.id, name: getRecordName(r), value });
    out.set(g.id, acc);
  }
  return out;
}
