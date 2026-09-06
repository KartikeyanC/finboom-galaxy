import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Hash, Scale } from "lucide-react";
import MetricCard from "@/components/dashboard/MetricCard";
import MonthCalendar from "@/components/calendar/MonthCalendar";
import DayDetail from "@/components/calendar/DayDetail";
import { useMonthTransactions } from "@/hooks/useMonthTransactions";
import { useMonthEvents } from "@/hooks/useMonthEvents";
import { useTheme } from "@/contexts/ThemeContext";
import { formatCompact } from "@/lib/finance";
import {
  buildMonthView,
  dayKey,
  groupByDay,
  monthGridRange,
  monthLabel,
  shiftMonth,
} from "@/lib/calendarMonth";
import { groupEventsByDay } from "@/lib/calendarEvents";

/** Parse a local `YYYY-MM-DD` key back to a Date at local midnight. */
function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const Calendar = () => {
  const now = useMemo(() => new Date(), []);
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [{ year, month }, setMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [selectedKey, setSelectedKey] = useState(dayKey(now));

  const { data: txns, isLoading } = useMonthTransactions(year, month);

  // The keys bounding the visible grid — used to window the non-transaction
  // records (investments, budgets, goals, insurance) to the same span.
  const { startKey, endKey } = useMemo(() => {
    const { start, end } = monthGridRange(year, month, 1);
    return { startKey: dayKey(start), endKey: dayKey(end) };
  }, [year, month]);
  const events = useMonthEvents(startKey, endKey);

  const view = useMemo(
    () => buildMonthView(year, month, txns ?? [], { now }),
    [year, month, txns, now],
  );
  const byDay = useMemo(() => groupByDay(txns ?? []), [txns]);
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  const step = (delta: number) => {
    const next = shiftMonth(year, month, delta);
    setMonth(next);
    // Keep a sensible selection inside the month just navigated to.
    setSelectedKey(
      next.year === now.getFullYear() && next.month === now.getMonth()
        ? dayKey(now)
        : dayKey(new Date(next.year, next.month, 1)),
    );
  };

  const goToday = () => {
    setMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedKey(dayKey(now));
  };

  const selectedDate = keyToDate(selectedKey);
  const selectedRows = byDay.get(selectedKey) ?? [];
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  const { income, expense, net, count } = view.totals;

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
          Calendar
        </span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">Monthly Activity</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Everything dated to {monthLabel(year, month)} on one grid — income and expenses, plus the
          investments, budgets, goals and insurance you logged. Pick a day to see the detail below.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Money In"
          value={isLoading ? "—" : formatCompact(income)}
          change={monthLabel(year, month)}
          changeType="positive"
          icon={<ArrowUpRight className="w-4 h-4" />}
          delay={0.05}
        />
        <MetricCard
          label="Money Out"
          value={isLoading ? "—" : formatCompact(expense)}
          change={monthLabel(year, month)}
          changeType="negative"
          icon={<ArrowDownRight className="w-4 h-4" />}
          delay={0.1}
        />
        <MetricCard
          label="Net"
          value={isLoading ? "—" : `${net > 0 ? "+" : ""}${formatCompact(net)}`}
          change={net >= 0 ? "Surplus" : "Shortfall"}
          changeType={net >= 0 ? "positive" : "negative"}
          icon={<Scale className="w-4 h-4" />}
          delay={0.15}
        />
        <MetricCard
          label="Entries"
          value={isLoading ? "—" : String(count)}
          change="This month"
          changeType="neutral"
          icon={<Hash className="w-4 h-4" />}
          delay={0.2}
        />
      </div>

      {view.busiestDay && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="w-4 h-4 text-primary" />
          Biggest spend day was{" "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            onClick={() => setSelectedKey(view.busiestDay!.key)}
          >
            {view.busiestDay.date.toLocaleDateString(undefined, { day: "numeric", month: "long" })}
          </button>{" "}
          at {formatCompact(view.busiestDay.expense)}.
        </p>
      )}

      <div className="space-y-6">
        <MonthCalendar
          view={view}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onStep={step}
          onToday={goToday}
          eventsByDay={eventsByDay}
        />
        <DayDetail
          dateKey={selectedKey}
          date={selectedDate}
          rows={selectedRows}
          events={selectedEvents}
          isLight={isLight}
        />
      </div>
    </div>
  );
};

export default Calendar;
