import { resolveCurrentPlan, type PlanCatalogueRow } from "@/lib/menuUpsell";

/**
 * Stage 5.8 — activation, retention and conversion, derived rather than tracked.
 *
 * There is no analytics script in this product and no events table behind this
 * file. Every number below is computed from rows the database already keeps for
 * its own reasons: when a workspace was created, when its first transaction was
 * entered, which months it wrote anything in, when its members last signed in.
 *
 * Two consequences are worth stating plainly, because they shape what may be
 * asked of this module:
 *
 *  1. **It can see nothing an anonymous visitor does.** There is no
 *     landing-page → sign-up funnel here and no per-screen drop-off. It
 *     measures what people DID with the product, not what they browsed.
 *  2. **Reading leaves no trace.** A workspace someone opens every morning
 *     without editing anything looks dormant to `last_activity_at`, which is
 *     why `last_sign_in_at` is carried alongside it and why the liveness
 *     buckets use the later of the two.
 *
 * The module is free of React and Supabase so the arithmetic can be tested
 * directly; `hooks/usePoAnalytics.ts` is the only thing that talks to the
 * database.
 *
 * **Months are bucketed in UTC.** `po_tenant_activity_months()` truncates with
 * Postgres `date_trunc`, which on Supabase runs in UTC; bucketing locally here
 * would put a workspace created at 01:00 IST on the 1st into the previous
 * cohort and silently disagree with the retention matrix.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A row of `po_list_tenants()` — readable by the PO today. */
export interface TenantRow {
  id: string;
  name: string;
  status: string;
  owner_email: string | null;
  member_count: number;
  plan_name: string | null;
  sub_status: string | null;
  created_at: string;
}

/** A row of `po_tenant_engagement()` — needs the Stage 5.8 migration. */
export interface EngagementRow {
  tenant_id: string;
  first_transaction_at: string | null;
  first_budget_at: string | null;
  first_goal_at: string | null;
  last_activity_at: string | null;
  last_sign_in_at: string | null;
  transaction_count: number;
  active_members: number;
}

/** A row of `po_tenant_activity_months()`. `month` is `YYYY-MM-DD` (day 1). */
export interface ActivityMonthRow {
  tenant_id: string;
  month: string;
  events: number;
}

/** A workspace with whatever engagement facts are available for it. */
export interface AnalyticsWorkspace extends TenantRow {
  engagement: EngagementRow | null;
}

export function mergeWorkspaces(
  tenants: readonly TenantRow[],
  engagement: readonly EngagementRow[] | null,
): AnalyticsWorkspace[] {
  const byId = new Map<string, EngagementRow>();
  for (const e of engagement ?? []) byId.set(e.tenant_id, e);
  return tenants.map((t) => ({ ...t, engagement: byId.get(t.id) ?? null }));
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** `"2026-08-12T…"` → `"2026-08"`, or null when the timestamp is unusable. */
export function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `"2026-08"` → `"Aug 2026"`. Invalid keys come back unchanged. */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const idx = Number(m) - 1;
  if (!MONTH_NAMES[idx]) return key;
  return `${MONTH_NAMES[idx]} ${y}`;
}

/** The last `count` month keys, oldest first, ending with the month of `now`. */
export function recentMonthKeys(count: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    keys.push(monthKey(d.toISOString())!);
  }
  return keys;
}

/** Whole months from `from` to `to`. Negative when `to` precedes `from`. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Fractional days between two timestamps, or null if either is unusable. */
export function daysBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / MS_PER_DAY;
}

/** Share as a 0–1 fraction. A zero denominator is 0, never NaN on the screen. */
export function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Median of a sample, or null when the sample is empty. */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/**
 * The activation steps, in the order money actually moves — deliberately the
 * same three the first-run checklist uses (`lib/onboarding.ts`). If the two
 * ever disagree, the product is telling users one thing and the operator
 * another about what "set up" means.
 *
 * `budget` and `goal` are NOT sub-steps of `transaction`: a workspace can plan
 * before it records anything. Each stage counts independently, which is why
 * the funnel is allowed to widen and the page never draws it as a strict
 * pyramid.
 */
export type ActivationStepId = "transaction" | "budget" | "goal";

export const ACTIVATION_STEPS: readonly {
  id: ActivationStepId;
  label: string;
  field: keyof Pick<
    EngagementRow,
    "first_transaction_at" | "first_budget_at" | "first_goal_at"
  >;
}[] = [
  { id: "transaction", label: "Recorded a transaction", field: "first_transaction_at" },
  { id: "budget", label: "Set a budget", field: "first_budget_at" },
  { id: "goal", label: "Named a goal", field: "first_goal_at" },
];

export interface FunnelStage {
  id: string;
  label: string;
  count: number;
  /** Share of the workspaces the funnel started with. */
  fraction: number;
}

/**
 * Created → recorded → planned → saving → still alive.
 *
 * Workspaces with no engagement row are counted in the total but can satisfy
 * no step: a missing fact is not a completed one. When the migration has not
 * been applied every stage after the first therefore reads zero, which is why
 * the page gates the whole section rather than showing a flat funnel.
 */
export function activationFunnel(
  workspaces: readonly AnalyticsWorkspace[],
  now: Date = new Date(),
  activeWithinDays = 30,
): FunnelStage[] {
  const total = workspaces.length;
  const stages: FunnelStage[] = [
    { id: "created", label: "Workspace created", count: total, fraction: total ? 1 : 0 },
  ];
  for (const step of ACTIVATION_STEPS) {
    const count = workspaces.filter((w) => Boolean(w.engagement?.[step.field])).length;
    stages.push({ id: step.id, label: step.label, count, fraction: share(count, total) });
  }
  const live = workspaces.filter((w) => isLive(w, now, activeWithinDays)).length;
  stages.push({
    id: "retained",
    label: `Active in the last ${activeWithinDays} days`,
    count: live,
    fraction: share(live, total),
  });
  return stages;
}

/** The later of "wrote something" and "signed in" — see the note at the top. */
export function lastSeenAt(w: AnalyticsWorkspace): string | null {
  const e = w.engagement;
  if (!e) return null;
  const candidates = [e.last_activity_at, e.last_sign_in_at]
    .filter((v): v is string => Boolean(v) && Number.isFinite(Date.parse(v!)));
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

export function isLive(
  w: AnalyticsWorkspace,
  now: Date = new Date(),
  withinDays = 30,
): boolean {
  const seen = lastSeenAt(w);
  const days = daysBetween(seen, now.toISOString());
  return days !== null && days <= withinDays;
}

export interface ActivationTiming {
  /** Days from workspace creation to first transaction. */
  medianDays: number | null;
  sameDay: number;
  withinWeek: number;
  /** Workspaces that ever recorded one — the denominator for the two above. */
  activated: number;
  /** Workspaces old enough to judge, i.e. created more than `graceDays` ago. */
  eligible: number;
}

/**
 * How long activation takes, measured only on workspaces old enough to have
 * had the chance.
 *
 * A workspace created an hour ago has not "failed to activate", and counting it
 * as a failure makes every good week look like a bad one — the newer the
 * signups, the worse the number. `graceDays` is the cut-off.
 */
export function activationTiming(
  workspaces: readonly AnalyticsWorkspace[],
  now: Date = new Date(),
  graceDays = 7,
): ActivationTiming {
  const nowIso = now.toISOString();
  const eligible = workspaces.filter((w) => {
    const age = daysBetween(w.created_at, nowIso);
    return age !== null && age >= graceDays;
  });
  const gaps: number[] = [];
  for (const w of eligible) {
    const d = daysBetween(w.created_at, w.engagement?.first_transaction_at);
    // A negative gap means an imported row was stamped before the workspace
    // existed. Clamp rather than drop: it activated, on day zero.
    if (d !== null) gaps.push(Math.max(d, 0));
  }
  return {
    medianDays: median(gaps),
    sameDay: gaps.filter((d) => d < 1).length,
    withinWeek: gaps.filter((d) => d <= 7).length,
    activated: gaps.length,
    eligible: eligible.length,
  };
}

// ---------------------------------------------------------------------------
// Liveness
// ---------------------------------------------------------------------------

export type LivenessBucketId = "week" | "month" | "quarter" | "dormant" | "silent";

export interface LivenessBucket {
  id: LivenessBucketId;
  label: string;
  count: number;
  fraction: number;
}

const LIVENESS: { id: LivenessBucketId; label: string; maxDays: number | null }[] = [
  { id: "week", label: "Last 7 days", maxDays: 7 },
  { id: "month", label: "8–30 days", maxDays: 30 },
  { id: "quarter", label: "31–90 days", maxDays: 90 },
  { id: "dormant", label: "Over 90 days", maxDays: null },
];

/**
 * How recently each workspace was last seen. `silent` is its own bucket rather
 * than the worst one: a workspace that has never been seen at all is a
 * different problem from one that was used and stopped.
 */
export function livenessBuckets(
  workspaces: readonly AnalyticsWorkspace[],
  now: Date = new Date(),
): LivenessBucket[] {
  const nowIso = now.toISOString();
  const counts = new Map<LivenessBucketId, number>();
  for (const w of workspaces) {
    const days = daysBetween(lastSeenAt(w), nowIso);
    const id: LivenessBucketId =
      days === null ? "silent" : (LIVENESS.find((b) => b.maxDays !== null && days <= b.maxDays)?.id ?? "dormant");
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const total = workspaces.length;
  return [...LIVENESS, { id: "silent" as const, label: "Never seen", maxDays: null }].map((b) => ({
    id: b.id,
    label: b.label,
    count: counts.get(b.id) ?? 0,
    fraction: share(counts.get(b.id) ?? 0, total),
  }));
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

export interface GrowthPoint {
  month: string;
  label: string;
  created: number;
  /** Of those created that month, how many ever recorded a transaction. */
  activated: number;
  /** Of those created that month, how many are on a paid plan now. */
  paid: number;
  /** Running total of workspaces created up to and including this month. */
  cumulative: number;
}

/**
 * Signups by cohort month.
 *
 * `activated` and `paid` are properties of the cohort measured TODAY, not of
 * the month — a workspace created in June that paid in August counts in June's
 * `paid`. That is the useful reading ("was June a good month?"); it also means
 * the newest cohorts are always the weakest, and the page says so.
 */
export function growthByMonth(
  workspaces: readonly AnalyticsWorkspace[],
  months: number,
  plans: readonly PlanCatalogueRow[],
  now: Date = new Date(),
): GrowthPoint[] {
  const keys = recentMonthKeys(months, now);
  const index = new Map(keys.map((k, i) => [k, i]));
  const points: GrowthPoint[] = keys.map((k) => ({
    month: k,
    label: monthLabel(k),
    created: 0,
    activated: 0,
    paid: 0,
    cumulative: 0,
  }));

  // Everything older than the window still counts towards the running total.
  let carried = 0;
  for (const w of workspaces) {
    const key = monthKey(w.created_at);
    if (!key) continue;
    const i = index.get(key);
    if (i === undefined) {
      if (key < keys[0]) carried++;
      continue;
    }
    points[i].created++;
    if (w.engagement?.first_transaction_at) points[i].activated++;
    if (isPaying(w, plans)) points[i].paid++;
  }

  let running = carried;
  for (const p of points) {
    running += p.created;
    p.cumulative = running;
  }
  return points;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Is this workspace paying?
 *
 * Not "does it have a subscription row" — every workspace assigned the free
 * plan has one of those. `resolveCurrentPlan` mirrors SQL `plan_menus()`, so an
 * expired subscription resolves to the default plan and is correctly counted as
 * free. Paid means the plan actually in force costs money.
 */
export function isPaying(
  w: AnalyticsWorkspace,
  plans: readonly PlanCatalogueRow[],
): boolean {
  const plan = resolveCurrentPlan([...plans], {
    plan_name: w.plan_name,
    status: w.sub_status,
  });
  return Boolean(plan && plan.price_cents > 0);
}

export interface ConversionSummary {
  total: number;
  paying: number;
  free: number;
  /** Was paying, is not any more — an expired or cancelled subscription. */
  lapsed: number;
  rate: number;
  /** Monthly recurring revenue in minor units, from the plans in force. */
  mrrCents: number;
  currency: string;
}

const LAPSED_STATUSES = new Set(["expired", "canceled", "cancelled", "past_due", "paused"]);

export function conversionSummary(
  workspaces: readonly AnalyticsWorkspace[],
  plans: readonly PlanCatalogueRow[],
): ConversionSummary {
  let paying = 0;
  let lapsed = 0;
  let mrrCents = 0;
  for (const w of workspaces) {
    if (isPaying(w, plans)) {
      paying++;
      const plan = resolveCurrentPlan([...plans], {
        plan_name: w.plan_name,
        status: w.sub_status,
      });
      // Yearly plans are divided down so the total is comparable month to month.
      const perMonth = plan
        ? plan.interval === "year"
          ? Math.round(plan.price_cents / 12)
          : plan.price_cents
        : 0;
      mrrCents += perMonth;
    } else if (w.plan_name && LAPSED_STATUSES.has((w.sub_status ?? "").toLowerCase())) {
      lapsed++;
    }
  }
  const total = workspaces.length;
  return {
    total,
    paying,
    free: total - paying,
    lapsed,
    rate: share(paying, total),
    mrrCents,
    currency: plans.find((p) => p.price_cents > 0)?.currency ?? "INR",
  };
}

export interface PlanMixRow {
  name: string;
  count: number;
  fraction: number;
  priceCents: number;
}

/** Workspaces per plan actually in force — not per subscription row. */
export function planMix(
  workspaces: readonly AnalyticsWorkspace[],
  plans: readonly PlanCatalogueRow[],
): PlanMixRow[] {
  const counts = new Map<string, number>();
  for (const w of workspaces) {
    const plan = resolveCurrentPlan([...plans], {
      plan_name: w.plan_name,
      status: w.sub_status,
    });
    const name = plan?.name ?? "No plan";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const total = workspaces.length;
  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      fraction: share(count, total),
      priceCents: plans.find((p) => p.name === name)?.price_cents ?? 0,
    }))
    .sort((a, b) => a.priceCents - b.priceCents || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export interface RetentionCohort {
  month: string;
  label: string;
  /** Workspaces created in this month. */
  size: number;
  /**
   * `active[n]` = how many of them wrote something in month + n. Index 0 is
   * the signup month itself and is NOT automatically the whole cohort — a
   * workspace that signed up and never returned is absent from it.
   *
   * The array stops at the current month: a cohort from last month has no
   * "three months later" yet, and rendering that as 0% would invent churn.
   */
  active: number[];
}

export interface RetentionMatrix {
  cohorts: RetentionCohort[];
  /** Widest `active` array, so the table knows how many columns to draw. */
  maxOffset: number;
}

/**
 * Real cohort retention, from the months each workspace wrote something in.
 *
 * This is possible without an events table only because every finance row
 * carries `created_at`; `po_tenant_activity_months()` reduces those to
 * (workspace, month) pairs before they ever leave the database.
 */
export function retentionMatrix(
  workspaces: readonly AnalyticsWorkspace[],
  activity: readonly ActivityMonthRow[],
  months: number,
  now: Date = new Date(),
): RetentionMatrix {
  const active = new Map<string, Set<string>>();
  for (const row of activity) {
    const key = monthKey(row.month);
    if (!key || row.events <= 0) continue;
    let set = active.get(row.tenant_id);
    if (!set) active.set(row.tenant_id, (set = new Set()));
    set.add(key);
  }

  const keys = recentMonthKeys(months, now);
  const current = keys[keys.length - 1];
  const byCohort = new Map<string, AnalyticsWorkspace[]>();
  for (const w of workspaces) {
    const key = monthKey(w.created_at);
    if (!key || !keys.includes(key)) continue;
    const list = byCohort.get(key);
    if (list) list.push(w);
    else byCohort.set(key, [w]);
  }

  let maxOffset = 0;
  const cohorts: RetentionCohort[] = keys
    .filter((k) => byCohort.has(k))
    .map((k) => {
      const members = byCohort.get(k)!;
      const span = monthsBetween(k, current);
      const counts: number[] = [];
      for (let n = 0; n <= span; n++) {
        const target = addMonths(k, n);
        counts.push(members.filter((w) => active.get(w.id)?.has(target)).length);
      }
      maxOffset = Math.max(maxOffset, counts.length - 1);
      return { month: k, label: monthLabel(k), size: members.length, active: counts };
    })
    .reverse();

  return { cohorts, maxOffset };
}

/** `"2026-08" + 3` → `"2026-11"`. */
export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return monthKey(d.toISOString())!;
}
