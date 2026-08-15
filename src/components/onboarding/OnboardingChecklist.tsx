import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useBranding } from "@/hooks/useBranding";
import { cn } from "@/lib/utils";

/**
 * Stage 5.3 — the first-run checklist, shown above the dashboard.
 *
 * It disappears on its own the moment the workspace has a transaction, a
 * budget and a goal, and it never returns; the only reason to press Dismiss is
 * impatience, so that button is quiet rather than prominent.
 *
 * Steps are ticked from the workspace's REAL rows (`useOnboarding` counts
 * them). Sample rows deliberately do not count — see `lib/onboarding.ts`.
 */
export default function OnboardingChecklist() {
  const { appName } = useBranding();
  const {
    show, steps, done, total, loading, sample, loadSample, removeSample, sampleBusy, dismiss,
  } = useOnboarding();

  // Nothing at all while the counts are unknown: a checklist that renders
  // three empty circles and then ticks them a second later reads as "you have
  // done none of this", which for most workspaces is false.
  if (!show || loading || total === 0) return null;

  const pct = Math.round((done / total) * 100);

  return (
    <section
      aria-labelledby="onboarding-title"
      className="glass-card p-5 border-primary/30"
      data-testid="onboarding-checklist"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 id="onboarding-title" className="font-display text-base font-semibold text-foreground">
              Get {appName} working for you
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {done} of {total} done — this card goes away by itself when they all are.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground hover:text-foreground shrink-0"
          onClick={dismiss}
          aria-label="Dismiss the setup checklist"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Progress value={pct} className="h-1.5 mt-4" aria-label={`Setup ${pct}% complete`} />

      <ol className="mt-4 space-y-2">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 transition-colors",
              step.done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/60 bg-card/40",
            )}
          >
            {step.done ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.done ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                <span className="tabular-nums text-muted-foreground mr-1.5">{i + 1}.</span>
                {step.title}
              </p>
              {!step.done && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.blurb}</p>
              )}
            </div>
            {!step.done && (
              <Button asChild size="sm" variant="outline" className="h-8 shrink-0">
                <Link to={step.href}>{step.cta}</Link>
              </Button>
            )}
          </li>
        ))}
      </ol>

      {/* Sample data. Offered only while NO step is done — i.e. the workspace
          has no transaction, no budget and no goal of its own. Loading a demo
          household on top of a real ledger would mix invented money into
          someone's numbers, and the budget upsert could overwrite an
          allocation they had set. */}
      <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap items-center justify-between gap-3">
        {sample ? (
          <>
            <p className="text-xs text-muted-foreground">
              Sample data is loaded. Every row is labelled <span className="font-medium">Sample</span> in
              your ledger, and none of it counts towards the steps above.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 shrink-0"
              onClick={removeSample}
              disabled={sampleBusy}
            >
              {sampleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove sample data
            </Button>
          </>
        ) : done === 0 ? (
          <>
            <p className="text-xs text-muted-foreground">
              Would rather look around first? Load a month of made-up household data — you can
              remove it in one click.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 shrink-0 text-primary hover:text-primary"
              onClick={loadSample}
              disabled={sampleBusy}
            >
              {sampleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Load sample data
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}
