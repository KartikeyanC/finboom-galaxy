import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ICON_MAP, DEFAULT_FX, type IncomeCurrency } from "@/lib/incomeSeed";
import { IconChip } from "@/components/ui/icon-chip";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/finance";
import { useCreateRecurring, type RecurringFrequency, type RecurringType } from "@/hooks/useRecurring";
import { useRecurringReminders } from "@/hooks/useRecurringReminders";

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
const REMINDER_DAYS = [1, 2, 3, 5, 7, 10, 14];

interface Props {
  type: RecurringType;
  trigger?: React.ReactNode;
}

export default function RecurringDialog({ type, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const create = useCreateRecurring();
  const { save: saveReminder } = useRecurringReminders();

  const today = new Date().toISOString().slice(0, 10);
  const defaultCat = type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(defaultCat);
  const [subtype, setSubtype] = useState<"active" | "passive">("passive");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<IncomeCurrency>("INR");
  const [rate, setRate] = useState(String(DEFAULT_FX.INR));
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [nextDue, setNextDue] = useState(today);
  const [icon, setIcon] = useState(type === "income" ? "Coins" : "Receipt");
  const [hoverIcon, setHoverIcon] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // Reminder state
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDays, setReminderDays] = useState(3);
  const [reminderNote, setReminderNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(""); setCategory(defaultCat); setSubtype("passive");
    setAmount(""); setCurrency("INR"); setRate(String(DEFAULT_FX.INR));
    setFrequency("monthly"); setNextDue(today);
    setIcon(type === "income" ? "Coins" : "Receipt"); setNotes("");
    setReminderEnabled(false); setReminderDays(3); setReminderNote("");
  }, [open, type, defaultCat, today]);

  const handleCurrency = (v: string) => {
    const c = v as IncomeCurrency;
    setCurrency(c);
    setRate(String(DEFAULT_FX[c]));
  };

  const submit = () => {
    const parsed = schema.safeParse({
      name, category, amount: Number(amount), currency,
      fx_rate: Number(rate), frequency, next_due_date: nextDue,
      icon, subtype: type === "income" ? subtype : null,
      notes: notes || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const d = parsed.data;
    create.mutate(
      {
        type, name: d.name, category: d.category, amount: d.amount,
        currency: d.currency, fx_rate: d.fx_rate, frequency: d.frequency,
        next_due_date: d.next_due_date, icon: d.icon,
        subtype: d.subtype ?? null, notes: d.notes ?? null,
      },
      {
        onSuccess: (item) => {
          // Persist reminder setting if enabled
          if (reminderEnabled && item?.id) {
            saveReminder(item.id, {
              enabled: true,
              days_before: reminderDays,
              note: reminderNote.trim(),
            });
          }
          setOpen(false);
        },
      },
    );
  };

  const isIncome = type === "income";
  const title = isIncome ? "Add Recurring Income" : "Add Recurring Expense";
  const cats = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-2" variant={isIncome ? "default" : "destructive"}>
            <Plus className="w-4 h-4" />
            {isIncome ? "Add Recurring Income" : "Add Recurring Expense"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
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

          {/* Category + Subtype/Frequency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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

          {/* Amount + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <MoneyInput
                placeholder="0"
                value={amount} onValueChange={(n) => setAmount(n === undefined ? "" : String(n))}
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

          {/* Frequency (income only) */}
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

          {/* Due date + FX rate */}
          <div className="grid grid-cols-2 gap-3">
            <DatePickerField
              label="Next due date"
              value={nextDue}
              onChange={setNextDue}
              presets="future"
            />
            <div className="space-y-1.5">
              <Label>Exchange rate to INR</Label>
              <Input
                type="number" step="0.0001" value={rate}
                disabled={currency === "INR"}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          </div>

          {/* Icon picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Icon</Label>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {hoverIcon ?? icon}
              </span>
            </div>
            <div className="grid grid-cols-8 gap-2 p-2 rounded-md border border-border bg-muted/30 max-h-40 overflow-y-auto">
              {ICON_KEYS.map((key) => {
                const selected = key === icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    onMouseEnter={() => setHoverIcon(key)}
                    onMouseLeave={() => setHoverIcon(null)}
                    onFocus={() => setHoverIcon(key)}
                    onBlur={() => setHoverIcon(null)}
                    aria-label={key}
                    title={key}
                    className={cn(
                      "rounded-[10px] transition-all duration-150",
                      selected
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105"
                        : "grayscale opacity-50 hover:grayscale-0 hover:opacity-100 hover:scale-105",
                    )}
                  >
                    <IconChip name={key} size="sm" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              maxLength={500} rows={2}
              placeholder="Any details..."
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* ── Reminder section ── */}
          <div className={cn(
            "rounded-lg border p-3.5 space-y-3 transition-colors",
            reminderEnabled
              ? "border-primary/40 bg-primary/5"
              : "border-border/60 bg-background/40",
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bell className={cn("h-4 w-4", reminderEnabled ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-medium leading-none">Reminder</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Get notified before this item is due
                  </p>
                </div>
              </div>
              <Switch
                checked={reminderEnabled}
                onCheckedChange={setReminderEnabled}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {reminderEnabled && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">Remind me</Label>
                  <Select
                    value={String(reminderDays)}
                    onValueChange={(v) => setReminderDays(Number(v))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMINDER_DAYS.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} {d === 1 ? "day" : "days"} before
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Reminder note <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="e.g. Check balance first"
                    maxLength={80}
                    value={reminderNote}
                    onChange={(e) => setReminderNote(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
