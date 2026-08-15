import { Archive, History, Pencil, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ICONS, colorStyle, type SavedAccount } from "./accountMeta";

/**
 * The saved-accounts list — split out of AccountsManager.tsx in Stage 4.13.
 *
 * Presentational: every action is a callback, and the balance it shows is the
 * shared live balance (opening balance ± linked transactions) resolved by the
 * page, NOT recomputed here — two places computing a balance is how they drift.
 */
export default function AccountList({
  accounts,
  liveBalances,
  balancesHidden,
  editingAccountId,
  onHistory,
  onEdit,
  onRemove,
}: {
  accounts: SavedAccount[];
  liveBalances: Record<string, number>;
  balancesHidden: boolean;
  editingAccountId: string | null;
  onHistory: (account: { id: string; name: string }) => void;
  onEdit: (account: SavedAccount) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
              {accounts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                  No accounts yet. Add one from the form to see it here.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {accounts.map((a) => {
                    const I = ICONS.find((i) => i.id === a.icon)?.icon ?? Wallet;
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg border bg-card/40 p-3 overflow-hidden transition-colors",
                          editingAccountId === a.id
                            ? "border-primary/60 ring-1 ring-primary/40"
                            : "border-border/60",
                        )}
                      >
                        <div
                          className="absolute left-0 top-0 h-full w-1.5"
                          style={colorStyle(a.color)}
                        />
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0 ml-2"
                          style={colorStyle(a.color)}
                        >
                          <I className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium truncate">{a.name}</div>
                            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                              •••• {a.last4 || "0000"}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {a.purposes.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                No purpose tags
                              </span>
                            ) : (
                              a.purposes.map((p) => (
                                <Badge key={p} variant="secondary" className="text-xs">
                                  {p}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold tabular-nums">
                            {balancesHidden ? (
                              <span className="tracking-widest text-muted-foreground">₹ ••••••</span>
                            ) : (
                              <>
                                ₹
                                {(liveBalances[a.id] ?? Number(a.openingBalance || 0)).toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </>
                            )}
                          </div>
                          <div className="mt-1 flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => onHistory({ id: a.id, name: a.name })}
                              aria-label="Balance history"
                              title="Balance history"
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => onEdit(a)}
                              aria-label="Edit account"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => toast.message("Archived (mock)")}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => onRemove(a.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
    </>
  );
}
