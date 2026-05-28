import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ICON_MAP, getIcon, DEFAULT_FX, type IncomeCurrency } from "@/lib/incomeSeed";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/finance";
import { useCreateRecurring, type RecurringFrequency, type RecurringType } from "@/hooks/useRecurring";

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(60),
  category: z.string().min(1, "Category required"),
  amount: z.number().positive("Amount must be positive").max(1e12),
  currency: z.enum(["INR", "USD", "EUR"]),
  fx_rate: z.number().positive().max(1e6),
  frequency: z.enum(["monthly", "weekly", "yearly", "one-time"]),
  next_due_date: z.string().min(1),
  icon: z.string().min(1),
  subtype: z.string().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
});

const ICON_KEYS = Object.keys(ICON_MAP);

interface Props {
  type: RecurringType;
  trigger?: React.ReactNode;
}

export default function RecurringDialog({ type, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const create = useCreateRecurring();

  const today = new Date().toISOString().slice(0, 10);
  const defaultCat =
    type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(defaultCat);
  const [subtype, setSubtype] = useState<"active" | "passive">("passive");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<IncomeCurrency>("INR");
  const [rate, setRate] = useState(String(DEFAULT_FX.INR));
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [nextDue, setNextDue] = useState(today);
  const [icon, setIcon] = useState(type === "income" ? "Coins" : "Receipt");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(""); setCategory(defaultCat); setSubtype("passive");
    setAmount(""); setCurrency("INR"); setRate(String(DEFAULT_FX.INR));
    setFrequency("monthly"); setNextDue(today);
    setIcon(type === "income" ? "Coins" : "Receipt"); setNotes("");
  }, [open, type, defaultCat, today]);

  const handleCurrency = (v: string) => {
    const c = v as IncomeCurrency;
    setCurrency(c);
    setRate(String(DEFAULT_FX[c]));
  };

  const submit = () => {
    const parsed = schema.safeParse({
      name,
      category,
      amount: Number(amount),
      currency,
      fx_rate: Number(rate),
      frequency,
      next_due_date: nextDue,
      icon,
      subtype: type === "income" ? subtype : null,
      notes: notes || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const d = parsed.data;
    create.mutate(
      {
        type,
        name: d.name,
        category: d.category,
        amount: d.amount,
        currency: d.currency,
        fx_rate: d.fx_rate,
        frequency: d.frequency,
        next_due_date: d.next_due_date,
        icon: d.icon,
        subtype: d.subtype ?? null,
        notes: d.notes ?? null,
      },
      { onSuccess: () => setOpen(false) }
    );
  };

  const isIncome = type === "income";
  const title = isIncome ? "Add Recurring Income" : "Add Recurring Expense";
  const cats = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            className="gap-2"
            variant={isIncome ? "default" : "destructive"}
          >
            <Plus className="w-4 h-4" />
            {isIncome ? "Add Recurring Income" : "Add Recurring Expense"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rec-name">Name</Label>
            <Input
              id="rec-name"
              placeholder={isIncome ? "e.g. Salary — Acme" : "e.g. Apartment rent"}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cats.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isIncome ? (
              <div className="space-y-1.5">
                <Label>Subtype</Label>
                <Select value={subtype} onValueChange={(v) => setSubtype(v as "active" | "passive")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="passive">Passive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurringFrequency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="one-time">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={handleCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR ₹</SelectItem>
                  <SelectItem value="USD">USD $</SelectItem>
                  <SelectItem value="EUR">EUR €</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isIncome && (
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurringFrequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="one-time">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Next due date</Label>
              <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Exchange rate to INR</Label>
              <Input
                type="number" step="0.0001" value={rate}
                disabled={currency === "INR"}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="grid grid-cols-8 gap-2 p-2 rounded-md border border-border bg-muted/30 max-h-40 overflow-y-auto">
              {ICON_KEYS.map((key) => {
                const IconC = getIcon(key);
                const selected = key === icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    aria-label={key}
                    className={`flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <IconC className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              maxLength={500} rows={2}
              placeholder="Any details..."
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}