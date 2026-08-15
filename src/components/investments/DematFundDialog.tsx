import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  type DematAccountWithBalance,
  type DematLedgerEntry,
  type DematTxnType,
} from "@/hooks/useDematAccounts";
import { useAccounts } from "@/lib/accountsStore";
import { useCreateTransaction, useTransactions } from "@/hooks/useTransactions";
import { useMemo } from "react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: DematAccountWithBalance;
  editing?: DematLedgerEntry | null;
  onAdd: (type: DematTxnType, amount: number, date: string, note: string) => Promise<void>;
  onUpdate: (id: string, type: DematTxnType, amount: number, date: string, note: string) => Promise<void>;
}

const TXN_TYPES: { value: DematTxnType; label: string; desc: string }[] = [
  { value: "fund_in",  label: "Add Funds",      desc: "Bank → Demat (money you transferred in)" },
  { value: "fund_out", label: "Withdraw",        desc: "Demat → Bank (money you withdrew back)" },
  { value: "buy",      label: "Buy Investment",  desc: "Used to buy stocks / MF (deducted from balance)" },
  { value: "sell",     label: "Sell Proceeds",   desc: "Sale credited back to demat account" },
  { value: "dividend", label: "Dividend / Int.", desc: "Dividend or interest credited by broker" },
];

const BANK_LINKED_TYPES = new Set<DematTxnType>(["fund_in", "fund_out"]);

export default function DematFundDialog({ open, onOpenChange, account, editing, onAdd, onUpdate }: Props) {
  const { accounts } = useAccounts();
  const createTxn = useCreateTransaction();
  const { data: allTransactions = [] } = useTransactions();

  const liveBalances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of accounts) map[a.id] = Number(a.openingBalance || 0);
    for (const txn of allTransactions) {
      const m = (txn.description ?? "").match(/^\[([^\]|]+)\|([^\]]+)\]/);
      const id = m ? m[2] : null;
      if (!id || !(id in map)) continue;
      if (txn.type === "expense") map[id] -= Number(txn.amount);
      else if (txn.type === "income") map[id] += Number(txn.amount);
    }
    return map;
  }, [accounts, allTransactions]);

  const isEdit = !!editing;

  const [type, setType] = useState<DematTxnType>("fund_in");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [autoRecord, setAutoRecord] = useState(true);
  const [saving, setSaving] = useState(false);

  // Pre-fill fields when editing an existing entry
  useEffect(() => {
    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      setDate(editing.txnDate);
      setNote(editing.note ?? "");
      setAutoRecord(false); // don't auto-create another bank tx on edit
    } else {
      setType("fund_in");
      setAmount("");
      setDate(new Date().toISOString().slice(0, 10));
      setNote("");
      setAutoRecord(true);
    }
  }, [editing, open]);

  const selected = TXN_TYPES.find((t) => t.value === type)!;
  const needsBankAccount = BANK_LINKED_TYPES.has(type);
  const bankAccounts = accounts.filter((a) =>
    ["bank", "debit", "wallet", "cash"].includes(a.type)
  );
  const selectedBankAccount = bankAccounts.find((a) => a.id === selectedAccountId);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (needsBankAccount && autoRecord && !selectedAccountId) {
      toast.error("Select a bank account or turn off auto-record");
      return;
    }

    setSaving(true);

    if (isEdit) {
      await onUpdate(editing!.id, type, amt, date, note);
      toast.success("Entry updated");
    } else {
      await onAdd(type, amt, date, note);

      if (needsBankAccount && autoRecord && selectedBankAccount) {
        const brokerName = account.nickname ?? account.broker;
        const detail = type === "fund_in"
          ? `Transfer to ${brokerName}`
          : `Withdrawal from ${brokerName}`;
        // Stage 3.4: this used to write `[<account name>|<id>]` into the
        // description — putting an account NAME in the slot every other writer
        // used for a payment mode, which is why the backfill only accepts a tag
        // it recognises. The account is a column now, and the mode is honest:
        // funding a demat account is a bank transfer, not a UPI/Cash payment.
        await createTxn.mutateAsync({
          type: type === "fund_in" ? "expense" : "income",
          amount: amt,
          currency: account.currency,
          category: "Investment",
          description: detail,
          account_id: selectedBankAccount.id,
          payment_mode: "Net Banking",
          occurred_at: new Date(date).toISOString(),
        });
      }

      toast.success("Entry recorded");
    }

    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Transaction" : `${account.nickname ?? account.broker} — Record Transaction`}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details of this demat transaction."
              : "Track money flowing in or out of this demat account."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Transaction Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DematTxnType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TXN_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{selected.desc}</p>
          </div>

          {needsBankAccount && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {type === "fund_in" ? "From Bank Account" : "To Bank Account"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Auto-record matching transaction in your bank account
                  </p>
                </div>
                <Switch checked={autoRecord} onCheckedChange={setAutoRecord} />
              </div>

              {autoRecord && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Select Account</Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose your bank account…" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          No bank accounts found — add one in Accounts
                        </SelectItem>
                      ) : (
                        bankAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}{a.bank ? ` · ${a.bank}` : ""}
                            {a.last4 ? ` ····${a.last4}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedBankAccount && (() => {
                    const bal = liveBalances[selectedBankAccount.id] ?? 0;
                    const fmt = (n: number) =>
                      new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
                    const low = type === "fund_in" && parseFloat(amount || "0") > bal;
                    return (
                      <div className="space-y-1.5">
                        <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium border ${
                          low
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-600"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                        }`}>
                          <span className="text-muted-foreground font-normal">Available balance</span>
                          <span>{fmt(bal)}</span>
                        </div>
                        {low && (
                          <p className="text-xs text-rose-500">Amount exceeds available balance</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {type === "fund_in"
                            ? `₹${amount || "0"} will be recorded as an expense from ${selectedBankAccount.name}`
                            : `₹${amount || "0"} will be recorded as income to ${selectedBankAccount.name}`}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Amount ({account.currency})</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              placeholder="e.g. Transferred from SBI savings"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Record"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
