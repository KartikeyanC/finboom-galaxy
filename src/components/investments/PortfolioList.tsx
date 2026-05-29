import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Pencil,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/finance";
import {
  ASSET_LABELS,
  getCurrent,
  getInvested,
  getRecordName,
  type InvestmentRecord,
} from "@/lib/investmentsStore";
import { isLiveAsset, useLivePrices } from "@/lib/livePrices";

interface Props {
  records: InvestmentRecord[];
  onEdit: (rec: InvestmentRecord) => void;
  onDelete: (id: string) => void;
}

const PortfolioList = ({ records, onEdit, onDelete }: Props) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { live, refresh, refreshedAt } = useLivePrices(records);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    refresh();
    window.setTimeout(() => setSpinning(false), 700);
  };

  const lastUpdatedLabel = new Date(refreshedAt).toLocaleTimeString();

  return (
    <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
      <header className="flex items-center justify-between p-5 border-b border-border">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Active Investment Portfolio
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Live Market Rates Active
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {records.length}{" "}
            {records.length === 1 ? "asset tracked" : "assets tracked"}
            <span className="mx-1.5">·</span>
            Updated {lastUpdatedLabel}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`}
          />
          Refresh Prices
        </Button>
      </header>

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 px-6">
          <div className="w-14 h-14 rounded-full bg-muted/60 flex items-center justify-center mb-4 text-muted-foreground">
            <Wallet className="w-7 h-7" />
          </div>
          <p className="text-sm text-muted-foreground max-w-xs">
            Your portfolio is empty. Click{" "}
            <span className="text-foreground font-medium">
              "Add New Investment"
            </span>{" "}
            above to track your growth.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {records.map((r) => {
              const invested = getInvested(r);
              const tick = live[r.id];
              const tracked = isLiveAsset(r.asset) && tick !== undefined;
              const current = tracked ? tick.currentValue : getCurrent(r);
              const delta = current - invested;
              const positive = delta >= 0;
              const pct = invested > 0 ? (delta / invested) * 100 : 0;
              const direction = tick?.direction ?? "flat";
              const flashClass =
                direction === "up"
                  ? "animate-[fade-in_0.6s_ease-out] text-emerald-500"
                  : direction === "down"
                    ? "animate-[fade-in_0.6s_ease-out] text-rose-500"
                    : "text-foreground";
              const isConfirming = confirmId === r.id;

              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="group relative px-5 py-4 hover:bg-muted/40 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                    {/* Left: name + badges */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">
                          {getRecordName(r)}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {ASSET_LABELS[r.asset]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {r.currency}
                        </Badge>
                        {r.goal && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-primary/40 text-primary"
                          >
                            {r.goal}
                          </Badge>
                        )}
                        {tracked ? (
                          <Badge
                            variant="outline"
                            className={`text-[10px] gap-1 ${
                              positive
                                ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5"
                                : "border-rose-500/40 text-rose-500 bg-rose-500/5"
                            }`}
                          >
                            {positive ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {positive ? "+" : ""}
                            {pct.toFixed(2)}% {positive ? "Profit" : "Loss"}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground"
                          >
                            Fixed Rate
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Middle: values */}
                    <div className="flex items-center gap-6 ml-auto">
                      {tracked && (
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Live Price
                          </div>
                          <div
                            key={tick.updatedAt}
                            className={`text-sm font-semibold tabular-nums ${flashClass}`}
                          >
                            {formatMoney(tick.unitPrice, r.currency)}
                          </div>
                        </div>
                      )}
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Invested
                        </div>
                        <div className="text-sm font-bold text-foreground tabular-nums">
                          {formatMoney(invested, r.currency)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Current
                        </div>
                        <div
                          key={tick?.updatedAt ?? "static"}
                          className={`text-sm font-bold tabular-nums ${
                            tracked
                              ? flashClass
                              : positive
                                ? "text-emerald-500"
                                : "text-rose-500"
                          }`}
                        >
                          {formatMoney(current, r.currency)}
                        </div>
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                        onClick={() => onEdit(r)}
                        aria-label="Edit investment"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-rose-500"
                        onClick={() => setConfirmId(r.id)}
                        aria-label="Delete investment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Inline confirm */}
                  <AnimatePresence>
                    {isConfirming && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                          <span className="text-xs text-foreground">
                            Are you sure you want to delete this record?
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setConfirmId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs bg-rose-500 hover:bg-rose-500/90 text-white"
                              onClick={() => {
                                onDelete(r.id);
                                setConfirmId(null);
                              }}
                            >
                              Yes, Delete
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
};

export default PortfolioList;