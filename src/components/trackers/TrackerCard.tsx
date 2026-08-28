import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { percentOf } from "@/lib/progress";
import { trackerTypeMeta } from "./trackerMeta";
import TrackerBadge from "./TrackerBadge";
import type { TrackerWithSpend } from "@/lib/trackers";

/** "1 Jan 2026 → 31 Jul 2027", or "1 Jan 2026 → ongoing". */
function dateRange(start: string, end: string | null): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00.000Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(start)} → ${end ? fmt(end) : "ongoing"}`;
}

/**
 * One tracker on the index grid.
 *
 * Kept deliberately thin: name, window, spend, and a budget bar only when
 * there IS a budget. Every extra figure here is one the user has to skim past
 * to find the one they came for (Miller), and the detail view is one click
 * away for the rest.
 */
export default function TrackerCard({
  tracker,
  isLight,
  onOpen,
}: {
  tracker: TrackerWithSpend;
  isLight: boolean;
  onOpen: (id: string) => void;
}) {
  const meta = trackerTypeMeta(tracker.type);
  const Icon = meta.icon;
  const hasBudget = tracker.remaining !== null;
  const pct = hasBudget ? percentOf(tracker.derivedSpent, Number(tracker.budget)) : 0;
  const over = hasBudget && (tracker.remaining ?? 0) < 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(tracker.id)}
      // The card contains the name, a badge that repeats it, a total and a
      // progress bar; concatenated, that is a mouthful with no shape. One
      // explicit label gives a screen-reader user the same summary a sighted
      // one gets at a glance.
      aria-label={
        `${tracker.name}, ${tracker.type}. Spent ${formatMoney(tracker.derivedSpent)}` +
        (hasBudget
          ? over
            ? `, ${formatMoney(Math.abs(tracker.remaining ?? 0))} over a ${formatMoney(Number(tracker.budget))} budget`
            : `, ${formatMoney(tracker.remaining ?? 0)} left of ${formatMoney(Number(tracker.budget))}`
          : ", no budget set") +
        `. ${tracker.txnCount} transactions.`
      }
      // A whole-card button rather than a small "open" link: this is the
      // primary action on the card and it should be the size of the card
      // (Fitts's Law).
      className={cn(
        "glass-card p-5 text-left w-full flex flex-col gap-3",
        "transition-colors hover:border-primary/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-primary shrink-0">
            <Icon className="w-4 h-4" />
          </span>
          <span className="font-display font-semibold text-foreground truncate">{tracker.name}</span>
        </div>
        <TrackerBadge name={tracker.name} isLight={isLight} />
      </div>

      <div className="text-xs text-muted-foreground">
        {tracker.type} · {dateRange(tracker.start_date, tracker.end_date)}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="metric-label">Spent</div>
          <div className="font-display text-xl font-bold text-foreground">
            {formatMoney(tracker.derivedSpent)}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {tracker.txnCount} {tracker.txnCount === 1 ? "transaction" : "transactions"}
        </div>
      </div>

      {hasBudget ? (
        <div className="space-y-1.5">
          <Progress
            value={pct}
            // axe's aria-progressbar-name rule: a bare role="progressbar" is
            // an unnamed control to a screen reader. The label carries the
            // number too, since the bar's fill is purely visual.
            aria-label={`Budget used: ${pct}% of ${formatMoney(Number(tracker.budget))}`}
            className={cn("h-1.5", over && "[&>div]:bg-destructive")}
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {formatMoney(Number(tracker.budget))} budget
            </span>
            {/* Von Restorff: only the overrun is allowed to shout. */}
            <span className={cn(over ? "text-destructive font-medium" : "text-muted-foreground")}>
              {over
                ? `${formatMoney(Math.abs(tracker.remaining ?? 0))} over`
                : `${formatMoney(tracker.remaining ?? 0)} left`}
            </span>
          </div>
        </div>
      ) : (
        // Never render a fake ₹0 budget bar. "No budget set" is the truth, and
        // an empty progress track would read as "nothing spent yet".
        <div className="text-xs text-muted-foreground">No budget set</div>
      )}
    </button>
  );
}
