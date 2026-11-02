import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BulkDeleteBar, SelectAllBox, SelectBox } from "@/components/bulk/BulkSelect";
import { useBulkSelection } from "@/components/bulk/useBulkSelection";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TransactionDialog from "./TransactionDialog";
import {
  useDeleteTransaction,
  useDeleteTransactions,
  useTransactions,
  type Transaction,
  type TxnType,
} from "@/hooks/useTransactions";
import { useTrackerNameMap } from "@/hooks/useTrackers";
import TrackerBadge from "@/components/trackers/TrackerBadge";
import { formatMoney } from "@/lib/finance";
import { categoryBadgeClass, getIncomeSubtype, useCustomCategories } from "@/lib/categories";
import { useTheme } from "@/contexts/ThemeContext";
import PeriodSelect from "@/components/ledger/PeriodSelect";
import { useLedgerPeriod } from "@/lib/ledgerPeriod";
import { useVirtualRows } from "@/hooks/useVirtualRows";
import { VirtualSpacerRow } from "@/components/ui/virtual-spacer-row";

export default function TransactionsTable({ type: initialType }: { type: TxnType }) {
  const [type, setType] = useState<TxnType>(initialType);
  // Stage 4.2: bounded at the server. The category dropdown and the date
  // filters below are built from `data`, so they describe the loaded window —
  // which is why the window is a visible control rather than a hidden default.
  const period = useLedgerPeriod();
  const { data, isLoading } = useTransactions(type, period);
  const del = useDeleteTransaction();
  const delMany = useDeleteTransactions();
  const custom = useCustomCategories();
  const { isDark } = useTheme();
  const isLight = !isDark;
  const trackerNames = useTrackerNameMap();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  // Deletes are deferred: the row hides at once, a toast offers Undo, and the
  // real delete runs when the window closes (or the table unmounts).
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const delMutate = del.mutate;

  const commitDelete = useCallback(
    (id: string) => {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.delete(id);
      delMutate(id, {
        onSettled: () =>
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          }),
      });
    },
    [delMutate],
  );

  const scheduleDelete = (id: string) => {
    setPendingIds((prev) => new Set(prev).add(id));
    timers.current.set(id, setTimeout(() => commitDelete(id), 6000));
    toast("Transaction deleted", {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          const timer = timers.current.get(id);
          if (timer) clearTimeout(timer);
          timers.current.delete(id);
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
    });
  };

  // Leaving the page must not silently cancel a delete the user already made.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      Array.from(pending.keys()).forEach((id) => commitDelete(id));
    };
  }, [commitDelete]);

  // Filters
  const [subtype, setSubtype] = useState<"all" | "active" | "passive">("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [singleDate, setSingleDate] = useState<Date | undefined>();
  const [range, setRange] = useState<DateRange | undefined>();
  const [dateOpen, setDateOpen] = useState(false);

  const title = type === "income" ? "Income" : "Expenses";

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((t) => set.add(t.category));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((t) => {
      if (pendingIds.has(t.id)) return false;
      if (catFilter !== "all" && t.category !== catFilter) return false;
      if (type === "income" && subtype !== "all") {
        if (getIncomeSubtype(t.category, custom.store) !== subtype) return false;
      }
      const d = new Date(t.occurred_at);
      if (dateMode === "single" && singleDate) {
        if (d.toDateString() !== singleDate.toDateString()) return false;
      } else if (dateMode === "range" && (range?.from || range?.to)) {
        if (range.from && d < new Date(range.from.setHours(0, 0, 0, 0))) return false;
        if (range.to && d > new Date(new Date(range.to).setHours(23, 59, 59, 999))) return false;
      }
      return true;
    });
  }, [data, pendingIds, catFilter, subtype, type, dateMode, singleDate, range, custom.store]);

  // Bulk delete works on what the filters show: "Select all" after filtering
  // to one category ticks that category, never rows hidden by the filter.
  const filteredIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
  const sel = useBulkSelection(filteredIds);

  const dateLabel = (() => {
    if (dateMode === "single" && singleDate) return format(singleDate, "PP");
    if (dateMode === "range" && range?.from)
      return range.to
        ? `${format(range.from, "PP")} – ${format(range.to, "PP")}`
        : format(range.from, "PP");
    return "All dates";
  })();

  // Stage 4.5: only the visible rows reach the DOM once the list gets long.
  // Below the threshold this is inert and the table renders exactly as before,
  // which keeps find-in-page and copy-all working for the common case.
  const virtual = useVirtualRows(filtered.length, { estimateSize: 53 });
  const rendered = useMemo(
    () =>
      virtual.enabled
        ? virtual.virtualItems.map((vi) => ({ t: filtered[vi.index], index: vi.index }))
        : filtered.map((t, index) => ({ t, index })),
    [virtual.enabled, virtual.virtualItems, filtered],
  );

  const hasFilter =
    catFilter !== "all" || subtype !== "all" || !!singleDate || !!range?.from;

  const clearFilters = () => {
    setCatFilter("all");
    setSubtype("all");
    setSingleDate(undefined);
    setRange(undefined);
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {/* BUG-097 — h2, not h3. Every `glass-card` section heading in the
              app was an <h3> sitting directly under the page's <h1>, so the
              heading list a screen-reader user navigates by skipped a level on
              every page. The size is a class; the level is structure. */}
          <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
            {title} ({filtered.length}
            {hasFilter && data ? ` / ${data.length}` : ""})
          </h2>
          <PeriodSelect />
          {/*
            BUG-097 — this was a Radix `Tabs` with no `TabsContent` anywhere.
            Radix therefore put `aria-controls="…-content-income"` on each
            trigger pointing at a panel that does not exist, which axe reports
            as a critical `aria-valid-attr-value`: a screen reader announces
            "tab, controls…" and there is nothing to go to.

            It was never a tablist. There is no panel — the table below is the
            same table either way, with a different filter applied. So it is
            what it always was: a two-state toggle, and `aria-pressed` says
            exactly that with nothing left dangling.
          */}
          <div
            role="group"
            aria-label="Show income or expenses"
            className="inline-flex rounded-full bg-secondary/60 p-1 gap-1"
          >
            {(["income", "expense"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={type === v}
                onClick={() => { setType(v); setCatFilter("all"); setSubtype("all"); }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs transition-colors",
                  type === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "income" ? "Income" : "Expense"}
              </button>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" /> Add {title.slice(0, -1).toLowerCase()}
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {type === "income" && (
          <Select value={subtype} onValueChange={(v) => setSubtype(v as typeof subtype)}>
            {/* BUG-097 — a Radix trigger's only name is whatever it happens to
                be showing, so a screen reader announced "All income, button"
                with no clue it filters anything. `aria-label` names the
                CONTROL; the value is announced after it. */}
            <SelectTrigger className="w-[150px] h-9" aria-label="Filter by income type">
              <SelectValue placeholder="Income type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All income</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="passive">Passive</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[180px] h-9" aria-label="Filter by category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {allCategories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 justify-start font-normal",
                !singleDate && !range?.from && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Tabs
              value={dateMode}
              onValueChange={(v) => setDateMode(v as "single" | "range")}
              className="p-2"
            >
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="single">Single date</TabsTrigger>
                <TabsTrigger value="range">Date range</TabsTrigger>
              </TabsList>
              <TabsContent value="single" className="mt-2">
                <Calendar
                  mode="single"
                  selected={singleDate}
                  onSelect={(d) => {
                    setSingleDate(d);
                    setRange(undefined);
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </TabsContent>
              <TabsContent value="range" className="mt-2">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={range}
                  onSelect={(r) => {
                    setRange(r);
                    setSingleDate(undefined);
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>

        {hasFilter && (
          <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div
        ref={virtual.scrollRef}
        className={cn(
          "overflow-x-auto",
          // The windowed list needs a scroll container of its own; without a
          // bounded height there is nothing for the virtualiser to scroll.
          virtual.enabled && "max-h-[70vh] overflow-y-auto",
        )}
      >
        <BulkDeleteBar
          sel={sel}
          noun={["transaction", "transactions"]}
          className="mb-2"
          onDelete={async (ids) => {
            await delMany.mutateAsync(ids);
          }}
        />
        <Table>
          <TableHeader className={cn(virtual.enabled && "sticky top-0 z-10 bg-card")}>
            <TableRow>
              <TableHead className="w-10">
                <SelectAllBox sel={sel} />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {data && data.length > 0
                    ? "No transactions match the filters."
                    : `No ${title.toLowerCase()} yet. Click “Add” to create one.`}
                </TableCell>
              </TableRow>
            ) : (
              <>
              <VirtualSpacerRow height={virtual.paddingTop} colSpan={6} />
              {rendered.map(({ t, index }) => (
                <TableRow
                  key={t.id}
                  // Measured rather than assumed — a long note wraps, and a
                  // guessed height drifts the scrollbar over thousands of rows.
                  ref={virtual.enabled ? virtual.measureRef : undefined}
                  data-index={index}
                  data-state={sel.isSelected(t.id) ? "selected" : undefined}
                >
                  <TableCell className="w-10">
                    <SelectBox sel={sel} id={t.id} name={t.description ?? t.category} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {new Date(t.occurred_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {/* Both chips share the Category cell rather than the
                        tracker getting a sixth column: a new column would mean
                        coordinated edits to two colSpan={6} sites and both
                        VirtualSpacerRow colSpans inside a VIRTUALISED table,
                        for a value that is empty on most rows. The virtualiser
                        measures row height rather than assuming it, so a
                        wrapped second chip is absorbed correctly. */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* One chip: tracker when there is one, else category
                          (user decision, 2026-08-28). The category is still
                          announced, so hiding it costs no information. */}
                      {t.tracker_id && trackerNames.get(t.tracker_id) ? (
                        <>
                          <TrackerBadge
                            name={trackerNames.get(t.tracker_id) as string}
                            isLight={isLight}
                          />
                          <span className="sr-only">Category: {t.category}</span>
                        </>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                            categoryBadgeClass(type, t.category, isLight),
                          )}
                        >
                          {t.category}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[260px] truncate">
                    {t.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-display font-semibold">
                    {formatMoney(Number(t.amount), t.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* BUG-097 — icon-only buttons had no accessible name at
                          all: a screen reader announced "button" and stopped.
                          The label names the ROW too, because a table of
                          twenty identical "Edit, button" is only marginally
                          better than twenty nameless ones. */}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${t.description ?? "transaction"}`}
                        className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                        onClick={() => {
                          setEditing(t);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${t.description ?? "transaction"}`}
                        className="h-8 w-8 text-coral hover:text-coral hover:bg-destructive/10"
                        onClick={() => scheduleDelete(t.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <VirtualSpacerRow height={virtual.paddingBottom} colSpan={6} />
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={type}
        initial={editing}
      />

    </div>
  );
}