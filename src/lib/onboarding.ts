/**
 * Stage 5.3 — first-run onboarding: the three-step checklist and the optional
 * sample workspace.
 *
 * Two rules shape everything here, and both exist to keep the checklist honest:
 *
 *  1. **A step is complete because the data exists, never because a flag was
 *     set.** Nothing here records "the user clicked Add transaction". The
 *     checklist counts rows, so it cannot claim a workspace is set up when it
 *     is empty, and it cannot nag someone who arrived with data already in
 *     place (an invited collaborator, an import, a second workspace).
 *
 *  2. **Sample rows do not count towards a step.** They are real rows in the
 *     real ledger — that is the point of them — but a workspace whose only
 *     transactions came from a demo button has not recorded its first
 *     transaction. `sampleIds()` feeds the count queries an exclusion list so
 *     the two never get confused.
 *
 * The module is deliberately free of React and Supabase so the arithmetic can
 * be tested directly; `hooks/useOnboarding.ts` is the only thing that talks to
 * the database.
 */

/** The word every sample row carries, so it is identifiable in the ledger. */
export const SAMPLE_LABEL = "Sample";
export const SAMPLE_PREFIX = `${SAMPLE_LABEL} · `;

/** How many months ahead the sample goal is dated. */
const SAMPLE_GOAL_MONTHS = 6;

export type OnboardingStepId = "transaction" | "budget" | "goal";

export type OnboardingStep = {
  id: OnboardingStepId;
  /** The `accessMenus` id this step sends the user to. */
  menu: string;
  /** Table the step counts rows in. */
  table: "transactions" | "budgets" | "goals";
  title: string;
  blurb: string;
  href: string;
  cta: string;
};

/**
 * The three steps, in the order money actually moves: something happened, you
 * planned for it, you are saving towards something.
 *
 * All three are in the Free plan's menu set. A step whose menu the workspace
 * cannot open is dropped rather than shown as impossible — see `deriveSteps`.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "transaction",
    menu: "expenses",
    table: "transactions",
    title: "Record your first transaction",
    blurb: "Money in or out — one row is enough for the dashboard to come alive.",
    href: "/app/expenses",
    cta: "Add one",
  },
  {
    id: "budget",
    menu: "budget",
    table: "budgets",
    title: "Set a monthly budget",
    blurb: "Allocate a jar or two. Spending is matched against them automatically.",
    href: "/app/budget",
    cta: "Set a budget",
  },
  {
    id: "goal",
    menu: "goals",
    table: "goals",
    title: "Name one savings goal",
    blurb: "An emergency fund, a trip, a deposit — anything you are putting money aside for.",
    href: "/app/goals",
    cta: "Add a goal",
  },
];

/** Rows the sample loader created, so removal can be exact. */
export type SampleRecord = {
  /** ISO timestamp the sample was loaded. */
  at: string;
  transactions: string[];
  budgets: string[];
  goals: string[];
};

export type OnboardingState = {
  /**
   * `active` — the checklist is showing.
   * `done` — every step was satisfied; recorded so the counts stop being run.
   * `dismissed` — the user closed it. Both terminal states are permanent for
   * the workspace, because a checklist that comes back is a nag.
   */
  status: "active" | "done" | "dismissed";
  sample: SampleRecord | null;
};

export const DEFAULT_ONBOARDING: OnboardingState = { status: "active", sample: null };

/** Every id the sample loader created, in one list, for the exclusion filter. */
export function sampleIds(sample: SampleRecord | null): string[] {
  if (!sample) return [];
  return [...sample.transactions, ...sample.budgets, ...sample.goals];
}

export function sampleIdsFor(
  sample: SampleRecord | null,
  table: OnboardingStep["table"],
): string[] {
  if (!sample) return [];
  return sample[table] ?? [];
}

export type DerivedStep = OnboardingStep & { done: boolean };

/**
 * The steps this workspace should see, and whether each is satisfied.
 *
 * `counts` is the number of NON-sample rows in each table; `null` means the
 * count has not come back yet, which reads as "not done" rather than guessing.
 * A step whose menu is not accessible (plan or per-member permission) is left
 * out entirely — telling someone to open a page they cannot open is worse than
 * a shorter list.
 */
export function deriveSteps(
  counts: Partial<Record<OnboardingStepId, number | null>>,
  canAccess: (menu: string) => boolean,
  steps: readonly OnboardingStep[] = ONBOARDING_STEPS,
): DerivedStep[] {
  return steps
    .filter((s) => canAccess(s.menu))
    .map((s) => ({ ...s, done: (counts[s.id] ?? 0) > 0 }));
}

export function completedCount(steps: readonly DerivedStep[]): number {
  return steps.filter((s) => s.done).length;
}

/**
 * All steps satisfied. An empty list is NOT complete: it means the workspace
 * can reach none of the three menus, and flipping such a workspace to "done"
 * would silently retire the checklist for a plan upgrade that later grants
 * those menus.
 */
export function isComplete(steps: readonly DerivedStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.done);
}

/** Should the checklist render at all? */
export function shouldShowChecklist(state: OnboardingState, canManage: boolean): boolean {
  if (!canManage) return false; // a viewer cannot create any of it
  return state.status === "active";
}

// ---------------------------------------------------------------------------
// Sample workspace
// ---------------------------------------------------------------------------

export type SampleTransaction = {
  type: "income" | "expense";
  amount: number;
  currency: string;
  category: string;
  description: string;
  payment_mode: string | null;
  occurred_at: string;
};

export type SampleBudget = { bucket: string; allocated: number };

export type SampleGoal = {
  title: string;
  category: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date: string;
};

export type SamplePlan = {
  transactions: SampleTransaction[];
  budgets: SampleBudget[];
  goals: SampleGoal[];
};

/**
 * One household's two months, by calendar position rather than "days ago".
 *
 * 🔴 It was `daysAgo` first, and loading it on the 11th of the month put the
 * salary in the PREVIOUS month while three small expenses landed in this one —
 * so the dashboard, which shows the current month, greeted the user with
 * "monthly savings −₹5,849" and no income at all. Anchoring to the month is
 * the fix: `month: 0` is this month, `-1` the one before, and `day` is the day
 * of the month, clamped to today so nothing is ever dated in the future.
 *
 * The previous month exists so the month-over-month comparisons have two
 * points instead of one; the hours vary so the ledger does not show eleven
 * rows stamped with the same minute.
 */
const SAMPLE_LEDGER: {
  type: "income" | "expense";
  amount: number;
  category: string;
  label: string;
  mode: string | null;
  month: 0 | -1;
  day: number;
  hour: number;
}[] = [
  // Last month — enough to give the trend a second point.
  { type: "income", amount: 76500, category: "Salary", label: "Monthly salary", mode: "Net Banking", month: -1, day: 1, hour: 10 },
  { type: "expense", amount: 22000, category: "Rent", label: "Rent", mode: "Net Banking", month: -1, day: 2, hour: 9 },
  { type: "expense", amount: 2310, category: "Utilities", label: "Electricity bill", mode: "UPI", month: -1, day: 6, hour: 19 },
  { type: "expense", amount: 5980, category: "Food & Dining", label: "Groceries", mode: "UPI", month: -1, day: 9, hour: 18 },
  // This month.
  { type: "income", amount: 78000, category: "Salary", label: "Monthly salary", mode: "Net Banking", month: 0, day: 1, hour: 10 },
  { type: "income", amount: 12500, category: "Freelance", label: "Freelance invoice", mode: "Net Banking", month: 0, day: 9, hour: 16 },
  { type: "expense", amount: 22000, category: "Rent", label: "Rent", mode: "Net Banking", month: 0, day: 2, hour: 9 },
  { type: "expense", amount: 2480, category: "Utilities", label: "Electricity bill", mode: "UPI", month: 0, day: 5, hour: 20 },
  { type: "expense", amount: 899, category: "Utilities", label: "Broadband", mode: "Card", month: 0, day: 5, hour: 21 },
  { type: "expense", amount: 6400, category: "Food & Dining", label: "Groceries", mode: "UPI", month: 0, day: 6, hour: 11 },
  { type: "expense", amount: 1850, category: "Transport", label: "Fuel", mode: "Card", month: 0, day: 10, hour: 8 },
  { type: "expense", amount: 649, category: "Subscriptions", label: "Streaming subscription", mode: "Card", month: 0, day: 12, hour: 7 },
  { type: "expense", amount: 1450, category: "Entertainment", label: "Dinner out", mode: "Card", month: 0, day: 15, hour: 21 },
  { type: "expense", amount: 1299, category: "Shopping", label: "Household supplies", mode: "UPI", month: 0, day: 18, hour: 17 },
  { type: "expense", amount: 3100, category: "Food & Dining", label: "Groceries", mode: "UPI", month: 0, day: 22, hour: 12 },
];

/**
 * The sample workspace, dated around `now` so the period the dashboard is
 * showing is never empty.
 *
 * Amounts are deliberately unround and the month balances positive: a demo of
 * a household spending more than it earns teaches the wrong thing about what
 * the app is for.
 */
export function buildSamplePlan(now: Date, currency = "INR"): SamplePlan {
  const at = (month: 0 | -1, day: number, hour: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + month, day, hour, 0, 0, 0);
    // Never in the future: on the 3rd of the month, this month's later rows
    // collapse onto today rather than pretending to have happened.
    return (d > now ? now : d).toISOString();
  };

  const target = new Date(now.getTime());
  target.setMonth(target.getMonth() + SAMPLE_GOAL_MONTHS);

  return {
    transactions: SAMPLE_LEDGER.map((r) => ({
      type: r.type,
      amount: r.amount,
      currency,
      category: r.category,
      description: `${SAMPLE_PREFIX}${r.label}`,
      payment_mode: r.mode,
      occurred_at: at(r.month, r.day, r.hour),
    })),
    // Needs and Play only: the two jars the sample ledger actually feeds, so
    // every budget shown has real spend behind it rather than a flat zero.
    // Sized a little above this month's spend, so utilisation reads as a
    // household within its budget rather than one already over it.
    budgets: [
      { bucket: "Needs", allocated: 40000 },
      { bucket: "Play", allocated: 6000 },
    ],
    goals: [
      {
        title: `${SAMPLE_PREFIX}Emergency fund`,
        category: "Emergency Fund",
        target_amount: 250000,
        current_amount: 45000,
        currency,
        target_date: target.toISOString().slice(0, 10),
      },
    ],
  };
}

/** Total rows a sample load creates — shown before the user commits to it. */
export function samplePlanSize(plan: SamplePlan): number {
  return plan.transactions.length + plan.budgets.length + plan.goals.length;
}
