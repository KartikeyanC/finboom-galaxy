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
  BROKER_TINTS,
  type Broker,
  getCurrent,
  getInvested,
  getRecordName,
  type InvestmentRecord,
} from "@/lib/investmentsStore";
import { isLiveAsset, useLivePrices } from "@/lib/livePrices";
import MatrixFilter from "@/components/filters/MatrixFilter";
import { toINR } from "@/lib/finance";

interface Props {
  records: InvestmentRecord[];
  onEdit: (rec: InvestmentRecord) => void;
  onDelete: (id: string) => void;
}

const PortfolioList = ({ records, onEdit, onDelete }: Props) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [brokerFilter, setBrokerFilter] = useState<Broker | null>(null);
  const { live, refresh, refreshedAt } = useLivePrices(records);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    refresh();
    window.setTimeout(() => setSpinning(false), 700);
  };

  const lastUpdatedLabel = new Date(refreshedAt).toLocaleTimeString();

  const brokersInUse = Array.from(
    new Set(records.map((r) => r.broker).filter(Boolean) as Broker[]),
  );
  const visibleRecords = brokerFilter
    ? records.filter((r) => r.broker === brokerFilter)
    : records;

  return (
    <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
      <header className="flex items-center justify-between p-5 border-b border-border">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Active Investment Portfolio
            </h2>
            {/* BUG-094 — the badge TEXT was hardcoded `emerald-500`, 2.25:1 on
                the light theme's opaque card. The pulsing dot stays raw
                Tailwind — it carries no text, so contrast doesn't apply to it —
                but the label does, so it moves to the theme-aware token. */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Live Market Rates Active
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {visibleRecords.length}{" "}
            {visibleRecords.length === 1 ? "asset" : "assets"}
            {brokerFilter ? ` via ${brokerFilter}` : " tracked"}
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

      {brokersInUse.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border overflow-x-auto">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">
            Filter:
          </span>
          <button
            type="button"
            onClick={() => setBrokerFilter(null)}
            className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
              brokerFilter === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:text-foreground border-border"
            }`}
          >
            All
          </button>
          {brokersInUse.map((b) => {
            const active = brokerFilter === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setBrokerFilter(active ? null : b)}
                className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors whitespace-nowrap ${
                  active
                    ? `${BROKER_TINTS[b]} font-semibold`
                    : "bg-background text-muted-foreground hover:text-foreground border-border"
                }`}
              >
                {b}
              </button>
            );
          })}
        </div>
      )}

      <div className="px-5 pt-4">
        <MatrixFilter<InvestmentRecord>
          items={visibleRecords}
          getDate={(r) => new Date(r.savedAt)}
          // BUG-027: this date is when the holding was RECORDED, not when
          // anything happened to it, so "today" would hide a portfolio someone
          // built up over months behind an empty state.
          defaultPreset="all"
          getCategory={(r) => ASSET_LABELS[r.asset]}
          getAmount={(r) => toINR(getCurrent(r), r.currency)}
          allCategories={Object.values(ASSET_LABELS)}
          currencyTag="INR"
        >
          {(filteredRecords) => (
            filteredRecords.length === 0 ? (
              <EmptyState brokerFilter={brokerFilter} />
            ) : (
              <PortfolioRows
                records={filteredRecords}
                live={live}
                confirmId={confirmId}
                setConfirmId={setConfirmId}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            )
          )}
        </MatrixFilter>
      </div>
    </section>
  );
};

export default PortfolioList;

function EmptyState({ brokerFilter }: { brokerFilter: Broker | null }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-14 h-14 rounded-full bg-muted/60 flex items-center justify-center mb-4 text-muted-foreground">
        <Wallet className="w-7 h-7" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">
        {brokerFilter
          ? `No assets held with ${brokerFilter}.`
          : 'Your portfolio is empty. Click "Add New Investment" above to track your growth.'}
      </p>
    </div>
  );
}

function PortfolioRows({
  records,
  live,
  confirmId,
  setConfirmId,
  onEdit,
  onDelete,
}: {
  records: InvestmentRecord[];
  live: ReturnType<typeof useLivePrices>["live"];
  confirmId: string | null;
  setConfirmId: (id: string | null) => void;
  onEdit: (rec: InvestmentRecord) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-border mt-3">
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
              ? "animate-flash-up text-emerald-500 rounded px-1"
              : direction === "down"
                ? "animate-flash-down text-rose-500 rounded px-1"
                : "text-foreground";
          const isConfirming = confirmId === r.id;

          return (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="group relative px-2 py-4 hover:bg-muted/40 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground truncate">
                      {getRecordName(r)}
                    </span>
                    {r.broker && (
                      <Badge variant="outline" className={`text-xs ${BROKER_TINTS[r.broker]}`}>
                        via {r.broker}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {ASSET_LABELS[r.asset]}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {r.currency}
                    </Badge>
                    {r.goal && (
                      <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                        {r.goal}
                      </Badge>
                    )}
                    {tracked ? (
                      <Badge
                        variant="outline"
                        className={`text-xs gap-1 ${
                          positive
                            ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5"
                            : "border-rose-500/40 text-rose-500 bg-rose-500/5"
                        }`}
                      >
                        {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {positive ? "+" : ""}
                        {pct.toFixed(2)}% {positive ? "Profit" : "Loss"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Fixed Rate
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 ml-auto">
                  {tracked && (
                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Current Price</div>
                      <div key={tick.updatedAt} className={`text-sm font-semibold tabular-nums ${flashClass}`}>
                        {formatMoney(tick.unitPrice, r.currency)}
                      </div>
                    </div>
                  )}
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Invested</div>
                    <div className="text-sm font-bold text-foreground tabular-nums">
                      {formatMoney(invested, r.currency)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Current</div>
                    <div
                      key={tick?.updatedAt ?? "static"}
                      className={`text-sm font-bold tabular-nums ${
                        tracked ? flashClass : positive ? "text-emerald-500" : "text-rose-500"
                      }`}
                    >
                      {formatMoney(current, r.currency)}
                    </div>
                  </div>
                </div>

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
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirmId(null)}>
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
  );
}