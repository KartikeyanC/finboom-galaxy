import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import {
  DEFAULT_FX,
  ICON_MAP,
  getIcon,
  type IncomeCurrency,
  type IncomeFrequency,
} from "@/lib/incomeSeed";

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(60),
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
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<IncomeCurrency>("INR");
  const [rate, setRate] = useState(String(DEFAULT_FX.INR));
  const [type, setType] = useState<"active" | "passive">("passive");
  const [frequency, setFrequency] = useState<IncomeFrequency>("monthly");
  const [icon, setIcon] = useState<string>("Coins");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(""); setAmount(""); setCurrency("INR"); setRate(String(DEFAULT_FX.INR));
    setType("passive"); setFrequency("monthly"); setIcon("Coins"); setNotes("");
  }, [open]);

  const handleCurrency = (v: string) => {
    const c = v as IncomeCurrency;
    setCurrency(c);
    setRate(String(DEFAULT_FX[c]));
  };

  const submit = () => {
    const parsed = schema.safeParse({
      name,
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
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Add Income Stream</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="inc-name">Name</Label>
            <Input
              id="inc-name"
              placeholder="e.g. Consulting"
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "active" | "passive")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="passive">Passive</SelectItem>
                </SelectContent>
              </Select>
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inc-rate">Exchange rate to INR</Label>
            <Input
              id="inc-rate"
              type="number"
              step="0.0001"
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
            <Label htmlFor="inc-notes">Notes (optional)</Label>
            <Textarea
              id="inc-notes"
              maxLength={500}
              rows={3}
              placeholder="Any details about this stream..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit}>Add stream</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}