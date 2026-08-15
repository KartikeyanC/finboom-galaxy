import { useState } from "react";
import {
  Plus, Wallet, ArrowDownLeft, ArrowUpRight, Trash2,
  ChevronDown, ChevronUp, Pencil, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import {
  useDematAccounts,
  type DematAccountWithBalance,
  type DematLedgerEntry,
} from "@/hooks/useDematAccounts";
import { BROKERS, BROKER_TINTS, type Broker } from "@/lib/investmentsStore";
import DematFundDialog from "./DematFundDialog";

const TXN_LABEL: Record<string, string> = {
  fund_in: "Added Funds",
  fund_out: "Withdrew",
  buy: "Bought",
  sell: "Sold",
  dividend: "Dividend",
};

const TXN_SIGN: Record<string, 1 | -1> = {
  fund_in: 1, sell: 1, dividend: 1,
  fund_out: -1, buy: -1,
};

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(n);
}

// ── Opening Balance mini-dialog ───────────────────────────────────────────────
interface OpeningBalanceDialogProps {
  account: DematAccountWithBalance;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (balance: number, date: string | null) => Promise<void>;
}

function OpeningBalanceDialog({ account, open, onOpenChange, onSave }: OpeningBalanceDialogProps) {
  const [balance, setBalance] = useState(String(account.openingBalance || ""));
  const [date, setDate]       = useState(account.openingDate ?? "");
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    const amt = parseFloat(balance);
    if (isNaN(amt) || amt < 0) { toast.error("Enter a valid amount (0 or more)"); return; }
    setSaving(true);
    await onSave(amt, date || null);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Opening Balance</DialogTitle>
          <DialogDescription>
            Enter the cash balance that was already in your{" "}
            <strong>{account.nickname ?? account.broker}</strong> account before you started
            using FinRoot. This will <strong>not</strong> create any bank expense or income entry.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
          <p className="font-semibold">Why use this instead of "Add Funds"?</p>
          <p>
            "Add Funds" records a bank → demat transfer for <em>today</em>. Opening Balance
            sets a historical starting point — no bank transaction is touched.
          </p>
        </div>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Opening Cash Balance ({account.currency})</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 25000"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              How much cash was sitting in this account on the day you started tracking.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>As of Date (optional)</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The date this balance was accurate — e.g. the day before you opened FinRoot.
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Opening Balance"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Account card ──────────────────────────────────────────────────────────────
interface AccountCardProps {
  account: DematAccountWithBalance;
  onRecord: (acc: DematAccountWithBalance) => void;
  onEdit: (acc: DematAccountWithBalance, entry: DematLedgerEntry) => void;
  onSetOpening: (acc: DematAccountWithBalance) => void;
  onDelete: (id: string) => void;
  onDeleteLedger: (id: string) => void;
}

function AccountCard({ account, onRecord, onEdit, onSetOpening, onDelete, onDeleteLedger }: AccountCardProps) {
  const [showLedger, setShowLedger] = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);

  const tint  = BROKER_TINTS[account.broker as Broker] ?? "bg-muted text-muted-foreground border-border";
  const isNeg = account.balance < 0;

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={tint}>{account.broker}</Badge>
            {account.nickname && (
              <span className="text-sm text-muted-foreground">{account.nickname}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="outline"
              title="Set opening / pre-FinRoot balance"
              onClick={() => onSetOpening(account)}
            >
              <History className="w-3 h-3 mr-1" /> Opening
            </Button>
            <Button size="sm" variant="outline" onClick={() => onRecord(account)}>
              <Plus className="w-3 h-3 mr-1" /> Record
            </Button>
            <Button
              size="icon" variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete(account.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Available Cash</p>
            <p className={`text-lg font-bold font-display ${isNeg ? "text-destructive" : "text-foreground"}`}>
              {fmt(account.balance, account.currency)}
            </p>
            {account.openingBalance > 0 && (
              <p className="text-xs text-muted-foreground/70">
                incl. {fmt(account.openingBalance, account.currency)} opening
              </p>
            )}
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowDownLeft className="w-3 h-3 text-emerald-500" /> Funded
            </p>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              {fmt(account.totalFunded, account.currency)}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-rose-500" /> Withdrawn
            </p>
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
              {fmt(account.totalWithdrawn, account.currency)}
            </p>
          </div>
        </div>

        {/* opening balance callout if set */}
        {account.openingBalance > 0 && (
          <div className="flex items-center justify-between rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <History className="w-3 h-3" />
              <span>Opening balance{account.openingDate ? ` · ${account.openingDate}` : ""}</span>
            </div>
            <span className="font-semibold text-foreground">
              {fmt(account.openingBalance, account.currency)}
            </span>
          </div>
        )}

        {account.ledger.length > 0 && (
          <div>
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setShowLedger((v) => !v)}
            >
              {showLedger ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
              {account.ledger.length} transaction{account.ledger.length !== 1 ? "s" : ""}
            </Button>

            {showLedger && (
              <div className="mt-2 divide-y divide-border rounded-md border text-sm">
                {[...account.ledger].reverse().map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/40 group">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{TXN_LABEL[e.type]}</span>
                        {e.note && <span className="text-muted-foreground text-xs">{e.note}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{e.txnDate}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`font-semibold tabular-nums mr-1 ${TXN_SIGN[e.type] === 1 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {TXN_SIGN[e.type] === 1 ? "+" : "−"}{fmt(e.amount, account.currency)}
                      </span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onEdit(account, e)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive" onClick={() => setDeleteId(e.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the transaction and adjust your balance. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) { onDeleteLedger(deleteId); setDeleteId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────
export default function DematAccountsSection() {
  const {
    accounts, createAccount, updateAccount,
    deleteAccount, addLedgerEntry, updateLedgerEntry, deleteLedgerEntry,
  } = useDematAccounts();

  const [addOpen, setAddOpen]       = useState(false);
  const [newBroker, setNewBroker]   = useState<Broker>("Zerodha");
  const [newNickname, setNewNickname] = useState("");
  const [newCurrency, setNewCurrency] = useState("INR");
  const [newOpening, setNewOpening]   = useState("");
  const [newOpenDate, setNewOpenDate] = useState("");
  const [saving, setSaving]           = useState(false);

  const [recordTarget, setRecordTarget]     = useState<DematAccountWithBalance | null>(null);
  const [editingEntry, setEditingEntry]     = useState<DematLedgerEntry | null>(null);
  const [openingTarget, setOpeningTarget]   = useState<DematAccountWithBalance | null>(null);
  const [deleteTarget, setDeleteTarget]     = useState<string | null>(null);

  const handleEditEntry = (acc: DematAccountWithBalance, entry: DematLedgerEntry) => {
    setRecordTarget(acc);
    setEditingEntry(entry);
  };

  const handleCreate = async () => {
    if (!newBroker) return;
    setSaving(true);
    const id = await createAccount(
      newBroker,
      newNickname || null,
      newCurrency,
      parseFloat(newOpening) || 0,
      newOpenDate || null,
    );
    setSaving(false);
    if (!id) return;
    toast.success("Demat account added");
    setNewNickname(""); setNewOpening(""); setNewOpenDate("");
    setAddOpen(false);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" /> Broker / Demat Accounts
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Idle cash sitting in your brokerage — money transferred in but not yet invested.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <Wallet className="w-8 h-8 text-muted-foreground/50" />
            <div>
              <p className="font-medium text-foreground">No demat accounts yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Add your broker account (Zerodha, Groww, etc.) to track cash you've transferred in before buying stocks.
              </p>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onRecord={(a) => { setEditingEntry(null); setRecordTarget(a); }}
              onEdit={handleEditEntry}
              onSetOpening={setOpeningTarget}
              onDelete={setDeleteTarget}
              onDeleteLedger={deleteLedgerEntry}
            />
          ))}
        </div>
      )}

      {/* ── Add account dialog ─────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Demat / Broker Account</DialogTitle>
            <DialogDescription>
              Track idle cash in your brokerage account separately from your investments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Broker</Label>
              <Select value={newBroker} onValueChange={(v) => setNewBroker(v as Broker)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BROKERS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nickname (optional)</Label>
              <Input placeholder="e.g. Main trading account" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={newCurrency} onValueChange={setNewCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR ₹</SelectItem>
                  <SelectItem value="USD">USD $</SelectItem>
                  <SelectItem value="AED">AED د.إ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Opening balance — the key new fields */}
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Opening Balance (optional)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cash already in this account before you started using FinRoot.
                  Will <strong>not</strong> affect your bank balance or expenses.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    value={newOpening}
                    onChange={(e) => setNewOpening(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">As of Date</Label>
                  <Input
                    type="date"
                    value={newOpenDate}
                    onChange={(e) => setNewOpenDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                {saving ? "Adding…" : "Add Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Record transaction dialog ──────────────────────────────────── */}
      {recordTarget && (
        <DematFundDialog
          open={!!recordTarget}
          onOpenChange={(v) => { if (!v) { setRecordTarget(null); setEditingEntry(null); } }}
          account={recordTarget}
          editing={editingEntry}
          onAdd={(type, amount, date, note) =>
            addLedgerEntry(recordTarget.id, type, amount, date, note)
          }
          onUpdate={(id, type, amount, date, note) =>
            updateLedgerEntry(id, type, amount, date, note)
          }
        />
      )}

      {/* ── Opening balance dialog ─────────────────────────────────────── */}
      {openingTarget && (
        <OpeningBalanceDialog
          account={openingTarget}
          open={!!openingTarget}
          onOpenChange={(v) => { if (!v) setOpeningTarget(null); }}
          onSave={async (balance, date) => {
            await updateAccount(openingTarget.id, { openingBalance: balance, openingDate: date });
            toast.success("Opening balance updated");
          }}
        />
      )}

      {/* ── Delete account confirmation ────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this demat account?</AlertDialogTitle>
            <AlertDialogDescription>
              All transactions for this account will also be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { deleteAccount(deleteTarget); setDeleteTarget(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
