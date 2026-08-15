/**
 * Stage 5.7 — the status page's rules, with no React and no network in sight.
 *
 * A status page exists to answer one question during an outage: **is it me or
 * is it them?** Two sources answer it, and they disagree in a predictable way:
 *
 *  * **Live probes** run in the visitor's own browser. They are the only thing
 *    that can tell a user their own connection is the problem — but they cannot
 *    see a partial outage that misses their request.
 *  * **An operator notice**, edited from the PO console. It can describe things
 *    no probe can (a data issue, planned maintenance, a provider incident) and
 *    it is stale by definition.
 *
 * The rule is that **the worse of the two wins**. An operator saying "degraded"
 * must not be painted green by a probe that happened to succeed, and a green
 * notice must not hide a probe that is failing right now.
 */

/** Anon-readable `site_settings` key — the RLS policy allows `landing_*` to anon. */
export const STATUS_KEY = "landing_status";

export type ServiceState = "operational" | "degraded" | "down" | "checking";

/** What the operator can declare. `maintenance` is planned, and says so. */
export type NoticeState = "operational" | "degraded" | "outage" | "maintenance";

export interface StatusNotice {
  state: NoticeState;
  headline: string;
  detail: string;
  /** ISO timestamp, set when the notice is saved. */
  updated_at: string | null;
}

export const DEFAULT_NOTICE: StatusNotice = {
  state: "operational",
  headline: "",
  detail: "",
  updated_at: null,
};

export interface ServiceCheck {
  id: string;
  label: string;
  /** What this actually proves, in the visitor's terms. */
  description: string;
  state: ServiceState;
  /** Round-trip in ms, when it completed. */
  ms?: number;
  /** Why it failed, kept short enough to show. */
  error?: string;
}

/** Above this a service is up but unhappy; a page that only says up/down lies quietly. */
export const DEGRADED_MS = 1500;

export function stateForLatency(ms: number, degradedMs = DEGRADED_MS): ServiceState {
  return ms >= degradedMs ? "degraded" : "operational";
}

const SEVERITY: Record<ServiceState | NoticeState, number> = {
  checking: 0,
  operational: 1,
  maintenance: 2,
  degraded: 3,
  outage: 4,
  down: 4,
};

export function normalizeStatusNotice(value: unknown): StatusNotice {
  const v = value as Partial<StatusNotice> | null;
  if (!v || typeof v !== "object") return DEFAULT_NOTICE;
  const state = (["operational", "degraded", "outage", "maintenance"] as const).includes(
    v.state as NoticeState,
  )
    ? (v.state as NoticeState)
    : "operational";
  return {
    state,
    headline: typeof v.headline === "string" ? v.headline : "",
    detail: typeof v.detail === "string" ? v.detail : "",
    updated_at: typeof v.updated_at === "string" && v.updated_at ? v.updated_at : null,
  };
}

export interface OverallStatus {
  state: ServiceState | NoticeState;
  headline: string;
  /** True while any probe is still in flight — the page should not shout yet. */
  checking: boolean;
}

/**
 * The banner at the top of the page: the worse of what the operator declared
 * and what the probes are seeing right now.
 */
export function overallStatus(
  checks: readonly ServiceCheck[],
  notice: StatusNotice = DEFAULT_NOTICE,
): OverallStatus {
  const checking = checks.some((c) => c.state === "checking");
  const settled = checks.filter((c) => c.state !== "checking");

  let worst: ServiceState | NoticeState = "operational";
  for (const c of settled) {
    if (SEVERITY[c.state] > SEVERITY[worst]) worst = c.state;
  }
  if (SEVERITY[notice.state] > SEVERITY[worst]) worst = notice.state;

  // The operator's own words win whenever the operator is the reason we are
  // not green: they know something the probe does not.
  if (notice.headline && SEVERITY[notice.state] >= SEVERITY[worst]) {
    return { state: worst, headline: notice.headline, checking };
  }

  return { state: worst, headline: HEADLINES[worst], checking };
}

const HEADLINES: Record<ServiceState | NoticeState, string> = {
  checking: "Checking…",
  operational: "All systems operational",
  maintenance: "Planned maintenance",
  degraded: "Some things are slow",
  down: "We have a problem",
  outage: "We have a problem",
};

export const STATE_LABEL: Record<ServiceState | NoticeState, string> = {
  checking: "Checking",
  operational: "Operational",
  maintenance: "Maintenance",
  degraded: "Degraded",
  down: "Not reachable",
  outage: "Outage",
};

/**
 * Tailwind classes per state. Colour is never the only signal on the page —
 * every state also carries its label in words.
 */
export const STATE_TONE: Record<ServiceState | NoticeState, string> = {
  checking: "text-muted-foreground bg-muted/40 border-border/60",
  operational: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
  maintenance: "text-sky-500 bg-sky-500/10 border-sky-500/30",
  degraded: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  down: "text-destructive bg-destructive/10 border-destructive/30",
  outage: "text-destructive bg-destructive/10 border-destructive/30",
};

/** "2 minutes ago" for the notice timestamp; absolute dates read as stale. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((now.getTime() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
