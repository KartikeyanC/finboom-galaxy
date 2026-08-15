import { CalendarRange } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LEDGER_PERIODS,
  setLedgerPeriod,
  useLedgerPeriod,
  type LedgerPeriod,
} from "@/lib/ledgerPeriod";

/**
 * Stage 4.2 — how much history a ledger view loads.
 *
 * Deliberately visible rather than a hidden default: everything else on these
 * pages (search, chips, the matrix cross-filter, the category chart, the entry
 * count) operates on whatever was fetched, so the window has to be something
 * the user can see and change. It is shared state, so every ledger moves
 * together and the two pages can never disagree about what "in view" means.
 */
export default function PeriodSelect({ className }: { className?: string }) {
  const period = useLedgerPeriod();

  return (
    <Select value={period} onValueChange={(v) => setLedgerPeriod(v as LedgerPeriod)}>
      <SelectTrigger
        className={className ?? "h-8 w-[150px] text-xs"}
        aria-label="History loaded"
      >
        <CalendarRange className="w-3.5 h-3.5 mr-1.5 shrink-0 opacity-70" aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEDGER_PERIODS.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-xs">
            <span>{p.label}</span>
            {p.hint && (
              <span className="ml-2 text-xs text-muted-foreground">{p.hint}</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
