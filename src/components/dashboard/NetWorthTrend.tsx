import { motion } from "framer-motion";
import { Scale, TrendingUp, TrendingDown } from "lucide-react";
import { formatCompact } from "@/lib/finance";

interface NetWorthTrendProps {
  assets: number;
  liabilities: number;
  netWorth: number;
  hasData: boolean;
}

/**
 * BUG-017 — this panel used to re-derive net worth itself from the localStorage
 * stores, with a `useMemo` whose dependency list was missing `liveBalances`.
 * The live balances load asynchronously, so the memo locked onto whatever it
 * computed before they arrived (opening balances only) and never updated —
 * leaving the "Wealth Overview" figure contradicting the top metric card on the
 * same screen (e.g. -₹8,128 vs ₹52,000).
 *
 * It is now purely presentational. `DashboardClassic` computes the figures once
 * — the same `fin` the metric cards use — and passes them in, so the two can
 * never diverge again.
 */
const NetWorthTrend = ({ assets, liabilities, netWorth, hasData }: NetWorthTrendProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card p-5 h-full"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">Net Worth</h2>
        <Scale className="w-4 h-4 text-muted-foreground" />
      </div>

      {!hasData ? (
        <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Scale className="w-7 h-7 opacity-40" />
          Add accounts, investments or debts to see your net worth.
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Current net worth</div>
            <div className="font-display text-4xl font-bold text-gradient-primary tabular-nums mt-1">
              {formatCompact(netWorth)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* BUG-094 — was a hardcoded `emerald-500`, unlike its sibling
                (`--destructive`) which was already a theme token. A raw
                Tailwind colour cannot be tuned per theme, and the light theme
                needed exactly that: 2.43:1 on its opaque card background.
                `--success` is the token built for this and already carries
                the light-theme fix. */}
            <div className="rounded-xl border border-success/30 bg-success/[0.04] p-3">
              <div className="text-[11px] uppercase tracking-wider text-success flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Assets
              </div>
              <div className="font-display text-xl font-bold text-success mt-1">{formatCompact(assets)}</div>
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/[0.04] p-3">
              <div className="text-[11px] uppercase tracking-wider text-destructive flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Liabilities
              </div>
              <div className="font-display text-xl font-bold text-destructive mt-1">{formatCompact(liabilities)}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A month-over-month trend chart will build up as you keep tracking.
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default NetWorthTrend;
