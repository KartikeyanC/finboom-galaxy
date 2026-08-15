import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative, sep } from "node:path";
import {
  ACTIVATION_STEPS,
  activationFunnel,
  activationTiming,
  addMonths,
  conversionSummary,
  daysBetween,
  growthByMonth,
  isPaying,
  lastSeenAt,
  livenessBuckets,
  median,
  mergeWorkspaces,
  monthKey,
  monthLabel,
  monthsBetween,
  planMix,
  recentMonthKeys,
  retentionMatrix,
  share,
  type ActivityMonthRow,
  type AnalyticsWorkspace,
  type EngagementRow,
  type TenantRow,
} from "./analytics";
import { ONBOARDING_STEPS } from "./onboarding";
import { type PlanCatalogueRow } from "./menuUpsell";

/**
 * Stage 5.8. These numbers are the ones an operator would act on — stop
 * building, change the onboarding, raise the price — so the failure that
 * matters is not a crash but a plausible wrong answer. Most of what follows
 * pins a definition rather than a calculation.
 */

const NOW = new Date("2026-08-12T12:00:00Z");

const tenant = (over: Partial<TenantRow> = {}): TenantRow => ({
  id: over.id ?? "t1",
  name: "Workspace",
  status: "active",
  owner_email: "a@example.com",
  member_count: 1,
  plan_name: null,
  sub_status: null,
  created_at: "2026-08-01T00:00:00Z",
  ...over,
});

const engagement = (over: Partial<EngagementRow> = {}): EngagementRow => ({
  tenant_id: over.tenant_id ?? "t1",
  first_transaction_at: null,
  first_budget_at: null,
  first_goal_at: null,
  last_activity_at: null,
  last_sign_in_at: null,
  transaction_count: 0,
  active_members: 1,
  ...over,
});

const ws = (t: Partial<TenantRow>, e: Partial<EngagementRow> | null = null): AnalyticsWorkspace => ({
  ...tenant(t),
  engagement: e ? engagement({ tenant_id: t.id ?? "t1", ...e }) : null,
});

const plan = (name: string, price_cents: number, over: Partial<PlanCatalogueRow> = {}): PlanCatalogueRow => ({
  id: name.toLowerCase(),
  name,
  price_cents,
  currency: "INR",
  interval: "month",
  is_active: true,
  is_default: false,
  created_at: "2026-01-01T00:00:00Z",
  menu_set: ["*"],
  ...over,
});

const PLANS: PlanCatalogueRow[] = [
  plan("Roots", 0, { is_default: true }),
  plan("Canopy", 29900),
  plan("Forest", 499900, { interval: "year" }),
];

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

describe("month helpers", () => {
  it("buckets in UTC, so a late-evening IST signup keeps its own month", () => {
    // 2026-07-31T20:00Z is 2026-08-01 01:30 in India. Postgres date_trunc runs
    // in UTC, so bucketing locally here would disagree with the retention data.
    expect(monthKey("2026-07-31T20:00:00Z")).toBe("2026-07");
    expect(monthKey("2026-08-01T00:30:00Z")).toBe("2026-08");
  });

  it("refuses unusable timestamps instead of inventing a month", () => {
    expect(monthKey(null)).toBeNull();
    expect(monthKey("")).toBeNull();
    expect(monthKey("not a date")).toBeNull();
  });

  it("labels and walks months across a year boundary", () => {
    expect(monthLabel("2026-08")).toBe("Aug 2026");
    expect(monthLabel("nonsense")).toBe("nonsense");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-02", -3)).toBe("2025-11");
    expect(monthsBetween("2025-11", "2026-02")).toBe(3);
    expect(monthsBetween("2026-02", "2025-11")).toBe(-3);
  });

  it("ends the recent-month window on the current month", () => {
    expect(recentMonthKeys(3, NOW)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(recentMonthKeys(1, NOW)).toEqual(["2026-08"]);
  });

  it("keeps a zero denominator off the screen", () => {
    expect(share(0, 0)).toBe(0);
    expect(share(1, 4)).toBe(0.25);
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(daysBetween(null, NOW.toISOString())).toBeNull();
    expect(daysBetween("2026-08-10T12:00:00Z", "2026-08-12T12:00:00Z")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

describe("mergeWorkspaces", () => {
  it("leaves engagement null when the migration has not been applied", () => {
    const rows = mergeWorkspaces([tenant({ id: "a" }), tenant({ id: "b" })], null);
    expect(rows.map((r) => r.engagement)).toEqual([null, null]);
  });

  it("matches on tenant id and tolerates a workspace with no engagement row", () => {
    const rows = mergeWorkspaces(
      [tenant({ id: "a" }), tenant({ id: "b" })],
      [engagement({ tenant_id: "b", transaction_count: 9 })],
    );
    expect(rows[0].engagement).toBeNull();
    expect(rows[1].engagement?.transaction_count).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

describe("activation", () => {
  it("uses the same three steps the first-run checklist does", () => {
    // If these drift apart the product and the console disagree about what
    // "set up" means, and only one of them is talking to the user.
    expect(ACTIVATION_STEPS.map((s) => s.id)).toEqual(ONBOARDING_STEPS.map((s) => s.id));
  });

  it("counts a missing engagement row as unactivated, never as complete", () => {
    const rows = [
      ws({ id: "a" }, { first_transaction_at: "2026-08-02T00:00:00Z" }),
      ws({ id: "b" }, {}),
      ws({ id: "c" }), // no engagement row at all
    ];
    const f = activationFunnel(rows, NOW);
    expect(f[0]).toMatchObject({ id: "created", count: 3, fraction: 1 });
    expect(f[1]).toMatchObject({ id: "transaction", count: 1 });
    expect(f[1].fraction).toBeCloseTo(1 / 3);
  });

  it("lets the funnel widen, because budgets are not downstream of transactions", () => {
    const rows = [
      ws({ id: "a" }, { first_budget_at: "2026-08-03T00:00:00Z" }),
      ws({ id: "b" }, { first_budget_at: "2026-08-03T00:00:00Z" }),
    ];
    const f = activationFunnel(rows, NOW);
    expect(f.find((s) => s.id === "transaction")!.count).toBe(0);
    expect(f.find((s) => s.id === "budget")!.count).toBe(2);
  });

  it("survives an empty platform without dividing by zero", () => {
    const f = activationFunnel([], NOW);
    expect(f.every((s) => s.count === 0 && s.fraction === 0)).toBe(true);
  });

  it("takes the later of writing and signing in as last seen", () => {
    const w = ws({ id: "a" }, {
      last_activity_at: "2026-08-01T00:00:00Z",
      last_sign_in_at: "2026-08-10T00:00:00Z",
    });
    expect(lastSeenAt(w)).toBe("2026-08-10T00:00:00Z");
    // A workspace that is read daily but never edited is still alive.
    expect(lastSeenAt(ws({ id: "b" }, { last_sign_in_at: "2026-08-11T00:00:00Z" })))
      .toBe("2026-08-11T00:00:00Z");
    expect(lastSeenAt(ws({ id: "c" }, {}))).toBeNull();
    expect(lastSeenAt(ws({ id: "d" }))).toBeNull();
  });

  it("ignores an unparseable timestamp rather than ranking it as newest", () => {
    const w = ws({ id: "a" }, {
      last_activity_at: "2026-08-05T00:00:00Z",
      last_sign_in_at: "who knows",
    });
    expect(lastSeenAt(w)).toBe("2026-08-05T00:00:00Z");
  });
});

describe("activationTiming", () => {
  it("does not count a workspace created yesterday as a failure", () => {
    // 🔴 The bug this pins: without the grace period, a good week of signups
    // drags activation DOWN, because the newest workspaces have not had a
    // chance yet. Ten fresh signups would read as 0% activated.
    const fresh = Array.from({ length: 10 }, (_, i) =>
      ws({ id: `new${i}`, created_at: "2026-08-11T00:00:00Z" }, {}),
    );
    const old = ws(
      { id: "old", created_at: "2026-07-01T00:00:00Z" },
      { first_transaction_at: "2026-07-02T00:00:00Z" },
    );
    const t = activationTiming([...fresh, old], NOW);
    expect(t.eligible).toBe(1);
    expect(t.activated).toBe(1);
    expect(t.medianDays).toBe(1);
  });

  it("reports the median gap and the same-day share", () => {
    const rows = [
      ws({ id: "a", created_at: "2026-07-01T00:00:00Z" }, { first_transaction_at: "2026-07-01T06:00:00Z" }),
      ws({ id: "b", created_at: "2026-07-01T00:00:00Z" }, { first_transaction_at: "2026-07-04T00:00:00Z" }),
      ws({ id: "c", created_at: "2026-07-01T00:00:00Z" }, { first_transaction_at: "2026-07-20T00:00:00Z" }),
      ws({ id: "d", created_at: "2026-07-01T00:00:00Z" }, {}),
    ];
    const t = activationTiming(rows, NOW);
    expect(t.eligible).toBe(4);
    expect(t.activated).toBe(3);
    expect(t.medianDays).toBe(3);
    expect(t.sameDay).toBe(1);
    expect(t.withinWeek).toBe(2);
  });

  it("clamps an imported row stamped before the workspace existed", () => {
    const rows = [
      ws({ id: "a", created_at: "2026-07-01T00:00:00Z" }, { first_transaction_at: "2026-06-20T00:00:00Z" }),
    ];
    expect(activationTiming(rows, NOW).medianDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Liveness
// ---------------------------------------------------------------------------

describe("livenessBuckets", () => {
  it("separates never-seen from long-dormant", () => {
    const rows = [
      ws({ id: "a" }, { last_activity_at: "2026-08-11T00:00:00Z" }),
      ws({ id: "b" }, { last_activity_at: "2026-07-25T00:00:00Z" }),
      ws({ id: "c" }, { last_activity_at: "2026-06-20T00:00:00Z" }),
      ws({ id: "d" }, { last_activity_at: "2026-01-01T00:00:00Z" }),
      ws({ id: "e" }, {}),
    ];
    const b = Object.fromEntries(livenessBuckets(rows, NOW).map((x) => [x.id, x.count]));
    expect(b).toEqual({ week: 1, month: 1, quarter: 1, dormant: 1, silent: 1 });
  });

  it("puts every workspace in exactly one bucket", () => {
    const rows = [
      ws({ id: "a" }, { last_activity_at: "2026-08-12T00:00:00Z" }),
      ws({ id: "b" }, { last_sign_in_at: "2026-05-01T00:00:00Z" }),
      ws({ id: "c" }),
    ];
    const buckets = livenessBuckets(rows, NOW);
    expect(buckets.reduce((n, x) => n + x.count, 0)).toBe(rows.length);
    expect(buckets.reduce((n, x) => n + x.fraction, 0)).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

describe("conversion", () => {
  it("counts an expired paid subscription as free, not as paying", () => {
    // 🔴 The whole reason isPaying goes through resolveCurrentPlan: reading the
    // plan name off the subscription would bill an expired customer in the
    // dashboard while the app itself has already dropped them to Roots.
    expect(isPaying(ws({ id: "a", plan_name: "Canopy", sub_status: "expired" }), PLANS)).toBe(false);
    expect(isPaying(ws({ id: "b", plan_name: "Canopy", sub_status: "active" }), PLANS)).toBe(true);
    expect(isPaying(ws({ id: "c", plan_name: "Canopy", sub_status: "trialing" }), PLANS)).toBe(true);
  });

  it("counts a workspace on the free plan as free, not as unplanned", () => {
    expect(isPaying(ws({ id: "a", plan_name: "Roots", sub_status: "active" }), PLANS)).toBe(false);
    expect(isPaying(ws({ id: "b" }), PLANS)).toBe(false);
  });

  it("summarises rate, lapsed and MRR with yearly plans divided down", () => {
    const rows = [
      ws({ id: "a", plan_name: "Canopy", sub_status: "active" }),
      ws({ id: "b", plan_name: "Forest", sub_status: "active" }),
      ws({ id: "c", plan_name: "Canopy", sub_status: "expired" }),
      ws({ id: "d" }),
    ];
    const s = conversionSummary(rows, PLANS);
    expect(s).toMatchObject({ total: 4, paying: 2, free: 2, lapsed: 1 });
    expect(s.rate).toBe(0.5);
    expect(s.mrrCents).toBe(29900 + Math.round(499900 / 12));
    expect(s.currency).toBe("INR");
  });

  it("reports zeroes rather than NaN on an empty platform", () => {
    expect(conversionSummary([], PLANS)).toMatchObject({ total: 0, paying: 0, rate: 0, mrrCents: 0 });
  });

  it("mixes plans by what is in force, cheapest first", () => {
    const rows = [
      ws({ id: "a", plan_name: "Canopy", sub_status: "active" }),
      ws({ id: "b", plan_name: "Canopy", sub_status: "expired" }),
      ws({ id: "c" }),
    ];
    const mix = planMix(rows, PLANS);
    expect(mix.map((m) => [m.name, m.count])).toEqual([
      ["Roots", 2],
      ["Canopy", 1],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

describe("growthByMonth", () => {
  it("carries workspaces older than the window into the running total", () => {
    // Otherwise a three-month view reports a platform that started three
    // months ago, and every cumulative line is wrong by the whole back
    // catalogue.
    const rows = [
      ws({ id: "old", created_at: "2025-12-01T00:00:00Z" }),
      ws({ id: "a", created_at: "2026-07-04T00:00:00Z" }),
      ws({ id: "b", created_at: "2026-08-02T00:00:00Z" }),
    ];
    const g = growthByMonth(rows, 3, PLANS, NOW);
    expect(g.map((p) => p.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(g.map((p) => p.created)).toEqual([0, 1, 1]);
    expect(g.map((p) => p.cumulative)).toEqual([1, 2, 3]);
  });

  it("credits activation and payment to the month the workspace was created", () => {
    const rows = [
      ws(
        { id: "a", created_at: "2026-06-10T00:00:00Z", plan_name: "Canopy", sub_status: "active" },
        { first_transaction_at: "2026-08-01T00:00:00Z" },
      ),
    ];
    const g = growthByMonth(rows, 3, PLANS, NOW);
    expect(g[0]).toMatchObject({ month: "2026-06", created: 1, activated: 1, paid: 1 });
    expect(g[2]).toMatchObject({ month: "2026-08", created: 0, activated: 0, paid: 0 });
  });

  it("ignores a workspace whose created_at is unusable", () => {
    const g = growthByMonth([ws({ id: "x", created_at: "" })], 2, PLANS, NOW);
    expect(g.reduce((n, p) => n + p.created, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

describe("retentionMatrix", () => {
  const activity = (tenant_id: string, months: string[], events = 3): ActivityMonthRow[] =>
    months.map((m) => ({ tenant_id, month: `${m}-01`, events }));

  it("stops each cohort at the current month instead of inventing churn", () => {
    // 🔴 A cohort created last month has no "three months later" yet. Padding
    // the row with zeroes would show a brand-new cohort as having churned
    // completely — the newer the cohort, the worse it would look.
    const rows = [
      ws({ id: "a", created_at: "2026-06-05T00:00:00Z" }),
      ws({ id: "b", created_at: "2026-08-05T00:00:00Z" }),
    ];
    const m = retentionMatrix(rows, [], 6, NOW);
    const june = m.cohorts.find((c) => c.month === "2026-06")!;
    const august = m.cohorts.find((c) => c.month === "2026-08")!;
    expect(june.active).toHaveLength(3); // Jun, Jul, Aug
    expect(august.active).toHaveLength(1); // Aug only
    expect(m.maxOffset).toBe(2);
  });

  it("counts a workspace only in the months it actually wrote something", () => {
    const rows = [
      ws({ id: "a", created_at: "2026-06-05T00:00:00Z" }),
      ws({ id: "b", created_at: "2026-06-20T00:00:00Z" }),
    ];
    const act = [...activity("a", ["2026-06", "2026-07", "2026-08"]), ...activity("b", ["2026-06"])];
    const june = retentionMatrix(rows, act, 6, NOW).cohorts.find((c) => c.month === "2026-06")!;
    expect(june.size).toBe(2);
    expect(june.active).toEqual([2, 1, 1]);
  });

  it("does not assume month zero is the whole cohort", () => {
    // Signing up and never returning is a real outcome and must be visible.
    const rows = [ws({ id: "a", created_at: "2026-07-05T00:00:00Z" })];
    const july = retentionMatrix(rows, [], 6, NOW).cohorts.find((c) => c.month === "2026-07")!;
    expect(july.size).toBe(1);
    expect(july.active[0]).toBe(0);
  });

  it("ignores an empty activity month", () => {
    const rows = [ws({ id: "a", created_at: "2026-07-05T00:00:00Z" })];
    const act: ActivityMonthRow[] = [{ tenant_id: "a", month: "2026-07-01", events: 0 }];
    expect(retentionMatrix(rows, act, 6, NOW).cohorts[0].active[0]).toBe(0);
  });

  it("lists the newest cohort first and omits months nobody signed up in", () => {
    const rows = [
      ws({ id: "a", created_at: "2026-06-05T00:00:00Z" }),
      ws({ id: "b", created_at: "2026-08-05T00:00:00Z" }),
    ];
    expect(retentionMatrix(rows, [], 6, NOW).cohorts.map((c) => c.month)).toEqual([
      "2026-08",
      "2026-06",
    ]);
  });

  it("drops workspaces created before the window rather than misfiling them", () => {
    const rows = [ws({ id: "old", created_at: "2024-01-05T00:00:00Z" })];
    expect(retentionMatrix(rows, [], 3, NOW).cohorts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The claim the privacy policy makes
// ---------------------------------------------------------------------------

const SRC = resolve(__dirname, "..");
const ROOT = resolve(SRC, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });

/**
 * 🔴 The privacy policy says, in the summary a prospective customer reads
 * first, that there is no analytics or tracking script on this site. Stage 5.8
 * measures the product WITHOUT one, and this test is what keeps the sentence
 * from quietly becoming a lie the day somebody drops in a snippet.
 */
describe("analytics stays derived, not tracked", () => {
  const VENDORS =
    /googletagmanager|google-analytics|\bgtag\s*\(|posthog|plausible\.io|mixpanel|amplitude\.com|cdn\.segment\.com|analytics\.js|hotjar|clarity\.ms|fullstory|matomo|\bpiwik\b/i;

  it("has no third-party analytics snippet in the app source", () => {
    const offenders = walk(SRC)
      .filter((f) => VENDORS.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).split(sep).join("/"));
    expect(offenders, "the privacy policy promises there is no tracking script").toEqual([]);
  });

  it("has no analytics snippet in the HTML shell either", () => {
    // The one file a script tag is easiest to paste into, and the one place
    // scanning src/ would never look.
    expect(VENDORS.test(readFileSync(join(ROOT, "index.html"), "utf8"))).toBe(false);
  });

  it("has no analytics vendor among the dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(names.filter((n) => VENDORS.test(n))).toEqual([]);
  });

  it("keeps the policy's own wording in step with that", () => {
    const policy = readFileSync(join(SRC, "pages/legal/PrivacyPolicy.tsx"), "utf8");
    // The old sentence claimed we do not measure the product at all. We now do,
    // by counting existing records — the policy has to say so.
    expect(policy).not.toMatch(/We do not currently run product analytics/);
    expect(policy).toMatch(/no analytics script/i);
  });
});
