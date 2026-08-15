import { useEffect, useState } from "react";
import { ArrowRight, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DateTimeField from "@/components/transactions/DateTimeField";
import { CURRENCIES } from "@/lib/finance";
import { useAccounts } from "@/lib/accountsStore";
import {
  TRANSFER_CATEGORY,
  transferNote,
  transferSourceId,
} from "@/lib/transferMeta";
import {
  useCreateTransaction,
  useUpdateTransaction,
  type Transaction,
} from "@/hooks/useTransactions";
import { toast } from "sonner";

/**
 * Moving money between your own accounts (BUG-025).
 *
 * The amount is always positive — direction comes from which side an account
 * sits on, never from a sign. `transactions_type_check` and
 * `transactions_transfer_dest_check` enforce the shape server-side too, so a
 * bad payload is refused by the database as well as by this form.
 * See `lib/transferMeta.ts` for how the two ends are stored.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Transaction | null;
}

export default function TransferDialog({ open, onOpenChange, initial }: Props) {
  const isEdit = !!initial;
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const { accounts } = useAccounts();

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setAmount(String(initial.amount));
      setCurrency(initial.currency);
      // Column first; the prefix parse only covers rows an older client wrote.
      setFromId(initial.account_id ?? transferSourceId(initial.description) ?? "");
      setToId(initial.transfer_to_account_id ?? "");
      setNote(transferNote(initial.description));
      setOccurredAt(new Date(initial.occurred_at).toISOString());
    } else {
      setAmount("");
      setCurrency("INR");
      setFromId("");
      setToId("");
      setNote("");
      setOccurredAt(new Date().toISOString());
    }
  }, [open, initial]);

  const busy = create.isPending || update.isPending;
  const value = Number(amount);
  const sameAccount = !!fromId && fromId === toId;
  const canSave = Number.isFinite(value) && value > 0 && !!fromId && !!toId && !sameAccount;

  const submit = async () => {
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter an amount to move");
    if (!fromId) return toast.error("Choose the account the money leaves");
    if (!toId) return toast.error("Choose the account the money arrives in");
    if (sameAccount) return toast.error("Pick two different accounts");

    const occurred = new Date(occurredAt);
    const occurredSafe = isNaN(occurred.getTime()) ? new Date() : occurred;

    // Stage 3.4: both ends of a transfer are now real columns — `account_id` is
    // the source, `transfer_to_account_id` the destination. The description is
    // the user's note and nothing else. `payment_mode` stays null: "Transfer"
    // was never a payment mode, only a marker in the old encoding.
    const payload = {
      type: "transfer" as const,
      amount: value,
      currency,
      category: TRANSFER_CATEGORY,
      description: note.trim() || null,
      account_id: fromId,
      payment_mode: null,
      occurred_at: occurredSafe.toISOString(),
      transfer_to_account_id: toId,
    };

    try {
      if (isEdit && initial) {
        await update.mutateAsync({ id: initial.id, ...payload });
      } else {
        await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      /* toast handled in the hook */
    }
  };

  const accountLabel = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.name}${a.bank ? ` · ${a.bank}` : ""}` : "—";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="font-display flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-sky-400" />
            {isEdit ? "Edit transfer" : "Move money"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 grid gap-4">
          {accounts.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              A transfer needs two accounts. Add another account first.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-amount">Amount</Label>
                  <MoneyInput
                    id="transfer-amount"
                    placeholder="0"
                    value={amount}
                    onValueChange={(n) => setAmount(n === undefined ? "" : String(n))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>From</Label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger><SelectValue placeholder="Account the money leaves" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}{a.bank ? ` · ${a.bank}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>To</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger><SelectValue placeholder="Account the money arrives in" /></SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== fromId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}{a.bank ? ` · ${a.bank}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {sameAccount && (
                  <p className="text-xs text-coral">Pick two different accounts.</p>
                )}
              </div>

              {canSave && (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2.5 text-xs">
                  <span className="text-foreground font-medium">{accountLabel(fromId)}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="text-foreground font-medium">{accountLabel(toId)}</span>
                  <span className="text-muted-foreground">
                    · {currency} {value.toLocaleString("en-IN")}
                  </span>
                </div>
              )}

              <DateTimeField value={occurredAt} onChange={setOccurredAt} />

              <div className="space-y-1.5">
                <Label htmlFor="transfer-note">Note (optional)</Label>
                <Input
                  id="transfer-note"
                  maxLength={400}
                  placeholder="e.g. Move to savings"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Transfers only move money between your accounts — they are left out of
                income, spending and savings-rate totals.
              </p>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/40 bg-background/80 backdrop-blur">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !canSave}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
