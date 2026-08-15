import { format } from "date-fns";
import { ArrowRight, History } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  useAccountBalanceHistory,
  type BalanceSnapshot,
} from "@/hooks/useAccountBalanceHistory";

/**
 * The per-account balance-snapshot timeline — split out of
 * AccountsManager.tsx in Stage 4.13. It owns its own fetch (keyed on the
 * account it is opened for) and takes nothing from the page but the account
 * to show, so it never belonged inside a 1 000-line file.
 */
// ── Balance History Sheet ───────────────────────────────────────────────────
export default function BalanceHistorySheet({
  account,
  onClose,
}: {
  account: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const { data: history = [], isLoading } = useAccountBalanceHistory(account?.id ?? null);

  const fmt = (n: number) =>
    "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <Sheet open={!!account} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center">
              <History className="h-4 w-4 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold leading-tight">
                Balance History
              </SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                {account?.name ?? "Account"} · all manual updates
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center">
                <History className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-foreground/70">No history yet</p>
              <p className="text-xs text-muted-foreground max-w-[220px]">
                Every time you update this account's balance, a snapshot will appear here.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border/50" />

              <div className="space-y-1">
                {history.map((snap: BalanceSnapshot, i) => {
                  const diff = Number(snap.new_balance) - Number(snap.old_balance);
                  const isUp = diff >= 0;
                  const isFirst = i === 0;
                  return (
                    <div key={snap.id} className="flex gap-4 relative pb-4">
                      {/* Timeline dot */}
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0 z-10 border-2",
                        isFirst
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background border-border/60 text-muted-foreground",
                      )}>
                        <History className="h-4 w-4" />
                      </div>

                      {/* Card */}
                      <div className={cn(
                        "flex-1 rounded-lg border p-3 space-y-1.5",
                        isFirst ? "border-primary/30 bg-primary/5" : "border-border/40 bg-card/40",
                      )}>
                        {/* Date + badge */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {format(new Date(snap.created_at), "dd MMM yyyy · hh:mm a")}
                          </span>
                          {isFirst && (
                            <span className="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                              Latest
                            </span>
                          )}
                        </div>

                        {/* Old → New */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground tabular-nums">{fmt(snap.old_balance)}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="font-semibold tabular-nums text-foreground">{fmt(snap.new_balance)}</span>
                        </div>

                        {/* Difference */}
                        <div className={cn(
                          "text-xs font-semibold tabular-nums",
                          diff === 0 ? "text-muted-foreground" : isUp ? "text-emerald-400" : "text-red-400",
                        )}>
                          {diff === 0 ? "No change" : `${isUp ? "+" : ""}${fmt(diff)}`}
                          {diff !== 0 && (
                            <span className="ml-1 font-normal text-muted-foreground">
                              {isUp ? "added" : "reduced"}
                            </span>
                          )}
                        </div>

                        {/* Note */}
                        {snap.note && (
                          <p className="text-xs text-muted-foreground italic border-t border-border/30 pt-1.5 mt-1">
                            "{snap.note}"
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Summary footer */}
        {history.length > 0 && (
          <div className="border-t border-border/40 px-6 py-3 bg-muted/10">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{history.length} snapshot{history.length !== 1 ? "s" : ""} recorded</span>
              <span>
                First: {format(new Date(history[history.length - 1].created_at), "dd MMM yyyy")}
              </span>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
