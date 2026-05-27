import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  Plus,
  Trash2,
  X,
  Wallet,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TxnType = "income" | "expense";
type CurrencyCode = "INR" | "USD" | "AED";

interface Entry {
  id: string;
  date: string;
  type: TxnType;
  category: string;
  amount: number;
  currency: CurrencyCode;
  rate: number;
  inr: number;
}

const DEFAULT_INCOME = ["Salary", "Freelance", "Business", "Investment", "Rental"];
const DEFAULT_EXPENSE = ["Food & Dining", "Transport", "Shopping", "Utilities", "Rent"];

const CURRENCY_SYM: Record<CurrencyCode, string> = { INR: "₹", USD: "$", AED: "د.إ" };

export default function QuickEntry() {
  const [type, setType] = useState<TxnType>("income");
  const [incomeCats, setIncomeCats] = useState<string[]>(DEFAULT_INCOME);
  const [expenseCats, setExpenseCats] = useState<string[]>(DEFAULT_EXPENSE);
  const [category, setCategory] = useState<string>(DEFAULT_INCOME[0]);

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("INR");
  const [rate, setRate] = useState<string>("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [catPopOpen, setCatPopOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const [entries, setEntries] = useState<Entry[]>([]);

  const activeCats = type === "income" ? incomeCats : expenseCats;
  const setActiveCats = type === "income" ? setIncomeCats : setExpenseCats;

  const accent = type === "income" ? "success" : "coral";

  // Keep selected category valid when toggling type or list changes
  const ensureCategory = (list: string[]) => {
    if (!list.includes(category)) setCategory(list[0] ?? "");
  };

  const onSwitchType = (next: TxnType) => {
    setType(next);
    const list = next === "income" ? incomeCats : expenseCats;
    setCategory(list[0] ?? "");
  };

  const fxNeeded = currency !== "INR";
  const numericAmount = Number(amount) || 0;
  const numericRate = fxNeeded ? Number(rate) || 0 : 1;
  const converted = numericAmount * numericRate;

  const totals = useMemo(() => {
    let income = 0,
      expense = 0;
    for (const e of entries) {
      if (e.type === "income") income += e.inr;
      else expense += e.inr;
    }
    return { income, expense, net: income - expense };
  }, [entries]);

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (activeCats.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast.error("Category already exists");
      return;
    }
    setActiveCats([...activeCats, name]);
    setCategory(name);
    setNewCatName("");
    toast.success(`Added “${name}”`);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const next = activeCats.filter((c) => c !== pendingDelete);
    setActiveCats(next);
    if (category === pendingDelete) setCategory(next[0] ?? "");
    toast.success(`Removed “${pendingDelete}”`);
    setPendingDelete(null);
  };

  const save = () => {
    if (!category) return toast.error("Pick a category first");
    if (!numericAmount || numericAmount <= 0) return toast.error("Enter an amount");
    if (fxNeeded && (!numericRate || numericRate <= 0))
      return toast.error("Enter a custom exchange rate");

    const entry: Entry = {
      id: crypto.randomUUID(),
      date,
      type,
      category,
      amount: numericAmount,
      currency,
      rate: numericRate,
      inr: converted,
    };
    setEntries([entry, ...entries]);
    setAmount("");
    setRate("");
    toast.success("Transaction saved");
  };

  const inrFmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1100px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
          Quick Entry
        </span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">
          Unified Transaction Engine
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Log income or expenses in any currency with your own exchange rate. Manage your
          categories on the fly.
        </p>
      </header>

      {/* Totals strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-display">
            Total Income
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-success">
            {inrFmt(totals.income)}
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-display">
            Total Expense
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-coral">
            {inrFmt(totals.expense)}
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-display">
            Net Balance
          </div>
          <div
            className={cn(
              "mt-2 font-display text-2xl font-bold",
              totals.net >= 0 ? "text-success" : "text-coral"
            )}
          >
            {inrFmt(totals.net)}
          </div>
        </div>
      </div>

      {/* Form */}
      <div
        className={cn(
          "glass-card p-6 sm:p-8 transition-colors duration-300",
          type === "income"
            ? "ring-1 ring-success/20 bg-success/[0.02]"
            : "ring-1 ring-coral/20 bg-coral/[0.02]"
        )}
      >
        {/* Income / Expense toggle */}
        <div className="relative grid grid-cols-2 p-1 rounded-xl bg-secondary/60 border border-border/40 max-w-md">
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={cn(
              "absolute inset-y-1 w-1/2 rounded-lg shadow-sm",
              type === "income" ? "left-1 bg-success/15" : "left-[calc(50%-0.25rem)] bg-coral/15"
            )}
          />
          <button
            type="button"
            onClick={() => onSwitchType("income")}
            className={cn(
              "relative z-10 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors",
              type === "income" ? "text-success" : "text-muted-foreground"
            )}
          >
            <ArrowDownCircle className="w-4 h-4" /> Income
          </button>
          <button
            type="button"
            onClick={() => onSwitchType("expense")}
            className={cn(
              "relative z-10 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors",
              type === "expense" ? "text-coral" : "text-muted-foreground"
            )}
          >
            <ArrowUpCircle className="w-4 h-4" /> Expense
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Popover open={catPopOpen} onOpenChange={setCatPopOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm flex items-center justify-between hover:bg-accent/40 transition-colors"
                >
                  <span className={cn(!category && "text-muted-foreground")}>
                    {category || "Choose category"}
                  </span>
                  <Wallet className="w-4 h-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[320px] p-0 overflow-hidden">
                <div className="px-3 py-2 text-[11px] uppercase tracking-widest text-muted-foreground font-display border-b border-border/40">
                  {type === "income" ? "Income categories" : "Expense categories"}
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {activeCats.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No categories yet. Add one below.
                    </div>
                  ) : (
                    activeCats.map((c) => (
                      <div
                        key={c}
                        className={cn(
                          "group flex items-center justify-between px-3 py-2 text-sm hover:bg-accent/60 cursor-pointer transition-colors",
                          category === c && "bg-accent/40"
                        )}
                        onClick={() => {
                          setCategory(c);
                          setCatPopOpen(false);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          {category === c && (
                            <Check
                              className={cn(
                                "w-3.5 h-3.5",
                                type === "income" ? "text-success" : "text-coral"
                              )}
                            />
                          )}
                          <span className={cn(category !== c && "ml-5")}>{c}</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete(c);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-coral hover:bg-coral/10 transition-all"
                          aria-label={`Delete ${c}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-border/40 p-2 flex gap-2 bg-secondary/40">
                  <Input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCategory();
                      }
                    }}
                    placeholder="Add new category"
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={addCategory}
                    className="h-8 px-2"
                    disabled={!newCatName.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {CURRENCY_SYM[currency]}
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["INR", "USD", "AED"] as CurrencyCode[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "h-10 rounded-md border text-sm font-medium transition-all",
                    currency === c
                      ? type === "income"
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-coral/40 bg-coral/10 text-coral"
                      : "border-input bg-background text-foreground hover:bg-accent/40"
                  )}
                >
                  {CURRENCY_SYM[c]} {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Manual FX */}
        <AnimatePresence initial={false}>
          {fxNeeded && (
            <motion.div
              key="fx"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-5 p-4 rounded-lg border border-dashed border-border/60 bg-secondary/30">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-display">
                  Enter Custom Exchange Rate (1 {currency} = X INR)
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder={currency === "USD" ? "e.g. 83.45" : "e.g. 22.72"}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="mt-2"
                />
                <p className="text-[11px] text-muted-foreground mt-2">
                  Use your real bank/transfer rate so taxes and fees are reflected.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live preview */}
        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3 px-4 py-3 rounded-lg bg-background/60 border border-border/40">
          <span className="text-xs uppercase tracking-widest text-muted-foreground font-display">
            Final Converted Amount
          </span>
          <span
            className={cn(
              "font-display text-2xl font-bold",
              type === "income" ? "text-success" : "text-coral"
            )}
          >
            {inrFmt(converted)}
          </span>
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            onClick={save}
            size="lg"
            className={cn(
              "min-w-[180px]",
              type === "income"
                ? "bg-success hover:bg-success/90 text-success-foreground"
                : "bg-coral hover:bg-coral/90 text-white"
            )}
          >
            Save Transaction
          </Button>
        </div>
      </div>

      {/* Log */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Transaction Log
          </h2>
          <span className="text-xs text-muted-foreground font-display">
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          </span>
        </div>
        <div className="glass-card p-0 overflow-hidden">
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 sticky top-0 z-10">
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground font-display">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold text-right">Original</th>
                  <th className="px-4 py-3 font-semibold text-right">Rate</th>
                  <th className="px-4 py-3 font-semibold text-right">INR</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {entries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-muted-foreground py-10"
                      >
                        No transactions yet. Save your first one above.
                      </td>
                    </tr>
                  ) : (
                    entries.map((e) => (
                      <motion.tr
                        key={e.id}
                        layout
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        className="border-t border-border/30"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {new Date(e.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                              e.type === "income"
                                ? "bg-success/15 text-success"
                                : "bg-coral/15 text-coral"
                            )}
                          >
                            {e.type === "income" ? (
                              <ArrowDownCircle className="w-3 h-3" />
                            ) : (
                              <ArrowUpCircle className="w-3 h-3" />
                            )}
                            {e.type === "income" ? "Income" : "Expense"}
                          </span>
                        </td>
                        <td className="px-4 py-3">{e.category}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {CURRENCY_SYM[e.currency]}
                          {e.amount.toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          <span className="text-muted-foreground text-xs">
                            {e.currency}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {e.currency === "INR" ? "—" : `× ${e.rate}`}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-display font-semibold",
                            e.type === "income" ? "text-success" : "text-coral"
                          )}
                        >
                          {inrFmt(e.inr)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setEntries((prev) => prev.filter((x) => x.id !== e.id))
                            }
                            className="p-1.5 rounded text-muted-foreground hover:text-coral hover:bg-coral/10 transition-colors"
                            aria-label="Remove entry"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the category from your{" "}
              {type === "income" ? "income" : "expense"} list. Existing log entries are
              unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-coral hover:bg-coral/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}