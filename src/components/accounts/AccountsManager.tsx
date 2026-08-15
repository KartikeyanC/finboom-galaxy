import { useMemo, useState } from "react";
import { useAccounts } from "@/lib/accountsStore";
import {
  Plus, Check, CalendarIcon, ArrowRightLeft, Eye, EyeOff,
} from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSaveBalanceSnapshot } from "@/hooks/useAccountBalanceHistory";
import { useDeleteTransaction, useTransactions, type Transaction } from "@/hooks/useTransactions";
import { useLiveAccountBalances } from "@/hooks/useLiveAccountBalances";
import TransferDialog from "@/components/transactions/TransferDialog";
import {
  ACCOUNT_TYPES,
  BANKS,
  COLORS,
  DEFAULT_PURPOSES,
  ICONS,
  colorStyle,
  emptyForm,
  fromStored,
  toStored,
  type FormState,
  type SavedAccount,
} from "./accountMeta";
import AccountList from "./AccountList";
import AccountPreviewCard from "./AccountPreviewCard";
import BalanceHistorySheet from "./BalanceHistorySheet";
import PurposeChips from "./PurposeChips";
import TransferList from "./TransferList";


export default function AccountsManager() {
  const [form, setForm] = useState<FormState>(emptyForm());
  const { accounts: storedAccounts, setAll: setAllStored } = useAccounts();
  const { data: allTransactions = [] } = useTransactions();
  const accounts: SavedAccount[] = useMemo(
    () => storedAccounts.map(fromStored),
    [storedAccounts],
  );

  /**
   * Live balance = openingBalance ± every transaction linked to the account.
   * Shared with the rest of the app so transfers (which move two accounts at
   * once) are counted here exactly as they are everywhere else.
   */
  const liveBalances = useLiveAccountBalances();

  const transfers = useMemo(
    () =>
      allTransactions
        .filter((t) => t.type === "transfer")
        .sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at)),
    [allTransactions],
  );
  const setAccounts = (
    updater: SavedAccount[] | ((prev: SavedAccount[]) => SavedAccount[]),
  ) => {
    const next = typeof updater === "function" ? updater(accounts) : updater;
    setAllStored(next.map(toStored));
  };
  const [purposeOptions, setPurposeOptions] = useState<string[]>(DEFAULT_PURPOSES);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [historyAccount, setHistoryAccount] = useState<{ id: string; name: string } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transaction | null>(null);
  const deleteTxn = useDeleteTransaction();
  const openTransfer = (txn: Transaction | null) => {
    setEditingTransfer(txn);
    setTransferOpen(true);
  };
  const accountName = (id: string | null | undefined) =>
    accounts.find((a) => a.id === id)?.name ?? "Deleted account";
  const [balancesHidden, setBalancesHidden] = useState<boolean>(() => {
    try { return localStorage.getItem("finroot.balances.hidden") === "1"; } catch { return false; }
  });
  const toggleBalances = () => {
    setBalancesHidden((h) => {
      const next = !h;
      try { localStorage.setItem("finroot.balances.hidden", next ? "1" : "0"); } catch { /* storage unavailable (private mode / quota) — preference is best-effort */ }
      return next;
    });
  };
  const saveSnapshot = useSaveBalanceSnapshot();
  /**
   * The three purpose mutations stay on the page even though the editor moved
   * into PurposeChips: renaming or removing a purpose has to rewrite the tag
   * on the form AND on every saved account, which is this component's data.
   * They return whether the change was accepted so a rejected duplicate leaves
   * the chip editor open with the typed text intact.
   */
  const addPurpose = (v: string) => {
    if (purposeOptions.some((p) => p.toLowerCase() === v.toLowerCase())) {
      toast.error("Purpose already exists");
      return false;
    }
    setPurposeOptions((p) => [...p, v]);
    toast.success("Purpose added");
    return true;
  };

  const renamePurpose = (from: string, to: string) => {
    if (purposeOptions.some((p) => p.toLowerCase() === to.toLowerCase() && p !== from)) {
      toast.error("Purpose already exists");
      return false;
    }
    setPurposeOptions((opts) => opts.map((x) => (x === from ? to : x)));
    setForm((f) => ({
      ...f,
      purposes: f.purposes.map((x) => (x === from ? to : x)),
    }));
    setAccounts((a) =>
      a.map((acc) => ({
        ...acc,
        purposes: acc.purposes.map((x) => (x === from ? to : x)),
      })),
    );
    return true;
  };

  const deletePurpose = (p: string) => {
    setPurposeOptions((opts) => opts.filter((x) => x !== p));
    setForm((f) => ({ ...f, purposes: f.purposes.filter((x) => x !== p) }));
    setAccounts((a) =>
      a.map((acc) => ({ ...acc, purposes: acc.purposes.filter((x) => x !== p) })),
    );
    toast.success("Purpose removed");
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const togglePurpose = (p: string) =>
    setForm((f) => ({
      ...f,
      purposes: f.purposes.includes(p)
        ? f.purposes.filter((x) => x !== p)
        : [...f.purposes, p],
    }));

  const isCard = form.type === "debit" || form.type === "credit";
  const isAccountLike = form.type === "bank" || form.type === "investment";
  const isSimple = form.type === "cash" || form.type === "wallet" || form.type === "other";

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => String(y + i).slice(-2));
  }, []);

  const save = () => {
    if (!form.name.trim()) {
      toast.error("Please enter an account name");
      return;
    }
    if (editingAccountId) {
      const prev = accounts.find((x) => x.id === editingAccountId);
      const oldBal = Number(prev?.openingBalance ?? 0);
      const newBal = Number(form.openingBalance ?? 0);

      setAccounts((a) =>
        a.map((x) => (x.id === editingAccountId ? { ...form, id: editingAccountId } : x)),
      );

      // Auto-snapshot whenever balance changes
      if (oldBal !== newBal) {
        saveSnapshot.mutate({
          account_local_id: editingAccountId,
          account_name: form.name.trim(),
          old_balance: oldBal,
          new_balance: newBal,
        });
      }

      toast.success("Account updated");
      setEditingAccountId(null);
    } else {
      setAccounts((a) => [...a, { ...form, id: crypto.randomUUID() }]);
      toast.success("Account added");
    }
    setForm(emptyForm());
  };

  const remove = (id: string) => {
    setAccounts((a) => a.filter((x) => x.id !== id));
    if (editingAccountId === id) {
      setEditingAccountId(null);
      setForm(emptyForm());
    }
  };

  const startEditAccount = (acc: SavedAccount) => {
    const { id, ...rest } = acc;
    setForm(rest);
    setEditingAccountId(id);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const cancelEditAccount = () => {
    setEditingAccountId(null);
    setForm(emptyForm());
  };

  return (
    <div className="space-y-6 px-5 sm:px-8 lg:px-12 mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Accounts & Wallets</h1>
          <p className="text-sm text-muted-foreground">
            Add and track all your financial storage buckets in one place.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2 border-sky-500/40 text-sky-400 hover:bg-sky-500/10 hover:text-sky-300"
          onClick={() => openTransfer(null)}
          disabled={accounts.length < 2}
          title={accounts.length < 2 ? "Add a second account to move money between them" : undefined}
        >
          <ArrowRightLeft className="h-4 w-4" /> Transfer
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-6">
        {/* LEFT: Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingAccountId ? "Edit Account" : "New Account"}
            </CardTitle>
            <CardDescription>
              {editingAccountId
                ? "Update the details below and save your changes."
                : "Configure the account details below."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Type selector */}
            <div className="space-y-2">
              <Label>Account Type</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {ACCOUNT_TYPES.map((t) => {
                  const Active = form.type === t.id;
                  const I = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => set("type", t.id)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all",
                        Active
                          ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                          : "border-border/60 hover:border-border bg-card/40"
                      )}
                    >
                      <I className="h-4 w-4 mb-1.5 text-primary" />
                      <div className="text-xs font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Account Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={isSimple ? "Wallet Name" : "e.g. Primary Savings"}
                />
              </div>

              {(isCard || isAccountLike) && (
                <>
                  <div className="space-y-1.5">
                    <Label>{isCard ? "Cardholder Name" : "Account Holder"}</Label>
                    <Input
                      value={form.holder}
                      onChange={(e) => set("holder", e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{form.type === "investment" ? "Platform" : "Bank Name"}</Label>
                    <Select value={form.bank} onValueChange={(v) => set("bank", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {BANKS.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.bank === "Other" && (
                      <Input
                        className="mt-2"
                        value={form.bankCustom}
                        onChange={(e) => set("bankCustom", e.target.value)}
                        placeholder="Enter name"
                      />
                    )}
                  </div>
                </>
              )}

              {isCard && (
                <>
                  <div className="space-y-1.5">
                    <Label>Last 4 Digits</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={form.last4}
                      onChange={(e) =>
                        set("last4", e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="0000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expiry (MM/YY)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={form.expMonth} onValueChange={(v) => set("expMonth", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="MM" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) =>
                            String(i + 1).padStart(2, "0")
                          ).map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={form.expYear} onValueChange={(v) => set("expYear", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="YY" />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((y) => (
                            <SelectItem key={y} value={y}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {isAccountLike && (
                <>
                  <div className="space-y-1.5">
                    <Label>Account Number (Last 4)</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={form.last4}
                      onChange={(e) =>
                        set("last4", e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="0000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{form.type === "investment" ? "Platform Name" : "Branch"}</Label>
                    <Input
                      value={form.branch}
                      onChange={(e) => set("branch", e.target.value)}
                      placeholder={form.type === "investment" ? "Zerodha, Groww…" : "Branch / IFSC"}
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Opening Balance</Label>
                <MoneyInput
                  value={form.openingBalance}
                  onValueChange={(n) => set("openingBalance", n === undefined ? "" : String(n))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Opening Balance Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !form.openingDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.openingDate ? format(form.openingDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.openingDate}
                      onSelect={(d) => set("openingDate", d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label>Color Tag</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set("color", c.id)}
                    title={c.label}
                    className={cn(
                      "h-9 w-9 rounded-full border-2 transition-all flex items-center justify-center",
                      form.color === c.id
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    )}
                    style={colorStyle(c.id)}
                  >
                    {form.color === c.id && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon */}
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(({ id, icon: I }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => set("icon", id)}
                    className={cn(
                      "h-10 w-10 rounded-lg border flex items-center justify-center transition-all",
                      form.icon === id
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 hover:border-border text-muted-foreground"
                    )}
                  >
                    <I className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            <PurposeChips
              options={purposeOptions}
              selected={form.purposes}
              onToggle={togglePurpose}
              onAdd={addPurpose}
              onRename={renamePurpose}
              onDelete={deletePurpose}
            />


            <div className="flex justify-end gap-2 pt-2">
              {editingAccountId ? (
                <>
                  <Button variant="outline" onClick={cancelEditAccount}>
                    Cancel
                  </Button>
                  <Button onClick={save}>
                    <Check className="h-4 w-4" /> Save Changes
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setForm(emptyForm())}>
                    Reset
                  </Button>
                  <Button onClick={save}>
                    <Plus className="h-4 w-4" /> Add Account
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Preview + Grid */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Live Preview</CardTitle>
              <CardDescription>Updates as you type.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <AccountPreviewCard form={form} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg">Your Accounts</CardTitle>
                <CardDescription>
                  {accounts.length} active {accounts.length === 1 ? "account" : "accounts"}
                </CardDescription>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                onClick={toggleBalances}
                title={balancesHidden ? "Show balances" : "Hide balances"}
              >
                {balancesHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent>
              <AccountList
                accounts={accounts}
                liveBalances={liveBalances}
                balancesHidden={balancesHidden}
                editingAccountId={editingAccountId}
                onHistory={setHistoryAccount}
                onEdit={startEditAccount}
                onRemove={remove}
              />
            </CardContent>
          </Card>

          <TransferList
            transfers={transfers}
            accountName={accountName}
            balancesHidden={balancesHidden}
            onNew={() => openTransfer(null)}
            onEdit={openTransfer}
            onDelete={(id) => deleteTxn.mutate(id)}
          />
        </div>
      </div>

      <TransferDialog
        open={transferOpen}
        onOpenChange={(v) => {
          setTransferOpen(v);
          if (!v) setEditingTransfer(null);
        }}
        initial={editingTransfer}
      />

      <BalanceHistorySheet
        account={historyAccount}
        onClose={() => setHistoryAccount(null)}
      />
    </div>
  );
}