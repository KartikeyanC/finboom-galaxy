import { cn } from "@/lib/utils";
import { trackerBadgeClass } from "@/lib/trackers";

/**
 * The tracker chip: `[T-Home Construction]`.
 *
 * Deliberately the LEDGER chip idiom, copied from ExpenseLedger.tsx:497-504
 * and TransactionsTable.tsx:329-338 —
 *
 *   inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium
 *
 * and NOT the shadcn `<Badge>`, which is `rounded-full` + `font-semibold` and
 * is not what any transaction row uses. A tracker sitting next to a category
 * has to look like it belongs to the same family of things, or the row grows
 * a second visual language.
 *
 * It never replaces the category badge; it sits beside it.
 */
export default function TrackerBadge({
  name,
  isLight,
  className,
}: {
  name: string;
  isLight: boolean;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        // `shrink` (not `shrink-0`, which the category chip has) so that when
        // a row runs out of width the TRACKER truncates and the category
        // never does. Truncation is CSS rather than a character count, so it
        // adapts to the viewport instead of guessing at it.
        "inline-flex items-center rounded-md border px-2 py-0.5",
        "text-xs font-medium min-w-0 max-w-[11rem] shrink",
        trackerBadgeClass(isLight),
        className,
      )}
    >
      {/* "T-" is a display convention, not part of the name, so it is hidden
          from assistive tech — a screen reader announcing "tee dash home
          construction" would be reading punctuation as content. */}
      {/* No gap: this reads as one token, "T-Home", not "T- Home". */}
      <span aria-hidden="true" className="shrink-0 opacity-70">
        T-
      </span>
      <span aria-hidden="true" className="truncate">
        {name}
      </span>
      {/* The FULL, untruncated, unprefixed name, always. Visual truncation
          must never cost a screen-reader user the information. */}
      <span className="sr-only">Tracker: {name}</span>
    </span>
  );
}
