import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, useNavigation } from "react-day-picker";
import { format, setMonth, setYear } from "date-fns";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

// ── Custom caption: single row ‹ [Month ▾] [Year ▾] › ──────────────────────
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function CalendarCaption({ displayMonth }: { displayMonth: Date }) {
  const { goToMonth, nextMonth, previousMonth } = useNavigation();

  const changeMonth = (e: React.ChangeEvent<HTMLSelectElement>) => {
    goToMonth(setMonth(displayMonth, Number(e.target.value)));
  };
  const changeYear = (e: React.ChangeEvent<HTMLSelectElement>) => {
    goToMonth(setYear(displayMonth, Number(e.target.value)));
  };

  const currentYear = displayMonth.getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);

  return (
    <div className="flex items-center justify-between px-1 pb-2">
      {/* Prev */}
      <button
        type="button"
        onClick={() => previousMonth && goToMonth(previousMonth)}
        disabled={!previousMonth}
        className={cn(
          "h-7 w-7 flex items-center justify-center rounded-md border border-border/50",
          "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
          "disabled:opacity-30 disabled:cursor-not-allowed",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Month + Year dropdowns */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <select
            value={displayMonth.getMonth()}
            onChange={changeMonth}
            className={cn(
              "appearance-none h-8 pl-3 pr-6 rounded-md border border-border/50",
              "bg-muted/40 text-sm font-semibold text-foreground",
              "cursor-pointer hover:bg-muted transition-colors focus:outline-none focus:ring-1 focus:ring-primary/60",
            )}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <ChevronRight className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rotate-90 h-3 w-3 text-muted-foreground" />
        </div>

        <div className="relative">
          <select
            value={currentYear}
            onChange={changeYear}
            className={cn(
              "appearance-none h-8 pl-3 pr-6 rounded-md border border-border/50",
              "bg-muted/40 text-sm font-semibold text-foreground",
              "cursor-pointer hover:bg-muted transition-colors focus:outline-none focus:ring-1 focus:ring-primary/60",
            )}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <ChevronRight className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rotate-90 h-3 w-3 text-muted-foreground" />
        </div>
      </div>

      {/* Next */}
      <button
        type="button"
        onClick={() => nextMonth && goToMonth(nextMonth)}
        disabled={!nextMonth}
        className={cn(
          "h-7 w-7 flex items-center justify-center rounded-md border border-border/50",
          "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
          "disabled:opacity-30 disabled:cursor-not-allowed",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      components={{ Caption: CalendarCaption }}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-1",
        caption: "",
        caption_label: "hidden",
        nav: "hidden",
        nav_button: "hidden",
        nav_button_previous: "hidden",
        nav_button_next: "hidden",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell:
          "text-muted-foreground/60 w-9 text-center font-semibold text-[11px] uppercase tracking-wide pb-1",
        row: "flex w-full mt-1",
        cell: cn(
          "h-9 w-9 text-center text-sm p-0 relative",
          "[&:has([aria-selected].day-range-end)]:rounded-r-full",
          "[&:has([aria-selected].day-outside)]:bg-primary/10",
          "[&:has([aria-selected])]:bg-primary/15",
          "first:[&:has([aria-selected])]:rounded-l-full",
          "last:[&:has([aria-selected])]:rounded-r-full",
          "focus-within:relative focus-within:z-20",
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-medium rounded-full hover:bg-muted aria-selected:opacity-100 transition-colors",
        ),
        day_range_end: "rounded-full",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-full",
        day_today:
          "ring-2 ring-primary/60 text-primary font-bold rounded-full",
        day_outside:
          "day-outside text-muted-foreground/30 opacity-50 aria-selected:bg-primary/10 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-30 cursor-not-allowed",
        day_range_middle:
          "aria-selected:bg-primary/15 aria-selected:text-foreground rounded-none",
        day_hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
