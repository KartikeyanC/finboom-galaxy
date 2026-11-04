import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * When a share or fund was bought (`fields.buy_date`). Optional, but the tax
 * planner needs it: without one a holding counts from the day it was saved,
 * so units bought long ago never show as long-term.
 */
export function BuyDateField({
  value,
  onChange,
  sip = false,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  sip?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="buy-date" className="text-xs font-medium text-muted-foreground">
        {sip ? "First SIP date" : "Buy date"}
      </Label>
      <Input
        id="buy-date"
        type="date"
        max={new Date().toISOString().slice(0, 10)}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {sip
          ? "A SIP's units are bought month by month — import your CAS to plan tax on them."
          : "Used to tell long-term gains from short-term for tax harvesting."}
      </p>
    </div>
  );
}
