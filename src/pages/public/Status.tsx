import { Link } from "react-router-dom";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Wrench, Loader2 } from "lucide-react";
import PublicLayout, { Section } from "@/pages/public/PublicLayout";
import { useServiceChecks, useStatusNotice } from "@/hooks/useServiceChecks";
import { useBranding } from "@/hooks/useBranding";
import {
  STATE_LABEL,
  STATE_TONE,
  overallStatus,
  relativeTime,
  type ServiceState,
  type NoticeState,
} from "@/lib/status";
import { SUPPORT_EMAIL } from "@/lib/support";
import { cn } from "@/lib/utils";

const ICON: Record<ServiceState | NoticeState, typeof CheckCircle2> = {
  checking: Loader2,
  operational: CheckCircle2,
  maintenance: Wrench,
  degraded: AlertTriangle,
  down: XCircle,
  outage: XCircle,
};

/**
 * Stage 5.7 — is it me or is it them?
 *
 * Public, sessionless and deliberately dependency-free: during an incident the
 * one page that must render is this one. It shows two things and never
 * conflates them — **live probes from the visitor's own browser**, which is the
 * only way to tell somebody their own connection is the problem, and **a notice
 * an operator wrote**, which can describe things no probe can see. The worse of
 * the two is what the banner says.
 */
export default function Status() {
  const { appName } = useBranding();
  const { checks, ranAt, refresh } = useServiceChecks();
  const { notice } = useStatusNotice();
  const overall = overallStatus(checks, notice);
  const OverallIcon = ICON[overall.state];

  return (
    <PublicLayout
      eyebrow="Status"
      title={`${appName} status`}
      summary="Checked live from this browser, every time you open the page. There is no history here yet — just what is true right now."
      meta={ranAt ? `Last checked ${relativeTime(ranAt.toISOString())}` : "Checking…"}
    >
      <div
        data-testid="status-overall"
        data-state={overall.state}
        className={cn("rounded-2xl border p-5 flex items-start gap-3", STATE_TONE[overall.state])}
      >
        <OverallIcon className={cn("w-6 h-6 shrink-0", overall.checking && "animate-spin")} />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{overall.headline}</p>
          {notice.detail && overall.state !== "operational" && (
            <p className="mt-1 text-sm opacity-90 whitespace-pre-line">{notice.detail}</p>
          )}
          {notice.updated_at && overall.state !== "operational" && (
            <p className="mt-2 text-xs opacity-75">Updated {relativeTime(notice.updated_at)}</p>
          )}
        </div>
      </div>

      <Section id="services" heading="Services">
        <ul className="space-y-2.5 not-prose">
          {checks.map((c) => {
            const Icon = ICON[c.state];
            return (
              <li
                key={c.id}
                data-testid={`status-${c.id}`}
                data-state={c.state}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-start gap-3"
              >
                <Icon
                  className={cn(
                    "w-4 h-4 mt-0.5 shrink-0",
                    c.state === "operational" && "text-emerald-500",
                    c.state === "degraded" && "text-amber-500",
                    c.state === "down" && "text-red-500",
                    c.state === "checking" && "text-[#8b9a94] animate-spin",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-white font-medium">{c.label}</p>
                    {/* The label is words, not just colour — a status page read
                        by somebody who cannot distinguish red from green is
                        still a status page. */}
                    <span className="text-xs whitespace-nowrap">
                      {STATE_LABEL[c.state]}
                      {typeof c.ms === "number" && ` · ${c.ms} ms`}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5">{c.description}</p>
                  {c.error && <p className="text-xs mt-1 text-red-400">{c.error}</p>}
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-sm hover:bg-white/5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Check again
        </button>
      </Section>

      <Section id="reading" heading="How to read this">
        <p>
          These checks run <strong>in your browser</strong>, not on our servers. If they fail for you
          and the service is fine for everyone else, the answer is usually your network — a captive
          wifi portal, a VPN or an ad blocker sitting in front of the API.
        </p>
        <p>
          They also cannot see everything. A problem that affects only signed-in requests, or only
          one workspace, will show green here. If something is wrong and this page disagrees, trust
          yourself and{" "}
          <Link to="/support" className="text-[#19B886] hover:underline">tell us</Link> — that is
          more useful to us than a green tick.
        </p>
      </Section>

      <Section id="incidents" heading="Incidents">
        {notice.headline ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-white font-medium">{notice.headline}</p>
            {notice.detail && <p className="mt-1 whitespace-pre-line">{notice.detail}</p>}
            <p className="mt-2 text-xs text-[#8b9a94]">
              {STATE_LABEL[notice.state]}
              {notice.updated_at && ` · updated ${relativeTime(notice.updated_at)}`}
            </p>
          </div>
        ) : (
          <p>
            Nothing is being reported. When something is wrong that these checks cannot see, a note
            appears here — and if it is affecting you and there is no note, write to{" "}
            <a className="text-[#19B886] hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        )}
      </Section>
    </PublicLayout>
  );
}
