import { useMemo } from "react";
import { motion } from "framer-motion";
import { Wallet } from "lucide-react";
import { useIncomeStreams } from "@/hooks/useIncomeStreams";
import { formatCompact } from "@/lib/finance";

const IncomeStreams = () => {
  const { visible } = useIncomeStreams();

  const { total, groups } = useMemo(() => {
    const total = visible.reduce((s, x) => s + x.amount * x.exchangeRateToINR, 0);
    const groups: Record<string, typeof visible> = {};
    visible.forEach((s) => {
      const k = s.type === "active" ? "Active" : "Passive";
      (groups[k] ||= []).push(s);
    });
    return { total, groups };
  }, [visible]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="glass-card p-5 h-full"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Income Streams
        </h2>
        {visible.length > 0 && (
          <span className="text-xs font-display font-semibold text-primary">
            {formatCompact(Math.round(total))}/mo
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Wallet className="w-6 h-6 opacity-40" />
          No income streams yet. Add them on the Income page.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(groups).map(([cat, streams]) => {
            const tone = cat === "Active" ? "text-emerald-400" : "text-violet-300";
            const dot = cat === "Active" ? "bg-emerald-400" : "bg-violet-300";
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${tone}`}>{cat}</span>
                </div>
                <div className="flex flex-col gap-1.5 pl-4">
                  {streams.map((src) => (
                    <div key={src.id} className="flex items-center justify-between text-sm">
                      <span className="text-secondary-foreground truncate">{src.name}</span>
                      <span className="font-display font-semibold text-foreground">
                        {formatCompact(Math.round(src.amount * src.exchangeRateToINR))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default IncomeStreams;
