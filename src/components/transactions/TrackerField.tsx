import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTrackers } from "@/hooks/useTrackers";
import { isWithinTrackerWindow, type Tracker } from "@/lib/trackers";

/**
 * The optional tracker picker on a transaction form.
 *
 * Extracted as its own file rather than inlined, following
 * PaymentModeField.tsx — TransactionDialog.tsx is already 20.5 kB against a
 * 30 kB ceiling, and the pieces that grow are the ones worth keeping apart.
 *
 * 🔴 THE MOST IMPORTANT LINE IN THIS FILE is the early `return null`.
 *
 * A user who has never created a tracker sees NOTHING here — not a disabled
 * select, not an empty dropdown, not a "no trackers yet" hint. Their expense
 * entry stays byte-for-byte the flow they have today, and Quick Add keeps its
 * 5-10 second target. The feature costs nothing until someone opts into it,
 * which is the same guard the Account block uses at TransactionDialog.tsx:466
 * (`accounts.length > 0 && …`).
 */
export default function TrackerField({
  value,
  onChange,
  occurredAt,
  compact,
  id = "tracker",
}: {
  /** Tracker uuid, or the "none" sentinel. */
  value: string;
  onChange: (v: string) => void;
  /** Drives the "running on this date" grouping. */
  occurredAt?: string;
  /** Tighter control for the Quick Add sheet. */
  compact?: boolean;
  /**
   * Overridable because this field renders in BOTH the transaction dialog and
   * the Quick Add sheet. A hardcoded id would collide the moment two of them
   * are in the tree at once, which axe's duplicate-id-aria rule fails and
   * which quietly breaks label association for whichever one loses.
   */
  id?: string;
}) {
  const { data } = useTrackers();

  const { running, other } = useMemo(() => {
    // Archived and completed trackers are not offered: you do not file a new
    // expense against a project you have already closed. They stay selectable
    // on an EDIT only because the stored value is passed through untouched.
    const active = (data ?? []).filter((t: Tracker) => t.status === "active");
    if (!occurredAt) return { running: active, other: [] as Tracker[] };
    const inWindow: Tracker[] = [];
    const rest: Tracker[] = [];
    for (const t of active) {
      (isWithinTrackerWindow(occurredAt, t) ? inWindow : rest).push(t);
    }
    return { running: inWindow, other: rest };
  }, [data, occurredAt]);

  if (running.length === 0 && other.length === 0) return null;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <Label htmlFor={id} className={compact ? "text-xs text-muted-foreground" : undefined}>
        Tracker {compact ? "" : "(optional)"}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={compact ? "h-9 text-sm" : undefined}>
          <SelectValue placeholder="No tracker" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          <SelectItem value="none">— No tracker —</SelectItem>
          {running.length > 0 && other.length > 0 ? (
            <>
              {/* Ranking, not filtering: a tracker whose window does not cover
                  this date is still selectable, just further down. Dates are
                  metadata, never a rule about what may be tagged. */}
              <SelectGroup>
                <SelectLabel>Running on this date</SelectLabel>
                {running.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Other trackers</SelectLabel>
                {other.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : (
            [...running, ...other].map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Groups this under a project. Does not move money between accounts.
        </p>
      )}
    </div>
  );
}
