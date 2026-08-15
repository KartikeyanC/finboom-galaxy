import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
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
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wallet, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "@/lib/finance";
import {
  ACTIVE_INCOME,
  PASSIVE_INCOME,
  useCustomCategories,
} from "@/lib/categories";
import {
  useCreateTransaction,
  useUpdateTransaction,
  type Transaction,
  type TxnType,
} from "@/hooks/useTransactions";
import { toast } from "sonner";
import { buildInstallments, computeMonthly, useDebts, type DebtRecord } from "@/lib/debtsStore";
import { useReminders, type ReminderRecord } from "@/lib/remindersStore";
import DateTimeField from "@/components/transactions/DateTimeField";
import CategoryPickerDrawer from "@/components/transactions/CategoryPickerDrawer";
import CustomCategoryPopover from "@/components/transactions/CustomCategoryPopover";
import DebtFields from "@/components/transactions/DebtFields";
import PaymentModeField from "@/components/transactions/PaymentModeField";
import SplitFields from "@/components/transactions/SplitFields";
import {
  composeDescription,
  hydrateFromTransaction,
  resolvedDuration,
} from "@/components/transactions/transactionFormState";
import { useNetWorth } from "@/lib/netWorthStore";
import { useAccounts } from "@/lib/accountsStore";
import { useAccess } from "@/contexts/AccessContext";
import { encodeSplit, type SplitMode } from "@/lib/splitMeta";

const schema = z.object({
  amount: z.number().positive("Amount must be positive").max(1e12),
  currency: z.string().min(1),
  category: z.string().trim().min(1, "Category required").max(80),
  description: z.string().trim().max(500).optional(),
  occurred_at: z.string().min(1, "Date required"),
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: TxnType;
  initial?: Transaction | null;
}

export default function TransactionDialog({ open, onOpenChange, type, initial }: Props) {
  const isEdit = !!initial;
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const custom = useCustomCategories();
  const debts = useDebts();
  const reminders = useReminders();
  const networth = useNetWorth();
  const { accounts } = useAccounts();
  const { canAccess } = useAccess();

  const [activeType, setActiveType] = useState<TxnType>(type);
  const defaultCategory =
    activeType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [category, setCategory] = useState<string>(defaultCategory);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());

  // Debt / installment state
  const [debtMode, setDebtMode] = useState(false);
  const [debtTotal, setDebtTotal] = useState("");
  const [debtDuration, setDebtDuration] = useState<number>(3);
  const [debtCustomDuration, setDebtCustomDuration] = useState<string>("6");
  const [debtFirstDue, setDebtFirstDue] = useState(() => new Date().toISOString().slice(0, 10));
  const [debtLender, setDebtLender] = useState("");

  // Payment mode & account
  const [paymentMode, setPaymentMode] = useState<string>("UPI");
  const [linkedAccountId, setLinkedAccountId] = useState<string>("none");

  // Split state
  const [splitOn, setSplitOn] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>("paid_full");
  const [splitTotal, setSplitTotal] = useState("");
  const [splitFriend, setSplitFriend] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const f = hydrateFromTransaction(initial);
      setActiveType(f.activeType);
      setAmount(f.amount);
      setCurrency(f.currency);
      setCategory(f.category);
      setSubcategory(f.subcategory);
      setDescription(f.description);
      // Stage 3.4 / BUG-088: these come from the row's real columns, falling
      // back to the legacy description prefix only for pre-backfill rows.
      setPaymentMode(f.paymentMode);
      setLinkedAccountId(f.linkedAccountId);
      setOccurredAt(f.occurredAt);
    } else {
      setActiveType(type);
      setAmount("");
      setCurrency("INR");
      setCategory(type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
      setSubcategory(null);
      setDescription("");
      setOccurredAt(new Date().toISOString());
      // Only the create path resets these. They used to be reset here
      // unconditionally, which overwrote the values just recovered from the row
      // being edited — so saving an edit silently detached the transaction from
      // its account and moved that account's balance (BUG-088).
      setPaymentMode("UPI");
      setLinkedAccountId("none");
    }
    setDebtMode(false);
    setDebtTotal("");
    setDebtDuration(3);
    setDebtCustomDuration("6");
    setDebtFirstDue(new Date().toISOString().slice(0, 10));
    setDebtLender("");
    setSplitOn(false);
    setSplitMode("paid_full");
    setSplitTotal("");
    setSplitFriend("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, type]);

  // When user toggles type within the dialog, reset category to a sensible default.
  useEffect(() => {
    if (!open || initial) return;
    setCategory(activeType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
  }, [activeType, open, initial]);

  const submit = async () => {
    if (debtMode && activeType === "expense") {
      return submitDebt();
    }
    if (splitOn && activeType === "expense" && !isEdit) {
      return submitSplit();
    }
    // Guardrail: if date is blank/corrupt, fall back to live system time.
    let occurredSafe = occurredAt;
    const checkDate = new Date(occurredSafe);
    if (!occurredSafe || isNaN(checkDate.getTime())) {
      occurredSafe = new Date().toISOString();
      setOccurredAt(occurredSafe);
    }
    const parsed = schema.safeParse({
      amount: Number(amount),
      currency,
      category,
      // Stage 3.4: the description is just the description now. The account and
      // the payment mode are real columns below, instead of a `[UPI|<uuid>]`
      // prefix glued onto the user's own words.
      description: composeDescription(activeType, subcategory, description) || undefined,
      occurred_at: occurredSafe,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const payload = {
      type: activeType,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      category: parsed.data.category,
      description: parsed.data.description ?? null,
      account_id: linkedAccountId && linkedAccountId !== "none" ? linkedAccountId : null,
      payment_mode: paymentMode || null,
      occurred_at: new Date(parsed.data.occurred_at).toISOString(),
    };
    try {
      if (isEdit && initial) {
        await update.mutateAsync({ id: initial.id, ...payload });
      } else {
        await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      /* toast handled in hook */
    }
  };

  const submitSplit = async () => {
    const share = Number(amount);
    const friend = splitFriend.trim();
    if (!Number.isFinite(share) || share <= 0) {
      toast.error("Enter your share amount");
      return;
    }
    if (!friend) {
      toast.error("Add the friend / group name");
      return;
    }
    let cat = category;
    let sub: string | null = subcategory;
    if (splitMode === "settled") {
      cat = "Social & Celebrations";
      sub = "Friend Meetups";
    }
    const descCore = composeDescription("expense", sub, description);
    const finalDesc = encodeSplit({ mode: splitMode, friend }, descCore) || null;
    const occurredSafe = occurredAt || new Date().toISOString();
    try {
      await create.mutateAsync({
        type: "expense",
        amount: share,
        currency,
        category: cat,
        description: finalDesc,
        occurred_at: new Date(occurredSafe).toISOString(),
      });
      // The net-worth mirror of a split is a convenience, not the record: the
      // split itself is encoded in the transaction description (splitMeta) and
      // the ledger renders it either way. Since 2.15 net_worth_entries is gated
      // by the `net-worth` menu in RLS, and that menu is not on every plan, so
      // write the mirror only when this workspace actually has the feature --
      // otherwise the expense would post and then the dialog would throw.
      if (canAccess("net-worth")) {
        if (splitMode === "paid_full") {
          const total = Number(splitTotal);
          const owed = Math.max(0, total - share);
          if (owed > 0) {
            networth.add({
              kind: "asset",
              group: "other_asset",
              name: `Owed by ${friend}`,
              amount: owed,
            });
          }
        } else if (splitMode === "owe") {
          networth.add({
            kind: "liability",
            group: "personal_loan",
            name: `Owed to ${friend}`,
            amount: share,
          });
        }
      }
      onOpenChange(false);
    } catch {
      /* toast in hook */
    }
  };

  const submitDebt = () => {
    const total = Number(debtTotal);
    const duration = resolvedDuration(debtDuration, debtCustomDuration);
    if (!Number.isFinite(total) || total <= 0) {
      toast.error("Enter a valid total debt amount");
      return;
    }
    if (!Number.isFinite(duration) || duration < 1) {
      toast.error("Choose a repayment duration");
      return;
    }
    if (!debtLender.trim()) {
      toast.error("Add a lender / source name");
      return;
    }
    if (!debtFirstDue) {
      toast.error("Pick the first installment date");
      return;
    }
    const installments = buildInstallments(total, duration, debtFirstDue);
    const debtId = crypto.randomUUID();
    const lender = debtLender.trim();
    // Same reasoning as the split mirror above: `reminders` is menu-gated in
    // RLS since 2.15, so a member denied it records the debt without the EMI
    // reminders rather than failing halfway through the loop. `reminderId` is
    // optional on Installment and nothing reads it back.
    const withReminders = canAccess("reminders");
    const linked: typeof installments = installments.map((inst) => {
      if (!withReminders) return inst;
      const reminderId = crypto.randomUUID();
      const rec: ReminderRecord = {
        id: reminderId,
        title: `${lender} · EMI ${inst.month}/${duration}`,
        context: "fixed_due",
        date: inst.dueDate,
        amount: inst.amount,
        currency,
        frequency: "one_time",
        grace: "3d",
        source: "debt",
        sourceId: debtId,
        status: "scheduled",
        notes: `Upcoming Debt Paydown: Month ${inst.month} of ${duration} for ${lender} is due soon.`,
        debt: { debtId, month: inst.month, totalMonths: duration, lender },
        createdAt: new Date().toISOString(),
      };
      reminders.upsert(rec);
      return { ...inst, reminderId };
    });
    const rec: DebtRecord = {
      id: debtId,
      lender,
      category,
      currency,
      totalAmount: total,
      duration,
      monthly: computeMonthly(total, duration),
      firstDueDate: debtFirstDue,
      notes: description.trim() || undefined,
      installments: linked,
      createdAt: new Date().toISOString(),
    };
    debts.upsert(rec);
    toast.success(`Debt logged · ${duration} monthly reminders scheduled`);
    onOpenChange(false);
  };

  const busy = create.isPending || update.isPending;

  const activeIncome = [...ACTIVE_INCOME, ...custom.store.income.active];
  const passiveIncome = [...PASSIVE_INCOME, ...custom.store.income.passive];
  const expenseList = [...EXPENSE_CATEGORIES, ...custom.store.expense];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="font-display">
            {isEdit
              ? "Edit transaction"
              : activeType === "expense"
                ? debtMode ? "New debt / installment plan" : "Add expense"
                : "Add income"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 grid gap-4">
          {activeType === "expense" && !isEdit && !splitOn && (
            <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border/40">
              <button
                type="button"
                onClick={() => setDebtMode(false)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
                  !debtMode
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Receipt className="w-3.5 h-3.5" /> One-time expense
              </button>
              <button
                type="button"
                onClick={() => setDebtMode(true)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
                  debtMode
                    ? "bg-background text-foreground shadow-sm border border-primary/40"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Wallet className="w-3.5 h-3.5" /> Pay in installments
              </button>
            </div>
          )}

          <div className={cn("grid gap-3", debtMode ? "grid-cols-1" : "grid-cols-2")}>
            {!debtMode && (
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <MoneyInput
                id="amount"
                placeholder="0"
                value={amount}
                onValueChange={(n) => setAmount(n === undefined ? "" : String(n))}
              />
            </div>
            )}
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
          <div className="space-y-2">
            <Label>Category</Label>
            {activeType === "expense" ? (
              <CategoryPickerDrawer
                value={subcategory}
                category={category}
                onSelect={(parent, sub) => {
                  setCategory(parent);
                  setSubcategory(sub || null);
                }}
              />
            ) : (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeType === "income" ? (
                  <>
                    <SelectGroup>
                      <SelectLabel className="text-emerald-400">Active Income</SelectLabel>
                      {activeIncome.map((c) => (
                        <SelectItem key={`a-${c}`} value={c}>{c}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-teal-400">Passive Income</SelectLabel>
                      {passiveIncome.map((c) => (
                        <SelectItem key={`p-${c}`} value={c}>{c}</SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                ) : (
                  expenseList.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            )}
            <CustomCategoryPopover
              activeType={activeType}
              onCreated={(n) => {
                setCategory(n);
                // A brand-new expense head category has no subcategory yet, so
                // whatever was selected under the old one must not linger.
                if (activeType !== "income") setSubcategory(null);
              }}
            />
          </div>
          <DateTimeField value={occurredAt} onChange={setOccurredAt} />

          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={linkedAccountId} onValueChange={setLinkedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No account —</SelectItem>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}{acc.bank ? ` · ${acc.bank}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {activeType === "expense" && (
            <PaymentModeField value={paymentMode} onChange={setPaymentMode} />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="description">Note (optional)</Label>
            <Input
              id="description"
              maxLength={500}
              placeholder="e.g. October salary"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {activeType === "expense" && !isEdit && !debtMode && (
            <SplitFields
              splitOn={splitOn}
              onSplitOnChange={setSplitOn}
              splitMode={splitMode}
              onSplitModeChange={setSplitMode}
              splitTotal={splitTotal}
              onSplitTotalChange={setSplitTotal}
              splitFriend={splitFriend}
              onSplitFriendChange={setSplitFriend}
              amount={amount}
              onAmountChange={setAmount}
              currency={currency}
            />
          )}

          {activeType === "expense" && !isEdit && debtMode && (
            <DebtFields
              debtTotal={debtTotal}
              onDebtTotalChange={setDebtTotal}
              debtDuration={debtDuration}
              onDebtDurationChange={setDebtDuration}
              debtCustomDuration={debtCustomDuration}
              onDebtCustomDurationChange={setDebtCustomDuration}
              debtLender={debtLender}
              onDebtLenderChange={setDebtLender}
              debtFirstDue={debtFirstDue}
              onDebtFirstDueChange={setDebtFirstDue}
              currency={currency}
            />
          )}
        </div>
        <DialogFooter className="px-6 py-4 border-t border-border/40 bg-background/80 backdrop-blur">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : debtMode ? "Save plan" : splitOn ? "Save split" : "Add expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}