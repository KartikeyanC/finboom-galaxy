import { useEffect, useMemo, useState } from "react";
import { Search, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { categoryBadgeClass } from "@/lib/categories";
import {
  candidateCategories,
  filterReviewCandidates,
  selectAllShown,
  selectableCandidates,
  selectionSummary,
  toggleSelection,
} from "@/lib/trackerReview";
import { CANDIDATE_LIMIT, useUntaggedCandidates } from "@/hooks/useTrackerTransactions";
import type { Tracker } from "@/lib/trackers";

/**
 * "Review previous transactions" — the historical assignment flow.
 *
 * 🔴 Every checkbox starts UNCHECKED and stays that way until a person clicks
 * it. There is no suggestion, no pre-selection, no "these look like
 * construction". Assigning re-categorises real financial history, and a
 * confident wrong guess is worse than no guess because the user will not know
 * to go looking for it.
 *
 * Filtering narrows what is SHOWN, never what is SELECTED — see
 * lib/trackerReview.ts, where both rules are unit-tested.
 */
export default function HistoricalReviewDialog({
  open,
  onOpenChange,
  tracker,
  isLight,
  onAssign,
  onSkip,
  assigning,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tracker: Tracker;
  isLight: boolean;
  onAssign: (ids: string[]) => void;
  onSkip: () => void;
  assigning?: boolean;
}) {
  const { data: rows = [], isLoading, isError } = useUntaggedCandidates(tracker, open);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [cats, setCats] = useState<string[]>([]);
  const [minAmount, setMinAmount] = useState("");

  // Reopening starts from nothing selected — a stale selection from a previous
  // visit is exactly the kind of thing that gets assigned by accident.
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setCats([]);
      setMinAmount("");
    }
  }, [open]);

  const candidates = useMemo(() => selectableCandidates(rows, tracker), [rows, tracker]);
  const allCategories = useMemo(() => candidateCategories(candidates), [candidates]);
  const shown = useMemo(
    () =>
      filterReviewCandidates(candidates, {
        categories: cats,
        minAmount: minAmount ? Number(minAmount) : undefined,
      }),
    [candidates, cats, minAmount],
  );

  const summary = useMemo(() => selectionSummary(candidates, selected), [candidates, selected]);

  const toggleCat = (c: string) =>
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="font-display">Review previous transactions</DialogTitle>
          <DialogDescription>
            {tracker.name} starts{" "}
            {new Date(`${tracker.start_date}T00:00:00.000Z`).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
            , before you created it. Tick anything that belongs to it.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-border/40 space-y-3">
          {/* Said plainly, where the decision is actually being made. */}
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Assigning a transaction only labels it. No money moves, no balance changes, and it
            stays in your expense list exactly as it is now.
          </p>

          {allCategories.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {allCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCat(c)}
                  aria-pressed={cats.includes(c)}
                  className={cn(
                    "text-xs rounded-full border px-2.5 py-1 min-h-[24px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    cats.includes(c)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:bg-accent/40",
                  )}
                >
                  {c}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-auto">
                <Label htmlFor="min-amt" className="text-xs text-muted-foreground">
                  Min ₹
                </Label>
                <Input
                  id="min-amt"
                  inputMode="numeric"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value.replace(/[^\d]/g, ""))}
                  className="h-7 w-24 text-xs"
                  placeholder="0"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Those transactions could not be loaded just now. Close this and try again — nothing
              has been changed.
            </p>
          ) : candidates.length === 0 ? (
            <div className="text-center py-10">
              <Search className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                There are no untagged transactions between this tracker's start date and today.
                Anything already assigned to another tracker is deliberately left alone.
              </p>
            </div>
          ) : shown.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground">
                No transactions match those filters. Clear them to see the other{" "}
                {candidates.length}.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setCats([]);
                  setMinAmount("");
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {shown.map((t) => {
                const checked = selected.has(t.id);
                return (
                  <li key={t.id}>
                    <label className="flex items-center gap-3 py-2.5 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => setSelected((s) => toggleSelection(s, t.id))}
                        aria-label={`Assign ${t.description || t.category} to ${tracker.name}`}
                      />
                      <span className="text-xs font-mono text-foreground/65 shrink-0 tabular-nums w-16">
                        {new Date(t.occurred_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0",
                          categoryBadgeClass(
                            t.type === "income" ? "income" : "expense",
                            t.category,
                            isLight,
                          ),
                        )}
                      >
                        {t.category}
                      </span>
                      <span className="text-sm text-foreground truncate min-w-0 flex-1">
                        {t.description || t.category}
                      </span>
                      <span className="text-sm font-medium tabular-nums shrink-0">
                        {formatMoney(Number(t.amount), t.currency)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {candidates.length >= CANDIDATE_LIMIT && (
            <p className="text-xs text-muted-foreground text-center pt-3">
              Showing the {CANDIDATE_LIMIT} most recent. Narrow the tracker's dates to see the rest.
            </p>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border/40 flex-col sm:flex-row sm:items-center gap-2">
          <div className="mr-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">
              {summary.count} selected
              {summary.count > 0 ? ` · ${formatMoney(summary.totalINR)}` : ""}
            </span>
            {shown.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setSelected((s) =>
                    // Both halves are explicit user actions, never automatic.
                    summary.count > 0 ? new Set() : selectAllShown(s, shown),
                  )
                }
              >
                {summary.count > 0 ? "Clear selection" : "Select all shown"}
              </Button>
            )}
          </div>
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button
            onClick={() => onAssign([...selected])}
            disabled={summary.count === 0 || assigning}
          >
            {assigning
              ? "Assigning…"
              : `Assign ${summary.count || ""} ${summary.count === 1 ? "transaction" : "transactions"}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
