import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus } from "lucide-react";
import {
  DEFAULT_FX, ICON_MAP, getIcon,
  type IncomeCurrency, type IncomeFrequency,
} from "@/lib/incomeSeed";
import { ACTIVE_INCOME, PASSIVE_INCOME, useCustomCategories } from "@/lib/categories";
import { useCreateRecurring } from "@/hooks/useRecurring";
import DateTimeField from "@/components/transactions/DateTimeField";

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(60),
  category: z.string().min(1, "Category required"),
  amount: z.number().positive("Amount must be positive").max(1e12),
  currency: z.enum(["INR", "USD", "EUR"]),
  exchangeRateToINR: z.number().positive("Rate must be positive").max(1e6),
  type: z.enum(["active", "passive"]),
  frequency: z.enum(["monthly", "weekly", "one-time"]),
  icon: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

interface Props {
  onAdd: (input: {
    name: string;
    amount: number;
    currency: IncomeCurrency;
    exchangeRateToINR: number;
    icon: string;
    type: "active" | "passive";
    frequency: IncomeFrequency;
    notes?: string;
  }) => void;
}

const ICON_KEYS = Object.keys(ICON_MAP);

export default function AddIncomeDialog({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"active" | "passive">("active");
  const [category, setCategory] = useState<string>(ACTIVE_INCOME[0]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<IncomeCurrency>("INR");
  const [rate, setRate] = useState(String(DEFAULT_FX.INR));
  const [frequency, setFrequency] = useState<IncomeFrequency>("monthly");
  const [icon, setIcon] = useState<string>("Coins");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());
  const createRecurring = useCreateRecurring();
  const custom = useCustomCategories();
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  useEffect(() => {
    if (!open) return;
    setType("active"); setCategory(ACTIVE_INCOME[0]); setName("");
    setAmount(""); setCurrency("INR"); setRate(String(DEFAULT_FX.INR));
    setFrequency("monthly"); setIcon("Coins"); setNotes("");
    setOccurredAt(new Date().toISOString());
  }, [open]);

  const handleCurrency = (v: string) => {
    const c = v as IncomeCurrency;
    setCurrency(c);
    setRate(String(DEFAULT_FX[c]));
  };

  const handleType = (v: "active" | "passive") => {
    setType(v);
    setCategory(v === "active" ? ACTIVE_INCOME[0] : PASSIVE_INCOME[0]);
  };

  const categories =
    type === "active"
      ? [...ACTIVE_INCOME, ...custom.store.income.active]
      : [...PASSIVE_INCOME, ...custom.store.income.passive];

  const saveNewCategory = () => {
    const n = newCatName.trim();
    if (!n) return;
    custom.addIncome(type, n);
    setCategory(n);
    setNewCatName("");
    setNewCatOpen(false);
    toast.success(`Added "${n}"`);
  };

  const submit = () => {
    const finalName = name.trim() || category;
    const parsed = schema.safeParse({
      name: finalName,
      category,
      amount: Number(amount),
      currency,
      exchangeRateToINR: Number(rate),
      type,
      frequency,
      icon,
      notes: notes || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const d = parsed.data;
    const safeISO = (() => {
      const dt = new Date(occurredAt);
      return isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
    })();
    onAdd({
      name: d.name,
      amount: d.amount,
      currency: d.currency,
      exchangeRateToINR: d.exchangeRateToINR,
      icon: d.icon,
      type: d.type,
      frequency: d.frequency,
      notes: d.notes,
    });
    createRecurring.mutate({
      type: "income",
      name: d.name,
      category: d.category,
      subtype: d.type,
      amount: d.amount,
      currency: d.currency,
      fx_rate: d.exchangeRateToINR,
      frequency: d.frequency,
      next_due_date: safeISO.slice(0, 10),
      icon: d.icon,
      notes: d.notes ?? null,
    });
    toast.success(`${d.name} added`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Add Income
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Add New Income Stream</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Income Type</Label>
              <Select value={type} onValueChange={(v) => handleType(v as "active" | "passive")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active Income (Salary)</SelectItem>
                  <SelectItem value="passive">Passive Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Popover open={newCatOpen} onOpenChange={setNewCatOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2 border-dashed border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              >
                <Plus className="w-4 h-4" />
                Create New {type === "active" ? "Active" : "Passive"} Income Category
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 sm:w-80 space-y-3 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs">New category name</Label>
                <Input
                  autoFocus
                  placeholder="e.g. Royalties, Crypto"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveNewCategory()}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setNewCatOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveNewCategory}>Save</Button>
              </div>
            </PopoverContent>
          </Popover>

          <div className="space-y-1.5">
            <Label htmlFor="inc-name">Name (optional)</Label>
            <Input
              id="inc-name"
              placeholder={`e.g. ${category} — source`}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inc-amount">Amount</Label>
              <Input
                id="inc-amount"
                type="number" step="0.01" min="0"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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

          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as IncomeFrequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="one-time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DateTimeField
            value={occurredAt}
            onChange={setOccurredAt}
            label="Received On"
          />

          <div className="space-y-1.5">
            <Label htmlFor="inc-rate">Exchange rate to INR</Label>
            <Input
              id="inc-rate"
              type="number" step="0.0001"
              value={rate}
              disabled={currency === "INR"}
              onChange={(e) => setRate(e.target.value)}
            />
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
            <Label htmlFor="inc-notes">Description</Label>
            <Textarea
              id="inc-notes"
              maxLength={500} rows={2}
              placeholder="Brief description"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} className="w-full" disabled={createRecurring.isPending}>
            {createRecurring.isPending ? "Adding..." : "Add Income Stream"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}