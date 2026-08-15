import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_FX, type IncomeCurrency } from "@/lib/incomeSeed";

interface Props {
  onAdd: (input: {
    name: string;
    amount: number;
    currency: IncomeCurrency;
    exchangeRateToINR: number;
  }) => void;
}

const QuickAddCard = ({ onAdd }: Props) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<IncomeCurrency>("INR");
  const [rate, setRate] = useState(String(DEFAULT_FX.INR));

  const reset = () => {
    setName(""); setAmount(""); setCurrency("INR"); setRate(String(DEFAULT_FX.INR));
  };

  const handleCurrency = (v: string) => {
    const c = v as IncomeCurrency;
    setCurrency(c);
    setRate(String(DEFAULT_FX[c]));
  };

  const submit = () => {
    if (!name.trim() || !amount) return;
    onAdd({
      name,
      amount: Number(amount),
      currency,
      exchangeRateToINR: Number(rate) || DEFAULT_FX[currency],
    });
    reset();
    setOpen(false);
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!open ? (
        <motion.button
          key="closed"
          layout
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setOpen(true)}
          className="glass-card w-full p-4 sm:p-5 flex items-center justify-center gap-2 border-dashed text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">Add custom income stream</span>
        </motion.button>
      ) : (
        <motion.div
          key="open"
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="glass-card p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-foreground">New income stream</h3>
            <Button variant="ghost" size="icon" onClick={() => { reset(); setOpen(false); }} aria-label="Close">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="qa-name">Category name</Label>
              <Input id="qa-name" placeholder="e.g. Consulting" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-amount">Amount</Label>
              <MoneyInput id="qa-amount" placeholder="0" value={amount} onValueChange={(n) => setAmount(n === undefined ? "" : String(n))} />
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
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="qa-rate">Exchange rate to INR</Label>
              <Input
                id="qa-rate"
                type="number"
                value={rate}
                disabled={currency === "INR"}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
            <Button onClick={submit} disabled={!name.trim() || !amount}>Add stream</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default QuickAddCard;