import { useRef } from "react";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";

/**
 * Stage 4.5 / PERF-009 — render only the table rows that are on screen.
 *
 * A 5 000-row ledger builds 5 000 DOM subtrees, and the import preview is
 * worse: every row there carries editable inputs. Both are cheap to scroll and
 * ruinous to mount.
 *
 * THIS IS THRESHOLD-GATED ON PURPOSE. Virtualisation is not free — it costs the
 * browser's own find-in-page, "select all and copy", and printing, none of
 * which can see rows that are not in the DOM. Those are real features that
 * users reach for on a table of numbers, so they are only given up once the
 * list is long enough that rendering it whole is the bigger problem. Under the
 * threshold, nothing about the table changes.
 *
 * Rows are measured rather than assumed: a note can wrap to two lines, and a
 * guessed height would drift the scrollbar over thousands of rows.
 *
 * The spacer element lives in `components/ui/virtual-spacer-row.tsx` — a hook
 * and a component in one file breaks fast refresh.
 */

/** Above this many rows, windowing wins. Below it, the browser's features do. */
export const VIRTUALIZE_THRESHOLD = 200;

export interface VirtualRows {
  /** True when windowing is active; false means render the list normally. */
  enabled: boolean;
  /** Attach to the scroll container (only meaningful when enabled). */
  scrollRef: React.RefObject<HTMLDivElement>;
  /** The slice to render, in order. Empty when not enabled. */
  virtualItems: VirtualItem[];
  /** Spacer heights that stand in for the rows above and below the window. */
  paddingTop: number;
  paddingBottom: number;
  /** Ref callback for each rendered row, so its real height is measured. */
  measureRef: (node: HTMLElement | null) => void;
}

export function useVirtualRows(
  count: number,
  options?: { estimateSize?: number; overscan?: number; threshold?: number },
): VirtualRows {
  const scrollRef = useRef<HTMLDivElement>(null);
  const threshold = options?.threshold ?? VIRTUALIZE_THRESHOLD;
  const enabled = count > threshold;

  const virtualizer = useVirtualizer({
    count: enabled ? count : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => options?.estimateSize ?? 53,
    // A little slack above and below keeps fast scrolling from flashing blank
    // rows before the next batch mounts.
    overscan: options?.overscan ?? 12,
  });

  const virtualItems = enabled ? virtualizer.getVirtualItems() : [];
  const total = virtualizer.getTotalSize();
  const first = virtualItems[0];
  const last = virtualItems[virtualItems.length - 1];

  return {
    enabled,
    scrollRef,
    virtualItems,
    paddingTop: first ? first.start : 0,
    paddingBottom: last ? Math.max(0, total - last.end) : 0,
    measureRef: virtualizer.measureElement,
  };
}
