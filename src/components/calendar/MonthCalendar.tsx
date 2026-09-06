import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/finance";
import {
  monthLabel,
  weekdayLabels,
  type DayCell,
  type MonthView,
} from "@/lib/calendarMonth";
import { EVENT_KINDS, EVENT_META, type CalendarEvent } from "@/lib/calendarEvents";

interface Props {
  view: MonthView;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onStep: (delta: number) => void;
  onToday: () => void;
  /** Non-transaction records (investments, budgets, goals, insurance) per day. */
  eventsByDay: Map<string, CalendarEvent[]>;
}

/**
 * The month grid. Each cell carries a two-bar sketch of that day's inflow and
 * outflow (scaled against the busiest day in view) plus the day's net, and — as
 * small coloured dots — any investment, budget, goal or insurance record dated
 * to that day. Clicking a cell selects it; the panel below the grid lists
 * everything on it.
 */
export default function MonthCalendar({
  view,
  selectedKey,
  onSelect,
  onStep,
  onToday,
  eventsByDay,
}: Props) {
  const headers = weekdayLabels(1);

  // Bars are scaled to the largest single-day inflow OR outflow on screen, so
  // the visual is comparable across the month rather than each cell self-scaling.
  const scale = useMemo(() => {
    let max = 0;
    for (const c of view.weeks.flat()) max = Math.max(max, c.income, c.expense);
    return max || 1;
  }, [view]);

  return (
    <section aria-label={`Transactions calendar, ${monthLabel(view.year, view.month)}`} className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-lg font-bold text-foreground">
          {monthLabel(view.year, view.month)}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8" onClick={onToday}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Previous month"
            onClick={() => onStep(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Next month"
            onClick={() => onStep(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden>
        {headers.map((h) => (
          <div key={h} className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
            {h}
          </div>
        ))}
      </div>

      {/* grid → row → gridcell, so the ARIA tree is valid (axe
          aria-required-parent / aria-required-children). */}
      <div role="grid" className="space-y-1">
        {view.weeks.map((week, i) => (
          <div role="row" key={week[0]?.key ?? i} className="grid grid-cols-7 gap-1">
            {week.map((cell) => (
              <DayButton
                key={cell.key}
                cell={cell}
                scale={scale}
                selected={cell.key === selectedKey}
                onSelect={onSelect}
                events={eventsByDay.get(cell.key) ?? []}
              />
            ))}
          </div>
        ))}
      </div>

      <Legend />
    </section>
  );
}

function DayButton({
  cell,
  scale,
  selected,
  onSelect,
  events,
}: {
  cell: DayCell;
  scale: number;
  selected: boolean;
  onSelect: (key: string) => void;
  events: CalendarEvent[];
}) {
  const incPct = Math.round((cell.income / scale) * 100);
  const expPct = Math.round((cell.expense / scale) * 100);
  const hasActivity = cell.count > 0;

  // Distinct kinds present, in a fixed order, for the dot row.
  const kinds = EVENT_KINDS.filter((k) => events.some((e) => e.kind === k));

  const parts: string[] = [];
  if (hasActivity) {
    parts.push(
      `${formatCompact(cell.income)} in, ${formatCompact(cell.expense)} out, ${cell.count} ${cell.count === 1 ? "entry" : "entries"}`,
    );
  }
  if (events.length) {
    parts.push(
      events.length === 1
        ? `1 ${EVENT_META[events[0].kind].label.toLowerCase()} item`
        : `${events.length} other items`,
    );
  }
  const label = cell.inMonth
    ? `${cell.date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}: ` +
      (parts.length ? parts.join("; ") : "nothing recorded")
    : cell.date.toLocaleDateString(undefined, { day: "numeric", month: "long" });

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={label}
      aria-selected={selected}
      onClick={() => onSelect(cell.key)}
      className={cn(
        "relative flex flex-col rounded-lg border p-1.5 text-left transition-colors min-h-[76px] sm:min-h-[104px]",
        "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        cell.inMonth ? "bg-card/40 border-border/50" : "bg-transparent border-transparent opacity-40",
        selected && "border-primary/60 bg-primary/5 ring-1 ring-primary/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-xs font-medium",
            cell.isToday
              ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          {cell.date.getDate()}
        </span>
        {cell.transfers > 0 && (
          <span className="text-[10px] text-sky-400" title={`${cell.transfers} transfer${cell.transfers === 1 ? "" : "s"}`}>
            ⇄
          </span>
        )}
      </div>

      {cell.inMonth && kinds.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-0.5" aria-hidden>
          {kinds.map((k) => (
            <span key={k} className={cn("h-1.5 w-1.5 rounded-full", EVENT_META[k].dot)} />
          ))}
        </div>
      )}

      {cell.inMonth && hasActivity && (
        <>
          <div className="mt-auto flex items-end gap-1 h-8" aria-hidden>
            <span className="flex-1 rounded-sm bg-success/70" style={{ height: `${Math.max(incPct, cell.income > 0 ? 8 : 0)}%` }} />
            <span className="flex-1 rounded-sm bg-coral/70" style={{ height: `${Math.max(expPct, cell.expense > 0 ? 8 : 0)}%` }} />
          </div>
          <span
            className={cn(
              "mt-1 text-[10px] font-semibold tabular-nums",
              cell.net > 0 ? "text-success" : cell.net < 0 ? "text-coral" : "text-muted-foreground",
            )}
          >
            {cell.net > 0 ? "+" : ""}
            {formatCompact(cell.net)}
          </span>
        </>
      )}
    </button>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-success/70" /> Money in
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-coral/70" /> Money out
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-sky-400">⇄</span> Transfer
      </span>
      {EVENT_KINDS.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", EVENT_META[k].dot)} /> {EVENT_META[k].label}
        </span>
      ))}
    </div>
  );
}
