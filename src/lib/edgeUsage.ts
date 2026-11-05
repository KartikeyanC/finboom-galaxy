/**
 * Stage 5.9 — edge-function usage against its limits, for /po.
 *
 * The counting and alerting happen in Postgres (`record_edge_call`,
 * migration 20261105120000); this only reads the hourly rows back and works
 * out what the card shows. `limitsFor` must agree with the SQL: built-in
 * defaults, then the "default" entry, then the function's own entry, field by
 * field.
 */

export type EdgeLimit = { hour: number | null; day: number | null; error_rate: number | null };
export type EdgeLimits = Record<string, Partial<EdgeLimit>>;
export type UsageRow = { fn: string; hour: string; calls: number; errors: number };

export const BUILT_IN_LIMIT: EdgeLimit = { hour: 2000, day: 20000, error_rate: 0.2 };
export const LIMITS_KEY = "edge_usage_limits";

/** Every function that records usage (supabase/functions, metered()). */
export const METERED_FUNCTIONS = [
  "aa-webhook",
  "billing-api",
  "email-ingest",
  "live-price",
  "payments-webhook",
  "po-auth",
  "scan-receipt",
  "send-email",
] as const;

export function limitsFor(fn: string, limits: EdgeLimits | null | undefined): EdgeLimit {
  return { ...BUILT_IN_LIMIT, ...(limits?.default ?? {}), ...(limits?.[fn] ?? {}) };
}

export type FnUsage = {
  fn: string;
  lastHour: number;
  today: number;
  day24: number;
  errors24: number;
  limit: EdgeLimit;
  /** The larger of hour-used and today-used, as a share of its limit. */
  load: number;
  over: boolean;
  /** At least 10 failures in 24 h, at or above the error-rate limit. */
  failing: boolean;
};

/**
 * One line per function, busiest first. "Last hour" is the current clock
 * hour and "today" the current UTC day — the same windows the alerts use.
 */
export function summarise(
  rows: UsageRow[],
  limits: EdgeLimits | null | undefined,
  now = new Date(),
): FnUsage[] {
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  const since = now.getTime() - 24 * 3_600_000;

  const names = new Set<string>([...METERED_FUNCTIONS, ...rows.map((r) => r.fn)]);
  const out: FnUsage[] = [];
  for (const fn of names) {
    let lastHour = 0;
    let today = 0;
    let day24 = 0;
    let errors24 = 0;
    for (const r of rows) {
      if (r.fn !== fn) continue;
      const t = Date.parse(r.hour);
      if (t === hour.getTime()) lastHour += r.calls;
      if (t >= day.getTime()) today += r.calls;
      if (t > since - 3_600_000) {
        day24 += r.calls;
        errors24 += r.errors;
      }
    }
    const limit = limitsFor(fn, limits);
    const load = Math.max(
      limit.hour ? lastHour / limit.hour : 0,
      limit.day ? today / limit.day : 0,
    );
    const failing =
      limit.error_rate != null && errors24 >= 10 && errors24 / day24 >= limit.error_rate;
    out.push({ fn, lastHour, today, day24, errors24, limit, load, over: load > 1, failing });
  }
  return out.sort((a, b) => b.load - a.load || b.day24 - a.day24 || a.fn.localeCompare(b.fn));
}

/** "relation does not exist": the migration has not been applied yet. */
export function isNotApplied(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "42P01" || e?.code === "PGRST205" || /does not exist|schema cache/i.test(e?.message ?? "");
}
