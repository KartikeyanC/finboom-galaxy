import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CardDue } from "@/lib/cardDue";

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const NONE = "none";

/**
 * "Payment due day" and "Remind me" for a credit card. No day means no
 * reminder; picking one makes a monthly reminder (cardDue.ts).
 */
export function CardDueFields({
  value,
  onChange,
}: {
  value: CardDue | null;
  onChange: (next: CardDue | null) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="card-due-day">Payment due day</Label>
        <Select
          value={value ? String(value.day) : NONE}
          onValueChange={(v) =>
            onChange(v === NONE ? null : { day: Number(v), lead: value?.lead ?? "3d" })
          }
        >
          <SelectTrigger id="card-due-day">
            <SelectValue placeholder="No reminder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No reminder</SelectItem>
            {DAYS.map((d) => (
              <SelectItem key={d} value={d}>
                {d} of every month
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          A day past the month's end (31 in a 30-day month) falls on its last day.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="card-due-lead">Remind me</Label>
        <Select
          disabled={!value}
          value={value?.lead ?? "3d"}
          onValueChange={(v) => value && onChange({ ...value, lead: v as CardDue["lead"] })}
        >
          <SelectTrigger id="card-due-lead">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3d">3 days before</SelectItem>
            <SelectItem value="1d">1 day before</SelectItem>
            <SelectItem value="exact">On the due day</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
