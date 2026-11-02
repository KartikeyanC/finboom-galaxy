import { useState } from "react";
import { MoreVertical, Pencil, RefreshCw, Trash2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  averagePriceOf,
  money2,
  qty2,
  quantityOf,
  signedMoney2,
  signedPct2,
} from "@/lib/holdingFigures";
import MatrixFilter from "@/components/filters/MatrixFilter";
import { toINR } from "@/lib/finance";
import { cn } from "@/lib/utils";

interface Props {
  records: InvestmentRecord[];
  onEdit: (rec: InvestmentRecord) => void;
  onDelete: (id: string) => void;
  /** Bulk delete; falls back to one onDelete per id when not given. */
  onDeleteMany?: (ids: string[]) => void | Promise<void>;
}

/**
 * The holdings list, broker-style: column titles once at the top, then one
 * row per holding with every figure in a fixed-width, right-aligned column —
 * Holding · LTP · Invested · Current · P&L. Only what matters is on the row;
 * broker, type, currency and goal live in the holding itself (Edit). Edit and
 * Delete sit in a ⋮ menu, and ticking rows deletes several at once.
 */
const PortfolioList = ({ records, onEdit, onDelete, onDeleteMany }: Props) => {
  const [brokerFilter, setBrokerFilter] = useState<Broker | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const { live, refresh, refreshedAt } = useLivePrices(records);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    refresh();
    window.setTimeout(() => setSpinning(false), 700);
  };

  const brokersInUse = Array.from(
    new Set(records.map((r) => r.broker).filter(Boolean) as Broker[]),
  );
  const visibleRecords = brokerFilter
    ? records.filter((r) => r.broker === brokerFilter)
    : records;
  // A selection never outlives the rows it named (deleted elsewhere, filtered).
  const liveSelected = [...selected].filter((id) => records.some((r) => r.id === id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runDelete = async (ids: string[]) => {
    if (onDeleteMany) await onDeleteMany(ids);
    else ids.forEach(onDelete);
    setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
    setConfirm(null);
  };

  const nameOf = (id: string) => {
    const r = records.find((x) => x.id === id);
    return r ? getRecordName(r) : "this holding";
  };

  return (
    <section className="rounded-xl border border-border bg-card/60 text-foreground backdrop-blur-sm">
      <header className="flex items-center justify-between gap-3 p-5 border-b border-border">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Holdings</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {visibleRecords.length} {visibleRecords.length === 1 ? "holding" : "holdings"}
            {brokerFilter ? ` with ${brokerFilter}` : ""}
            <span className="mx-1.5">·</span>
            Prices updated {new Date(refreshedAt).toLocaleTimeString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 gap-1.5 text-xs">
          <RefreshCw className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
          Refresh prices
        </Button>
      </header>

      {brokersInUse.length > 1 && (
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border overflow-x-auto">
          {[null, ...brokersInUse].map((b) => {
            const active = brokerFilter === b;
            return (
              <button
                key={b ?? "all"}
                type="button"
                onClick={() => setBrokerFilter(active && b ? null : b)}
                className={cn(
                  "shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors whitespace-nowrap",
                  active
                    ? b
                      ? `${BROKER_TINTS[b]} font-semibold`
                      : "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:text-foreground border-border",
                )}
              >
                {b ?? "All brokers"}
              </button>
            );
          })}
        </div>
      )}

      <div className="px-5 pt-4 pb-2">
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
          quiet
        >
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState brokerFilter={brokerFilter} />
            ) : (
              <>
                {liveSelected.length > 0 && (
                  <div
                    role="toolbar"
                    aria-label="Selected holdings"
                    className="sticky top-2 z-10 mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 shadow-sm"
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Clear selection"
                      onClick={() => setSelected(new Set())}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium whitespace-nowrap">{liveSelected.length} selected</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="ml-auto h-8 gap-1.5"
                      onClick={() => setConfirm(liveSelected)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete selected
                    </Button>
                  </div>
                )}
                <HoldingsTable
                  records={rows}
                  live={live}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={(on) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      rows.forEach((r) => (on ? next.add(r.id) : next.delete(r.id)));
                      return next;
                    })
                  }
                  onEdit={onEdit}
                  onAskDelete={(id) => setConfirm([id])}
                />
              </>
            )
          }
        </MatrixFilter>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.length === 1
                ? `Delete ${nameOf(confirm[0])}?`
                : `Delete ${confirm?.length ?? 0} holdings?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes {confirm?.length === 1 ? "it" : "them"} from your portfolio on every
              device. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirm && void runDelete(confirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
          ? `No holdings with ${brokerFilter}.`
          : 'Your portfolio is empty. Click "Add New Investment" above to track your growth.'}
      </p>
    </div>
  );
}

// checkbox · holding · LTP · invested · current · P&L · menu — one template
// for the title row and every holding row, so the columns line up exactly.
const GRID =
  "md:grid md:grid-cols-[1.5rem_minmax(0,1fr)_7rem_8.5rem_8.5rem_9.5rem_2.25rem] md:items-center md:gap-x-4";

function HoldingsTable({
  records,
  live,
  selected,
  onToggle,
  onToggleAll,
  onEdit,
  onAskDelete,
}: {
  records: InvestmentRecord[];
  live: ReturnType<typeof useLivePrices>["live"];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  onEdit: (rec: InvestmentRecord) => void;
  onAskDelete: (id: string) => void;
}) {
  const picked = records.filter((r) => selected.has(r.id)).length;
  const all = picked === records.length;

  return (
    <div className="mt-3" role="table" aria-label="Holdings">
      <div
        role="row"
        className={cn(
          GRID,
          "hidden px-2 pb-2 border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground",
        )}
      >
        <span role="columnheader">
          <Checkbox
            aria-label={all ? "Clear all" : "Select all"}
            checked={all ? true : picked > 0 ? "indeterminate" : false}
            onCheckedChange={() => onToggleAll(!all)}
          />
        </span>
        <span role="columnheader">Holding</span>
        <span role="columnheader" className="text-right">LTP</span>
        <span role="columnheader" className="text-right">Invested</span>
        <span role="columnheader" className="text-right">Current</span>
        <span role="columnheader" className="text-right">P&amp;L</span>
        <span role="columnheader" className="sr-only">Actions</span>
      </div>

      <ul className="divide-y divide-border">
        {records.map((r) => {
          const invested = getInvested(r);
          const tick = live[r.id];
          const tracked = isLiveAsset(r.asset) && tick !== undefined;
          const current = tracked ? tick.currentValue : getCurrent(r);
          const gain = current - invested;
          const up = gain >= 0;
          const qty = quantityOf(r);
          const avg = averagePriceOf(r);
          const isOn = selected.has(r.id);
          const name = getRecordName(r);
          const sub =
            qty > 0
              ? `Qty ${qty2(qty)}${avg > 0 ? `  ·  Avg ${money2(avg, r.currency)}` : ""}`
              : ASSET_LABELS[r.asset];
          const gainClass = up ? "text-success" : "text-destructive";

          return (
            <li
              key={r.id}
              role="row"
              aria-selected={isOn}
              className={cn(
                GRID,
                "group px-2 py-3 transition-colors hover:bg-muted/40",
                isOn && "bg-primary/5",
              )}
            >
              {/* Phone width: the same three lines as the mobile app. */}
              <div className="flex items-start gap-3 md:contents">
                <span role="cell" className="pt-0.5 md:pt-0">
                  <Checkbox
                    aria-label={`Select ${name}`}
                    checked={isOn}
                    onCheckedChange={() => onToggle(r.id)}
                  />
                </span>

                <div role="cell" className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-foreground break-words">{name}</span>
                    <span className={cn("md:hidden font-semibold tabular-nums whitespace-nowrap", gainClass)}>
                      {signedMoney2(gain, r.currency)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                    <span>{sub}</span>
                    <span className={cn("md:hidden font-medium whitespace-nowrap", gainClass)}>
                      {signedPct2(gain, invested)}
                    </span>
                  </div>
                  <div className="md:hidden mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground tabular-nums">
                    <span className="whitespace-nowrap">
                      Invt. <span className="font-medium text-foreground">{money2(invested, r.currency)}</span>
                    </span>
                    <span className="whitespace-nowrap">
                      Total <span className="font-medium text-foreground">{money2(current, r.currency)}</span>
                    </span>
                  </div>
                </div>

                <span role="cell" className="hidden md:block text-right text-sm tabular-nums">
                  {tracked ? (
                    <span
                      key={tick.updatedAt}
                      className={cn(
                        "rounded px-1",
                        tick.direction === "up" && "animate-flash-up",
                        tick.direction === "down" && "animate-flash-down",
                      )}
                    >
                      {money2(tick.unitPrice, r.currency)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
                <span role="cell" className="hidden md:block text-right text-sm tabular-nums">
                  {money2(invested, r.currency)}
                </span>
                <span role="cell" className="hidden md:block text-right text-sm font-semibold tabular-nums">
                  {money2(current, r.currency)}
                </span>
                <span role="cell" className={cn("hidden md:block text-right tabular-nums", gainClass)}>
                  <span className="block text-sm font-semibold whitespace-nowrap">{signedMoney2(gain, r.currency)}</span>
                  <span className="block text-xs">{signedPct2(gain, invested)}</span>
                </span>

                <span role="cell" className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        aria-label={`Actions for ${name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEdit(r)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit / details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => onAskDelete(r.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
