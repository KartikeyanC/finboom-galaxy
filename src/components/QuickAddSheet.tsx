import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HandCoins, Wallet, Check, Loader2 } from "lucide-react";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, CURRENCIES } from "@/lib/finance";
import { useCustomCategories } from "@/lib/categories";
import { useCreateTransaction } from "@/hooks/useTransactions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function QuickAddSheet({ open, onOpenChange }: Props) {
  const createTxn = useCreateTransaction();
  const { store: customCats } = useCustomCategories();

  const [type, setType]         = useState<"expense" | "income">("expense");
  const [amount, setAmount]     = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0] as string);
  const [note, setNote]         = useState("");
  const [date, setDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("INR");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);

  // All categories (predefined + custom)
  const expenseCategories = [
    ...EXPENSE_CATEGORIES,
    ...customCats.expense,
  ];
  const incomeCategories = [
    ...INCOME_CATEGORIES,
    ...customCats.income.active,
    ...customCats.income.passive,
  ];
  const cats = type === "expense" ? expenseCategories : incomeCategories;

  // Reset & focus when opened
  useEffect(() => {
    if (open) {
      setAmount("");
      setNote("");
      setDate(new Date().toISOString().slice(0, 10));
      setSaved(false);
      // slight delay so the sheet animation completes before focusing
      setTimeout(() => amountRef.current?.focus(), 200);
    }
  }, [open]);

  // Keep category in sync when type switches
  useEffect(() => {
    setCategory(type === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
  }, [type]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }

    setSaving(true);
    try {
      await createTxn.mutateAsync({
        type,
        amount: amt,
        currency,
        category,
        description: note.trim() || null,
        occurred_at: new Date(date).toISOString(),
      });
      setSaved(true);
      toast.success(`${type === "expense" ? "Expense" : "Income"} recorded`);
      setTimeout(() => {
        onOpenChange(false);
        setSaved(false);
      }, 700);
    } catch {
      toast.error("Failed to save — try again");
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !saving) handleSave();
  };

  const currencySymbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "د.إ";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 max-w-lg mx-auto sm:rounded-t-2xl focus:outline-none"
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border/60" />
        </div>

        <SheetHeader className="px-5 pt-2 pb-0">
          <SheetTitle className="text-base font-semibold">Quick Add</SheetTitle>
        </SheetHeader>

        <div className="px-5 pt-4 pb-6 space-y-4">

          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-xl">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150",
                  type === t
                    ? t === "expense"
                      ? "bg-rose-500 text-white shadow-sm shadow-rose-500/30"
                      : "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "expense"
                  ? <HandCoins className="w-4 h-4" />
                  : <Wallet className="w-4 h-4" />}
                {t === "expense" ? "Expense" : "Income"}
              </button>
            ))}
          </div>

          {/* Amount — large, prominent */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground select-none pointer-events-none">
              {currencySymbol}
            </span>
            <Input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={handleKey}
              className={cn(
                "pl-10 pr-24 h-16 text-3xl font-bold font-display tracking-tight rounded-xl border-2 transition-colors",
                "focus-visible:ring-0",
                type === "expense"
                  ? "focus-visible:border-rose-500/60"
                  : "focus-visible:border-emerald-500/60"
              )}
            />
            {/* currency selector inline */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-8 w-20 text-xs border-border/50 bg-muted/60 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category + Date row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {cats.map((c) => (
                    <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Note (optional)</Label>
            <Input
              placeholder="e.g. Paid via GPay for dinner"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={handleKey}
              className="h-9 text-sm"
            />
          </div>

          {/* Save button */}
          <Button
            className={cn(
              "w-full h-12 text-base font-semibold rounded-xl transition-all duration-200",
              saved
                ? "bg-emerald-500 hover:bg-emerald-500"
                : type === "expense"
                ? "bg-rose-500 hover:bg-rose-600 shadow-md shadow-rose-500/20"
                : "bg-emerald-500 hover:bg-emerald-600 shadow-md shadow-emerald-500/20"
            )}
            onClick={handleSave}
            disabled={saving || saved}
          >
            {saved ? (
              <span className="flex items-center gap-2">
                <Check className="w-5 h-5" /> Saved!
              </span>
            ) : saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Saving…
              </span>
            ) : (
              `Record ${type === "expense" ? "Expense" : "Income"}`
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
