import { CalendarDays, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { computeMonthly } from "@/lib/debtsStore";

import { resolvedDuration } from "./transactionFormState";

/**
 * The installment-plan fields — split out of TransactionDialog.tsx in
 * Stage 4.13.
 *
 * It previews the monthly figure and the first/last payment dates with the
 * same `computeMonthly` the saved plan is built from, so the number the user
 * agrees to here is the number that gets scheduled. Writing the debt record
 * and its reminders stays in the dialog: reminders are menu-gated, and a
 * member without them must still be able to record the debt.
 */
export default function DebtFields({
  debtTotal,
  onDebtTotalChange,
  debtDuration,
  onDebtDurationChange,
  debtCustomDuration,
  onDebtCustomDurationChange,
  debtLender,
  onDebtLenderChange,
  debtFirstDue,
  onDebtFirstDueChange,
  currency,
}: {
  debtTotal: string;
  onDebtTotalChange: (v: string) => void;
  debtDuration: number;
  onDebtDurationChange: (v: number) => void;
  debtCustomDuration: string;
  onDebtCustomDurationChange: (v: string) => void;
  debtLender: string;
  onDebtLenderChange: (v: string) => void;
  debtFirstDue: string;
  onDebtFirstDueChange: (v: string) => void;
  currency: string;
}) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Wallet className="w-4 h-4 text-primary mt-0.5" />
        <div>
          <Label className="text-sm font-medium">Installment plan</Label>
          <p className="text-xs text-muted-foreground">
            We&apos;ll split this into monthly reminders so you can confirm each payment when it&apos;s due.
          </p>
        </div>
      </div>

      {/* Debt installment fields (shown when the debt toggle is on) */}
        <div className="space-y-3 pt-2 border-t border-border/40">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Total amount borrowed</Label>
              <Input
                type="number" inputMode="decimal" placeholder="e.g. 30000"
                value={debtTotal} onChange={(e) => onDebtTotalChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">You&apos;ll pay every month</Label>
              <div className="h-10 rounded-md border border-primary/40 bg-primary/10 px-3 flex items-center justify-between">
                <span className="font-display text-base font-semibold text-foreground">
                  {(() => {
                    const dur = resolvedDuration(debtDuration, debtCustomDuration);
                    const m = computeMonthly(Number(debtTotal), dur);
                    return `${currency} ${m.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
                  })()}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
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
                  onClick={() => onDebtDurationChange(m)}
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
                onClick={() => onDebtDurationChange(0)}
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
              <Select value={debtCustomDuration} onValueChange={onDebtCustomDurationChange}>
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
              onChange={(e) => onDebtLenderChange(e.target.value)}
            />
          </div>

          <DatePickerField
            label="First installment date"
            value={debtFirstDue}
            onChange={onDebtFirstDueChange}
            presets="future"
          />

          {(() => {
            const dur = resolvedDuration(debtDuration, debtCustomDuration);
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
                <div className="text-xs text-muted-foreground leading-relaxed">
                  <span className="text-foreground font-medium">
                    {currency} {monthly.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>{" "}
                  × {dur} months · first payment{" "}
                  <span className="text-foreground">{fmt(start)}</span>, last payment{" "}
                  <span className="text-foreground">{fmt(end)}</span>.
                </div>
              </div>
            );
          })()}
        </div>
    </div>
  );
}
