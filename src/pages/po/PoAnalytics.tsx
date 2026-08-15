import { useMemo } from "react";
import { BarChart3, Sparkles, TrendingUp, Users, Wallet, AlertTriangle } from "lucide-react";
import { usePoAnalytics, ANALYTICS_MONTHS } from "@/hooks/usePoAnalytics";
import {
  activationFunnel,
  activationTiming,
  conversionSummary,
  formatPercent,
  growthByMonth,
  livenessBuckets,
  planMix,
  retentionMatrix,
  share,
} from "@/lib/analytics";

/**
 * Stage 5.8 — activation, retention and conversion for the operator.
 *
 * Every number on this page is derived from records the product already keeps.
 * Nothing here was tracked, which is why the page ends by saying what it cannot
 * see: a chart that does not admit its blind spot gets trusted for questions it
 * cannot answer.
 */

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className={`h-4 w-4 ${tone ?? "text-primary"}`} /> {label}
      </div>
      <div className="mt-2 text-2xl font-display font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * What a section shows when the 5.8 migration has not been applied.
 *
 * 🔴 Not zeroes. Every bar in these sections would read 0% — "nobody activated,
 * nobody came back" — when the truth is that the database cannot answer yet.
 * An unknown that looks like bad news is worse than a blank.
 */
function Unavailable() {
  return (
    <p className="text-xs text-muted-foreground">
      Waiting on migration <code>20260812120000_stage5_analytics.sql</code>. Showing nothing here
      rather than zeroes, which would read as a result.
    </p>
  );
}

/** A labelled proportion bar. The number is always written out beside it. */
function Bar({ label, count, fraction }: { label: string; count: number; fraction: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {count} <span className="text-muted-foreground">· {formatPercent(fraction)}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.round(fraction * 100))}%` }}
        />
      </div>
    </div>
  );
}

function rupees(cents: number): string {
  return `₹${Math.round(cents / 100).toLocaleString("en-IN")}`;
}

export default function PoAnalytics() {
  const { workspaces, activity, plans, engagementMissing, loading, error } = usePoAnalytics();

  const now = useMemo(() => new Date(), []);
  const funnel = useMemo(() => activationFunnel(workspaces, now), [workspaces, now]);
  const timing = useMemo(() => activationTiming(workspaces, now), [workspaces, now]);
  const growth = useMemo(
    () => growthByMonth(workspaces, ANALYTICS_MONTHS, plans, now),
    [workspaces, plans, now],
  );
  const conversion = useMemo(() => conversionSummary(workspaces, plans), [workspaces, plans]);
  const liveness = useMemo(() => livenessBuckets(workspaces, now), [workspaces, now]);
  const mix = useMemo(() => planMix(workspaces, plans), [workspaces, plans]);
  const retention = useMemo(
    () => retentionMatrix(workspaces, activity, ANALYTICS_MONTHS, now),
    [workspaces, activity, now],
  );

  const peakCreated = Math.max(1, ...growth.map((g) => g.created));
  const activated = funnel.find((s) => s.id === "transaction");
  const live = funnel.find((s) => s.id === "retained");
  const total = growth[growth.length - 1]?.cumulative ?? 0;

  if (error) {
    return (
      <div className="p-6 max-w-6xl">
        <h1 className="font-display text-2xl font-semibold">Analytics</h1>
        <p className="mt-3 text-sm text-destructive">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Activation, retention and conversion — derived from the records the product already
          keeps. Nothing on this page was tracked.
        </p>
      </div>

      {engagementMissing && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-amber-500">
            <AlertTriangle className="h-4 w-4" /> Activation and retention are unavailable
          </div>
          <p className="mt-1.5 text-muted-foreground">
            Migration <code className="text-xs">20260812120000_stage5_analytics.sql</code> has not
            been applied, so <code className="text-xs">po_tenant_engagement()</code> does not exist
            yet. Growth, conversion and the plan mix below are correct; the activation funnel,
            liveness and the retention matrix will stay empty until it is pushed. See{" "}
            <code className="text-xs">docs/runbooks/apply-a-migration.md</code>.
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading analytics…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat icon={Users} label="Workspaces" value={conversion.total} />
            {/* 🔴 A zero here would read as "nobody activated" when the truth
                is "we cannot tell yet". Unknown must not look like bad news. */}
            <Stat
              icon={Sparkles}
              label="Activated"
              value={engagementMissing || !activated ? "—" : formatPercent(activated.fraction)}
              sub={
                engagementMissing
                  ? "needs the 5.8 migration"
                  : activated && `${activated.count} recorded a transaction`
              }
              tone="text-emerald-500"
            />
            <Stat
              icon={TrendingUp}
              label="Active (30d)"
              value={engagementMissing || !live ? "—" : formatPercent(live.fraction)}
              sub={
                engagementMissing ? "needs the 5.8 migration" : live && `${live.count} workspaces`
              }
            />
            <Stat
              icon={Wallet}
              label="Paying"
              value={formatPercent(conversion.rate)}
              sub={`${conversion.paying} of ${conversion.total}`}
              tone="text-emerald-500"
            />
            <Stat
              icon={BarChart3}
              label="MRR"
              value={rupees(conversion.mrrCents)}
              sub={conversion.lapsed ? `${conversion.lapsed} lapsed` : "from plans in force"}
              tone={conversion.lapsed ? "text-amber-500" : undefined}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card
              title="Signups by month"
              hint={`Last ${ANALYTICS_MONTHS} months. "Activated" and "paying" are measured today, so the newest cohorts always read lowest.`}
            >
              <div className="space-y-2">
                {growth.map((g) => (
                  <div key={g.month} className="flex items-center gap-3 text-xs">
                    <span className="w-16 shrink-0 text-muted-foreground">{g.label}</span>
                    <div className="flex-1 h-3 rounded bg-secondary/50 overflow-hidden flex">
                      <div
                        className="h-full bg-primary/80"
                        style={{ width: `${(g.created / peakCreated) * 100}%` }}
                        title={`${g.created} created`}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right tabular-nums">
                      {g.created}
                      <span className="text-muted-foreground">
                        {" "}
                        {/* "act" is engagement-derived; without the migration it
                            would be a zero pretending to be a measurement. */}
                        {engagementMissing ? "" : `· ${g.activated} act `}· {g.paid} paid
                      </span>
                    </span>
                  </div>
                ))}
                <div className="pt-1 text-xs text-muted-foreground">
                  {total} workspace{total === 1 ? "" : "s"} in total.
                </div>
              </div>
            </Card>

            <Card
              title="Activation"
              hint="The same three steps the first-run checklist uses. A workspace can plan before it records anything, so these stages are independent — the funnel is allowed to widen."
            >
              {engagementMissing ? (
                <Unavailable />
              ) : (
                <>
              <div className="space-y-3">
                {funnel.map((s) => (
                  <Bar key={s.id} label={s.label} count={s.count} fraction={s.fraction} />
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                {timing.medianDays === null ? (
                  <>No workspace is older than a week yet, so time-to-activate has nothing to measure.</>
                ) : (
                  <>
                    Median <strong className="text-foreground">{timing.medianDays.toFixed(1)} days</strong>{" "}
                    from creation to first transaction. {timing.sameDay} activated the same day,{" "}
                    {timing.withinWeek} within a week — of {timing.eligible} workspaces old enough to
                    judge.
                  </>
                )}
              </p>
                </>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card
              title="Last seen"
              hint="The later of writing something and signing in. Reading leaves no trace, so a sign-in is the only sign a quiet workspace is still being used."
            >
              {engagementMissing ? (
                <Unavailable />
              ) : (
                <div className="space-y-3">
                  {liveness.map((b) => (
                    <Bar key={b.id} label={b.label} count={b.count} fraction={b.fraction} />
                  ))}
                </div>
              )}
            </Card>

            <Card title="Plans in force" hint="An expired subscription counts as the free plan, exactly as the app treats it.">
              <div className="space-y-3">
                {mix.map((m) => (
                  <Bar
                    key={m.name}
                    label={m.priceCents > 0 ? `${m.name} · ${rupees(m.priceCents)}` : m.name}
                    count={m.count}
                    fraction={m.fraction}
                  />
                ))}
                {!mix.length && <p className="text-xs text-muted-foreground">No workspaces yet.</p>}
              </div>
            </Card>
          </div>

          <Card
            title="Retention by signup cohort"
            hint="Of the workspaces created in a month, how many wrote something in each later month. A blank cell has not happened yet — it is not a zero."
          >
            {engagementMissing ? (
              <Unavailable />
            ) : retention.cohorts.length ? (
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left font-medium py-1 pr-3">Cohort</th>
                      <th className="text-right font-medium py-1 pr-3">Size</th>
                      {Array.from({ length: retention.maxOffset + 1 }, (_, n) => (
                        <th key={n} className="text-right font-medium py-1 px-2 whitespace-nowrap">
                          {n === 0 ? "Month 0" : `+${n}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {retention.cohorts.map((c) => (
                      <tr key={c.month} className="border-t border-border/30">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{c.label}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                          {c.size}
                        </td>
                        {Array.from({ length: retention.maxOffset + 1 }, (_, n) => {
                          const value = c.active[n];
                          return (
                            <td key={n} className="py-1.5 px-2 text-right tabular-nums">
                              {value === undefined ? (
                                <span className="text-muted-foreground/40">—</span>
                              ) : (
                                <span title={`${value} of ${c.size}`}>
                                  {formatPercent(share(value, c.size))}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No workspace was created inside the last {ANALYTICS_MONTHS} months.
              </p>
            )}
          </Card>

          <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-xs text-muted-foreground space-y-1.5">
            <p className="font-medium text-foreground">What this cannot see</p>
            <p>
              There is no analytics script and no events table behind this page — it reads the same
              records the product keeps to run itself. So it cannot show what an anonymous visitor
              did: there is no landing-page to sign-up funnel and no per-screen drop-off here. It
              measures what people did with the product, not what they browsed.
            </p>
            <p>
              Months are bucketed in UTC to match the database. Deleted workspaces are excluded
              everywhere, so these totals match the Tenants page rather than the raw table.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
