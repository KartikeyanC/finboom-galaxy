import { format } from "date-fns";
import { ArrowRight, ArrowRightLeft, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { type Transaction } from "@/hooks/useTransactions";
import { formatMoney } from "@/lib/finance";
import { transferNote, transferSourceId } from "@/lib/transferMeta";

/**
 * Recent transfers between the user's own accounts — split out of
 * AccountsManager.tsx in Stage 4.13.
 *
 * Resolving the source account still reads `account_id ?? transferSourceId(description)`:
 * Stage 3.4 moved that link into a real column but left pre-migration rows
 * carrying it in the description, so the fallback is load-bearing, not legacy
 * clutter. It renders nothing when there are no transfers, exactly as the
 * inline block did.
 */
export default function TransferList({
  transfers,
  accountName,
  balancesHidden,
  onNew,
  onEdit,
  onDelete,
}: {
  transfers: Transaction[];
  accountName: (id: string | null | undefined) => string;
  balancesHidden: boolean;
  onNew: () => void;
  onEdit: (txn: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
          {transfers.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg">Transfers</CardTitle>
                  <CardDescription>
                    Money moved between your own accounts — not income or spending.
                  </CardDescription>
                </div>
                <Button size="sm" variant="ghost" className="gap-1.5 text-sky-400 hover:text-sky-300" onClick={onNew}>
                  <ArrowRightLeft className="h-3.5 w-3.5" /> New
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {transfers.slice(0, 8).map((t) => {
                  const note = transferNote(t.description);
                  return (
                    <div
                      key={t.id}
                      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-400">
                        <ArrowRightLeft className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm text-foreground truncate">
                          <span className="truncate">
                            {accountName(t.account_id ?? transferSourceId(t.description))}
                          </span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{accountName(t.transfer_to_account_id)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {format(new Date(t.occurred_at), "PP")}
                          {note ? ` · ${note}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                        {balancesHidden ? "••••" : formatMoney(t.amount, t.currency)}
                      </span>
                      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onEdit(t)}
                          aria-label="Edit transfer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => onDelete(t.id)}
                          aria-label="Delete transfer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
    </>
  );
}
