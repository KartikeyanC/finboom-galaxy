import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, Check, ChevronDown, ChevronRight, Layers, X, History, Sunrise } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type DatePreset = "all" | "today" | "yesterday" | "7d" | "month" | "custom";

const PRESET_LABEL: Record<DatePreset, string> = {
  all: "All time",
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  month: "This month",
  custom: "Custom range",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function presetRange(preset: DatePreset, custom?: DateRange): { from?: Date; to?: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "7d": {
      const s = new Date(now);
      s.setDate(now.getDate() - 6);
      return { from: startOfDay(s), to: endOfDay(now) };
    }
    case "month":
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case "custom":
      return {
        from: custom?.from ? startOfDay(custom.from) : undefined,
        to: custom?.to ? endOfDay(custom.to) : custom?.from ? endOfDay(custom.from) : undefined,
      };
    default:
      return {};
  }
}

function inRange(d: Date, r: { from?: Date; to?: Date }) {
  if (r.from && d < r.from) return false;
  if (r.to && d > r.to) return false;
  return true;
}

interface Item {
  date: Date;
  category: string;
  amount: number; // normalized
}

interface Props<T> {
  items: T[];
  getDate: (t: T) => Date;
  getCategory: (t: T) => string;
  getAmount: (t: T) => number; // already INR-normalized for ribbon sum
  allCategories?: string[]; // optional master list; defaults to union from items
  currencyTag?: string; // shown on ribbon (e.g. "INR")
  children: (filtered: T[]) => React.ReactNode;
  onReset?: () => void;
  /**
   * Which date preset the filter opens on.
   *
   * 🔴 BUG-027. "today" is right for a ledger, where the newest rows are the
   * point. It is wrong for anything whose date is *when the record was saved*
   * rather than when something happened — a portfolio filtered to "today" by
   * `savedAt` shows an empty list to somebody who owns twelve holdings, which
   * reads as data loss rather than as a filter.
   */
  defaultPreset?: DatePreset;
}

export default function MatrixFilter<T>({
  items,
  getDate,
  getCategory,
  getAmount,
  allCategories,
  currencyTag = "INR",
  children,
  defaultPreset = "today",
}: Props<T>) {
  const [preset, setPreset] = useState<DatePreset>(defaultPreset);
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [cats, setCats] = useState<string[]>([]);
  const [datePopOpen, setDatePopOpen] = useState(false);
  const [catPopOpen, setCatPopOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  // Midnight ticker — forces "today" range to roll over without reload.
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  useEffect(() => {
    const id = setInterval(() => {
      const k = new Date().toDateString();
      setDayKey((prev) => (prev === k ? prev : k));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Decorate items once for cheap reuse
  const meta: Item[] = useMemo(
    () => items.map((t) => ({ date: getDate(t), category: getCategory(t), amount: getAmount(t) })),
    [items, getDate, getCategory, getAmount],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activeRange = useMemo(() => presetRange(preset, custom), [preset, custom, dayKey]);

  // Categories available + per-category counts given current DATE selection.
  const { availableCats, catCounts } = useMemo(() => {
    const counts = new Map<string, number>();
    meta.forEach((m) => {
      if (preset === "all" || inRange(m.date, activeRange)) {
        counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
      }
    });
    // Merge predefined list with any real categories from data so nothing is hidden.
    const fromData = Array.from(counts.keys());
    const master = allCategories
      ? Array.from(new Set([...allCategories, ...fromData]))
      : fromData;
    const list = master.filter((c) => (counts.get(c) ?? 0) > 0).sort();
    return { availableCats: list, catCounts: counts };
  }, [meta, preset, activeRange, allCategories]);

  // Counts per date preset given current CATEGORY selection (drives chips on date dropdown)
  const presetCounts = useMemo(() => {
    const result: Record<DatePreset, number> = {
      all: 0, today: 0, yesterday: 0, "7d": 0, month: 0, custom: 0,
    };
    const matchCat = (c: string) => cats.length === 0 || cats.includes(c);
    (["all", "today", "yesterday", "7d", "month", "custom"] as DatePreset[]).forEach((p) => {
      const r = presetRange(p, custom);
      result[p] = meta.filter((m) => matchCat(m.category) && (p === "all" || inRange(m.date, r))).length;
    });
    return result;
  }, [meta, cats, custom]);

  // Filtered original items
  const filteredIdx = useMemo(() => {
    const matchCat = (c: string) => cats.length === 0 || cats.includes(c);
    const out: number[] = [];
    meta.forEach((m, i) => {
      if (!matchCat(m.category)) return;
      if (preset !== "all" && !inRange(m.date, activeRange)) return;
      out.push(i);
    });
    return out;
  }, [meta, cats, preset, activeRange]);

  const filtered = useMemo(() => filteredIdx.map((i) => items[i]), [filteredIdx, items]);

  const summary = useMemo(() => {
    const count = filteredIdx.length;
    const sum = filteredIdx.reduce((s, i) => s + (Number.isFinite(meta[i].amount) ? meta[i].amount : 0), 0);
    return { count, sum: Number.isFinite(sum) ? sum : 0 };
  }, [filteredIdx, meta]);

  const reset = () => {
    setPreset("all");
    setCustom(undefined);
    setCats([]);
  };

  const dateLabel = (() => {
    if (preset === "custom" && custom?.from) {
      return custom.to
        ? `${format(custom.from, "PP")} – ${format(custom.to, "PP")}`
        : format(custom.from, "PP");
    }
    return PRESET_LABEL[preset];
  })();

  const catLabel = cats.length === 0 ? "All categories" : cats.length === 1 ? cats[0] : `${cats.length} categories`;

  const isActive = preset !== "all" || cats.length > 0;
  // "Today" is the fresh-slate default. Anything else is a historical view.
  const isHistorical = preset !== "today" || cats.length > 0;

  const returnToToday = () => {
    setPreset("today");
    setCustom(undefined);
    setCats([]);
  };

  return (
    <div className="space-y-3">
      {/* Dual filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Node A: Timeline */}
        <Popover open={datePopOpen} onOpenChange={setDatePopOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[170px] justify-between">
              <span className="flex items-center gap-2">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{dateLabel}</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className={cn(
              "p-0 overflow-hidden",
              customOpen ? "w-[620px]" : "w-[290px]",
            )}
          >
            <div className="flex min-h-[360px]">
              {/* ── Left panel: Quick presets ── */}
              <div className="w-[290px] shrink-0 flex flex-col bg-muted/10">
                <p className="px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                  Quick Presets
                </p>

                <div className="flex-1 px-2 space-y-0.5 pb-2">
                  {(["all", "today", "yesterday", "7d", "month"] as DatePreset[]).map((p) => {
                    const c = presetCounts[p];
                    const selected = preset === p && !customOpen;
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          setPreset(p);
                          setCustom(undefined);
                          setCustomOpen(false);
                          setDatePopOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                          selected
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <span>{PRESET_LABEL[p]}</span>
                        <span
                          className={cn(
                            "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums min-w-[60px] text-center",
                            selected
                              ? "bg-muted text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {c} {c === 1 ? "entry" : "entries"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom range row */}
                <div className="border-t border-border/30 p-2">
                  <button
                    onClick={() => {
                      setCustomOpen((v) => !v);
                      if (!customOpen) setPreset("custom");
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      customOpen || preset === "custom"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <ChevronRight
                        className={cn(
                          "w-3.5 h-3.5 transition-transform",
                          customOpen && "rotate-90",
                        )}
                      />
                      Custom range
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums min-w-[60px] text-center",
                        customOpen || preset === "custom"
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {presetCounts.custom}{" "}
                      {presetCounts.custom === 1 ? "entry" : "entries"}
                    </span>
                  </button>
                </div>
              </div>

              {/* ── Right panel: Calendar (only when customOpen) ── */}
              {customOpen && (
                <div className="border-l border-border/30 flex flex-col bg-background">
                  <p className="px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    Pick a date range
                  </p>
                  <div className="flex-1 px-3 pb-3">
                    <Calendar
                      mode="range"
                      numberOfMonths={1}
                      selected={custom}
                      onSelect={(r) => {
                        setCustom(r);
                        setPreset("custom");
                      }}
                      initialFocus
                      className="p-0 pointer-events-auto"
                    />
                    {/* Range summary + actions */}
                    {custom?.from && (
                      <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {custom.from && format(custom.from, "dd MMM yyyy")}
                          {custom.to && custom.to !== custom.from && (
                            <> → {format(custom.to, "dd MMM yyyy")}</>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setCustom(undefined); setPreset("all"); setCustomOpen(false); }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Clear
                          </button>
                          <Button size="sm" className="h-7 text-xs px-3" onClick={() => setDatePopOpen(false)}>
                            Apply
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Node B: Category multi-select */}
        <Popover open={catPopOpen} onOpenChange={setCatPopOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[170px] justify-between">
              <span className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{catLabel}</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[240px] p-2">
            <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1 border-b border-border/40">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Categories with data
              </span>
              {cats.length > 0 && (
                <button
                  onClick={() => setCats([])}
                  className="text-xs text-primary hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="max-h-[240px] overflow-y-auto space-y-0.5">
              {availableCats.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground text-center">
                  No categories with data in this range.
                </p>
              ) : (
                availableCats.map((c) => {
                  const on = cats.includes(c);
                  const n = catCounts.get(c) ?? 0;
                  return (
                    <button
                      key={c}
                      onClick={() =>
                        setCats((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))
                      }
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors text-left",
                        on ? "bg-primary/15 text-primary font-medium" : "hover:bg-muted",
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                            on ? "bg-primary border-primary" : "border-muted-foreground/40",
                          )}
                        >
                          {on && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </span>
                        <span className="truncate">{c}</span>
                      </span>
                      <span
                        className={cn(
                          "ml-2 shrink-0 inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-xs font-semibold tabular-nums",
                          on
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground/70",
                        )}
                      >
                        {n}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>

        {isActive && (
          <Button variant="ghost" size="sm" onClick={reset} className="h-9 px-2 text-xs">
            <X className="w-3.5 h-3.5 mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* Historical view banner */}
      {isHistorical && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs">
          <span className="flex items-center gap-2 text-primary font-medium">
            <History className="w-3.5 h-3.5" />
            Viewing Past Records · {dateLabel}
            {cats.length > 0 && (
              <span className="text-primary/80 font-normal">
                · {cats.length === 1 ? cats[0] : `${cats.length} categories`}
              </span>
            )}
          </span>
          <Button
            size="sm"
            onClick={returnToToday}
            className="h-7 px-3 text-xs gap-1.5"
          >
            <Sunrise className="w-3.5 h-3.5" />
            Return to Today's Slate
          </Button>
        </div>
      )}

      {/* Cumulative ribbon */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/30 px-3.5 py-2 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-muted-foreground">
            Transactions found:{" "}
            <span className="text-foreground font-display font-semibold tabular-nums">
              {summary.count}
            </span>
          </span>
          <span className="text-muted-foreground">
            Combined value:{" "}
            <span className="text-foreground font-display font-semibold tabular-nums">
              ₹{summary.sum.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
            {/* Stage 4.7: 12px, not the 11px micro-label floor — a currency code
                next to a total is the unit of the number, i.e. content. It only
                looks like a decorative label because it is set in caps. */}
            {/* BUG-094 — `/80` put this at 3.83:1. The comment above already
                says it is content rather than a label; dimming content is the
                thing that comment argues against. */}
            <span className="ml-1 text-xs uppercase tracking-wider text-muted-foreground">
              {currencyTag}
            </span>
          </span>
        </div>
        {isActive && (
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Live · cross-filtered
          </span>
        )}
      </div>

      {/* Filtered children */}
      {filtered.length === 0 && isActive ? (
        <div className="text-center py-10 px-4 rounded-lg border border-dashed border-border/40">
          <p className="text-sm text-foreground/90">
            No transactions match this specific date/category combo.
          </p>
          {/* Stage 4.7: mt-2 + py-1 keeps the same visual gap while giving the
              button a 28 px hit box (it was 20 px, under the 24 px minimum). */}
          <button
            onClick={reset}
            className="mt-2 py-1 text-sm font-semibold text-primary hover:underline"
          >
            Reset Active Filters
          </button>
        </div>
      ) : (
        children(filtered)
      )}
    </div>
  );
}