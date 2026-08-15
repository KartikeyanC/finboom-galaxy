import {
  Banknote, Building2, CreditCard, Landmark, Smartphone, Wallet,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The six payment-mode chips — split out of TransactionDialog.tsx in
 * Stage 4.13. The selected id is stored in the `payment_mode` COLUMN
 * (Stage 3.4); it is no longer glued onto the description.
 */
export default function PaymentModeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (mode: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Payment Mode</Label>
      <div className="flex flex-wrap gap-2">
        {([
          { id: "UPI", icon: Smartphone, label: "UPI" },
          { id: "Cash", icon: Banknote, label: "Cash" },
          { id: "Card", icon: CreditCard, label: "Card" },
          { id: "Net Banking", icon: Building2, label: "Net Banking" },
          { id: "Wallet", icon: Wallet, label: "Wallet" },
          { id: "Cheque", icon: Landmark, label: "Cheque" },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
              value === id
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
