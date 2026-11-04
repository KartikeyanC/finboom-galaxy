import { motion } from "framer-motion";
import { formatCompact } from "@/lib/finance";
import { percentOf } from "@/lib/progress";

/**
 * A goal's progress in two parts: money saved toward it (the goal's own
 * amount) and the value today of the holdings linked to it. Each is its own
 * segment and its own figure, so a reader can tell them apart.
 */
export function GoalProgress({
  saved,
  invested,
  target,
  currency,
  color,
  delay = 0,
}: {
  saved: number;
  invested: number;
  target: number;
  currency: string;
  /** A colour for the bar; the theme's primary when left out. */
  color?: string;
  delay?: number;
}) {
  const total = saved + invested;
  const pct = percentOf(total, target);
  // The saved share of the filled width, so the two segments add up to pct.
  const savedPct = total > 0 ? (pct * saved) / total : 0;
  const tint = color ? { backgroundColor: color } : undefined;

  return (
    <>
      <div
        className="relative h-2 rounded-full bg-secondary overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${pct}% of the goal`}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay }}
          className={`absolute inset-y-0 left-0 rounded-full opacity-50 ${color ? "" : "bg-primary"}`}
          style={tint}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${savedPct}%` }}
          transition={{ duration: 0.8, delay }}
          className={`absolute inset-y-0 left-0 rounded-full ${color ? "" : "bg-primary"}`}
          style={tint}
        />
      </div>
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          {invested > 0 ? (
            <>
              {formatCompact(saved, currency)} saved + {formatCompact(invested, currency)} invested
              <span className="whitespace-nowrap"> / {formatCompact(target, currency)}</span>
            </>
          ) : (
            <>
              {formatCompact(saved, currency)} / {formatCompact(target, currency)}
            </>
          )}
        </span>
        <span className={`font-display font-semibold ${color ? "" : "text-primary"}`} style={color ? { color } : undefined}>
          {pct}%
        </span>
      </div>
    </>
  );
}
