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
import { Plus, Trash2, Wallet, Receipt, CalendarDays } from "lucide-react";
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

  const [activeType, setActiveType] = useState<TxnType>(type);
  const defaultCategory =
    activeType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [category, setCategory] = useState<string>(defaultCategory);
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
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

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setActiveType(initial.type);
      setAmount(String(initial.amount));
      setCurrency(initial.currency);
      setCategory(initial.category);
      setDescription(initial.description ?? "");
      setOccurredAt(initial.occurred_at.slice(0, 10));
    } else {
      setActiveType(type);
      setAmount("");
      setCurrency("INR");
      setCategory(type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
      setDescription("");
      setOccurredAt(new Date().toISOString().slice(0, 10));
    }
    setDebtMode(false);
    setDebtTotal("");
    setDebtDuration(3);
    setDebtCustomDuration("6");
    setDebtFirstDue(new Date().toISOString().slice(0, 10));
    setDebtLender("");
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
    const parsed = schema.safeParse({
      amount: Number(amount),
      currency,
      category,
      description: description || undefined,
      occurred_at: occurredAt,
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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEdit ? "Edit Transaction" : "Add Transaction"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
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
          <div className="space-y-1.5">
            <Label htmlFor="occurred_at">Date</Label>
            <Input
              id="occurred_at"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
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
                            return `${currency} ${m.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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
                            {currency} {monthly.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : isEdit ? "Save changes" : debtMode ? "Save Debt" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}