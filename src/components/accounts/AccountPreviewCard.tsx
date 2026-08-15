import { Wallet } from "lucide-react";

import { ACCOUNT_TYPES, ICONS, colorStyle, type FormState } from "./accountMeta";

/**
 * The live card preview beside the account form — split out of
 * AccountsManager.tsx in Stage 4.13. Pure: it renders `form` and nothing else.
 */
export default function AccountPreviewCard({ form }: { form: FormState }) {
  const IconComp = ICONS.find((i) => i.id === form.icon)?.icon ?? Wallet;
  const bank = form.bank === "Other" ? form.bankCustom : form.bank;
  const showCard = form.type === "debit" || form.type === "credit";
  const balance = form.openingBalance ? Number(form.openingBalance) : 0;
  return (
    <div
      className="relative aspect-[1.6/1] w-full max-w-md rounded-2xl p-5 text-white shadow-xl overflow-hidden"
      style={colorStyle(form.color)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
            <IconComp className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest opacity-70">
              {ACCOUNT_TYPES.find((t) => t.id === form.type)?.label}
            </div>
            <div className="text-sm font-medium">{form.name || "Account Name"}</div>
          </div>
        </div>
        <div className="text-[11px] uppercase tracking-widest opacity-80">
          {bank || "BANK NAME"}
        </div>
      </div>

      <div className="relative mt-6">
        <div className="text-[11px] uppercase tracking-widest opacity-70">Balance</div>
        <div className="text-2xl font-semibold tracking-tight">
          ₹{balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </div>
      </div>

      <div className="relative mt-4 flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest opacity-70">
            {showCard ? "Card Number" : "Account"}
          </div>
          <div className="font-mono text-base tracking-[0.25em]">
            •••• {form.last4.padEnd(4, "0").slice(0, 4) || "0000"}
          </div>
        </div>
        {showCard && (
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-widest opacity-70">Expires</div>
            <div className="font-mono text-sm">
              {(form.expMonth || "MM").padStart(2, "0")}/{(form.expYear || "YY").slice(-2)}
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-3 text-xs opacity-80 truncate">
        {form.holder || "CARDHOLDER NAME"}
      </div>
    </div>
  );
}
