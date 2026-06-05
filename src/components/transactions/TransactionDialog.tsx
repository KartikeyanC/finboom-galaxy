import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, Wallet, Receipt, CalendarDays, User, Users, HandCoins, Smartphone, AlertTriangle, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
  type IncomeSubtype,
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
import { findGroupForSub } from "@/lib/expenseSubcategories";
import { useNetWorth } from "@/lib/netWorthStore";
import { encodeSplit, type SplitMode } from "@/lib/splitMeta";
import { parseSplit } from "@/lib/splitMeta";
import { motion, AnimatePresence } from "framer-motion";

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

  const [activeType, setActiveType] = useState<TxnType>(type);
  const defaultCategory =
    activeType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [category, setCategory] = useState<string>(defaultCategory);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSub, setNewCatSub] = useState<IncomeSubtype>("active");

  // Debt / installment state
  const [debtMode, setDebtMode] = useState(false);
  const [debtTotal, setDebtTotal] = useState("");
  const [debtDuration, setDebtDuration] = useState<number>(3);
  const [debtCustomDuration, setDebtCustomDuration] = useState<string>("6");
  const [debtFirstDue, setDebtFirstDue] = useState(() => new Date().toISOString().slice(0, 10));
  const [debtLender, setDebtLender] = useState("");

  // Split state
  const [splitOn, setSplitOn] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>("paid_full");
  const [splitTotal, setSplitTotal] = useState("");
  const [splitFriend, setSplitFriend] = useState("");

  // Optional reminder
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderDate, setReminderDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [reminderTitle, setReminderTitle] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setActiveType(initial.type);
      setAmount(String(initial.amount));
      setCurrency(initial.currency);
      setCategory(initial.category);
      // Try to recover a subcategory previously stored as a "Sub · note" prefix.
      const { clean: descClean } = parseSplit(initial.description);
      const desc = descClean;
      const sepIdx = desc.indexOf(" · ");
      const candidate = sepIdx > -1 ? desc.slice(0, sepIdx) : desc;
      if (candidate && findGroupForSub(candidate)) {
        setSubcategory(candidate);
        setDescription(sepIdx > -1 ? desc.slice(sepIdx + 3) : "");
      } else {
        setSubcategory(null);
        setDescription(desc);
      }
      setOccurredAt(new Date(initial.occurred_at).toISOString());
    } else {
      setActiveType(type);
      setAmount("");
      setCurrency("INR");
      setCategory(type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
      setSubcategory(null);
      setDescription("");
      setOccurredAt(new Date().toISOString());
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
    setReminderOn(false);
    setReminderDate(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    setReminderTitle("");
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
      description:
        activeType === "expense" && subcategory
          ? description
            ? `${subcategory} · ${description}`
            : subcategory
          : description || undefined,
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
    const descCore = sub ? (description ? `${sub} · ${description}` : sub) : (description || "");
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
      onOpenChange(false);
    } catch {
      /* toast in hook */
    }
  };

  const submitDebt = () => {
    const total = Number(debtTotal);
    const duration = debtDuration > 0 ? debtDuration : Number(debtCustomDuration);
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
    const linked: typeof installments = installments.map((inst) => {
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

  const saveNewCategory = () => {
    const n = newCatName.trim();
    if (!n) return;
    if (activeType === "income") {
      custom.addIncome(newCatSub, n);
    } else {
      custom.addExpense(n);
    }
    setCategory(n);
    setNewCatName("");
    setNewCatOpen(false);
    toast.success(`Added "${n}"`);
  };

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
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
                  setSubcategory(sub);
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
            <Popover open={newCatOpen} onOpenChange={setNewCatOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-2 border-dashed border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Plus className="w-4 h-4" />
                  Create New {activeType === "income" ? "Income" : "Expense"} Category
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 sm:w-80 space-y-3 p-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Create new category</Label>
                    <Input
                      autoFocus
                      placeholder="e.g. Crypto, Coffee"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveNewCategory()}
                    />
                  </div>
                  {activeType === "income" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Classify as</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["active", "passive"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setNewCatSub(s)}
                            className={
                              "text-xs rounded-md py-1.5 border capitalize " +
                              (newCatSub === s
                                ? "bg-primary/15 text-primary border-primary/40"
                                : "border-border text-muted-foreground hover:text-foreground")
                            }
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => setNewCatOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={saveNewCategory}>Save</Button>
                  </div>
                  {/* Manage existing custom */}
                  {(activeType === "income"
                    ? [...custom.store.income.active.map((n) => ({ n, sub: "active" as const })),
                       ...custom.store.income.passive.map((n) => ({ n, sub: "passive" as const }))]
                    : custom.store.expense.map((n) => ({ n, sub: null as null }))
                  ).length > 0 && (
                    <div className="border-t border-border pt-2 space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Your custom
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {activeType === "income"
                          ? [
                              ...custom.store.income.active.map((n) => ({ n, sub: "active" as IncomeSubtype })),
                              ...custom.store.income.passive.map((n) => ({ n, sub: "passive" as IncomeSubtype })),
                            ].map(({ n, sub }) => (
                              <div key={`${sub}-${n}`} className="flex items-center justify-between text-xs">
                                <span>
                                  {n} <span className="text-muted-foreground">· {sub}</span>
                                </span>
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-coral"
                                  onClick={() => custom.removeIncome(sub, n)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))
                          : custom.store.expense.map((n) => (
                              <div key={n} className="flex items-center justify-between text-xs">
                                <span>{n}</span>
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-coral"
                                  onClick={() => custom.removeExpense(n)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                      </div>
                    </div>
                  )}
              </PopoverContent>
            </Popover>
          </div>
          <DateTimeField value={occurredAt} onChange={setOccurredAt} />
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
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Transaction Type</Label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border/40">
                <button
                  type="button"
                  onClick={() => setSplitOn(false)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
                    !splitOn
                      ? "bg-background text-foreground shadow-sm border border-border/60"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <User className="w-3.5 h-3.5" /> Single Expense
                </button>
                <button
                  type="button"
                  onClick={() => setSplitOn(true)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
                    splitOn
                      ? "bg-background text-foreground shadow-sm border border-primary/40"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Users className="w-3.5 h-3.5" /> Shared Group Split
                </button>
              </div>
              <AnimatePresence initial={false}>
                {splitOn && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-3">
                      <div className="grid grid-cols-1 gap-2">
                        {([
                          { id: "paid_full", icon: HandCoins, title: "I Paid for Everyone", sub: "Friend owes me their share" },
                          { id: "settled", icon: Smartphone, title: "Friend Paid, I Settled Now via UPI", sub: "Already squared up" },
                          { id: "owe", icon: AlertTriangle, title: "Friend Paid, I Owe Them", sub: "Unsettled debt to track" },
                        ] as const).map((opt) => {
                          const Icon = opt.icon;
                          const active = splitMode === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setSplitMode(opt.id)}
                              className={cn(
                                "flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 transition-colors",
                                active
                                  ? "border-primary/60 bg-primary/10"
                                  : "border-border/50 hover:bg-accent/40",
                              )}
                            >
                              <Icon className={cn("w-4 h-4 mt-0.5", active ? "text-primary" : "text-muted-foreground")} />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground">{opt.title}</div>
                                <div className="text-[11px] text-muted-foreground">{opt.sub}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        {splitMode === "paid_full" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Total Bill Amount</Label>
                            <Input
                              type="number" inputMode="decimal" placeholder="e.g. 1000"
                              value={splitTotal}
                              onChange={(e) => setSplitTotal(e.target.value)}
                            />
                          </div>
                        )}
                        <div className={cn("space-y-1.5", splitMode !== "paid_full" && "col-span-2")}>
                          <Label className="text-xs">
                            {splitMode === "paid_full" ? "My Share Amount" : "Your Share"}
                          </Label>
                          <Input
                            type="number" inputMode="decimal" placeholder="e.g. 200"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Friend / Group Name</Label>
                        <Input
                          placeholder="e.g. Rahul, Goa Trip Crew"
                          value={splitFriend}
                          onChange={(e) => setSplitFriend(e.target.value)}
                        />
                      </div>

                      {splitMode === "paid_full" && Number(splitTotal) > 0 && Number(amount) > 0 && (
                        <div className="text-[11px] text-muted-foreground rounded-md bg-background/60 border border-border/40 px-3 py-2">
                          <span className="text-foreground font-medium">
                            {currency} {Math.max(0, Number(splitTotal) - Number(amount)).toLocaleString("en-IN")}
                          </span>{" "}
                          will be tracked as <span className="text-foreground">owed by {splitFriend || "friend"}</span> in your Net Worth assets.
                        </div>
                      )}
                      {splitMode === "owe" && Number(amount) > 0 && (
                        <div className="text-[11px] text-amber-300/90 rounded-md bg-amber-500/5 border border-amber-500/30 px-3 py-2">
                          Will be added as a liability under Personal Loans in your Net Worth.
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {activeType === "expense" && !isEdit && debtMode && (
            <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-4">
              <div className="flex items-start gap-2">
                <Wallet className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <Label className="text-sm font-medium">Installment plan</Label>
                  <p className="text-[11px] text-muted-foreground">
                    We&apos;ll split this into monthly reminders so you can confirm each payment when it&apos;s due.
                  </p>
                </div>
              </div>

              {true && (
                <div className="space-y-3 pt-2 border-t border-border/40">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Total amount borrowed</Label>
                      <Input
                        type="number" inputMode="decimal" placeholder="e.g. 30000"
                        value={debtTotal} onChange={(e) => setDebtTotal(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">You&apos;ll pay every month</Label>
                      <div className="h-10 rounded-md border border-primary/40 bg-primary/10 px-3 flex items-center justify-between">
                        <span className="font-display text-base font-semibold text-foreground">
                          {(() => {
                            const dur = debtDuration > 0 ? debtDuration : Number(debtCustomDuration);
                            const m = computeMonthly(Number(debtTotal), dur);
                            return `${currency} ${m.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
                          })()}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Auto
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">For how many months?</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[2, 3, 4].map((m) => (
                        <button
                          key={m} type="button"
                          onClick={() => setDebtDuration(m)}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                            debtDuration === m
                              ? "border-primary/60 bg-primary/10 text-foreground"
                              : "border-border/50 hover:bg-accent/40 text-muted-foreground",
                          )}
                        >
                          {m} mo
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setDebtDuration(0)}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                          debtDuration === 0
                            ? "border-primary/60 bg-primary/10 text-foreground"
                            : "border-border/50 hover:bg-accent/40 text-muted-foreground",
                        )}
                      >
                        Custom
                      </button>
                    </div>
                    {debtDuration === 0 && (
                      <Select value={debtCustomDuration} onValueChange={setDebtCustomDuration}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Pick a duration" />
                        </SelectTrigger>
                        <SelectContent>
                          {[5, 6, 9, 12, 18, 24, 36].map((m) => (
                            <SelectItem key={m} value={String(m)}>{m} months</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Who is the lender?</Label>
                    <Input
                      placeholder="e.g. HDFC Bank, Rahul, Bajaj Finserv"
                      value={debtLender}
                      onChange={(e) => setDebtLender(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                      <Label className="text-xs">First installment date</Label>
                      <Input
                        type="date" value={debtFirstDue}
                        onChange={(e) => setDebtFirstDue(e.target.value)}
                      />
                  </div>

                  {(() => {
                    const dur = debtDuration > 0 ? debtDuration : Number(debtCustomDuration);
                    const total = Number(debtTotal);
                    if (!Number.isFinite(total) || total <= 0 || !dur || !debtFirstDue) return null;
                    const start = new Date(debtFirstDue);
                    const end = new Date(start);
                    end.setMonth(end.getMonth() + dur - 1);
                    const monthly = computeMonthly(total, dur);
                    const fmt = (d: Date) =>
                      d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
                    return (
                      <div className="flex items-start gap-2 rounded-lg bg-background/60 border border-border/40 px-3 py-2">
                        <CalendarDays className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                        <div className="text-[11px] text-muted-foreground leading-relaxed">
                          <span className="text-foreground font-medium">
                            {currency} {monthly.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </span>{" "}
                          × {dur} months · first payment{" "}
                          <span className="text-foreground">{fmt(start)}</span>, last payment{" "}
                          <span className="text-foreground">{fmt(end)}</span>.
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
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