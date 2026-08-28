import { useState } from "react";
import { SlidersHorizontal, X, Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  EMPTY_TRACKER_FILTER,
  MAX_SAVED_VIEWS,
  TRACKER_DATE_PRESETS,
  activeFilterCount,
  isTrackerFilterActive,
  type SavedTrackerView,
  type TrackerFilter,
} from "@/lib/trackerFilters";

/**
 * Filtering a tracker's transactions.
 *
 * Progressive disclosure, deliberately: DATE, CATEGORY and ACCOUNT are the
 * three the spec calls primary and they are always visible. Amount, payment
 * mode, type and text search live behind "More filters" — present for the
 * person who needs them, absent for the majority who do not (Hick's Law).
 *
 * Saved views are a NAME on a filter, not a query builder. The examples that
 * motivated them ("Labour", "Cash payments", "Payments above ₹10,000") are all
 * expressible as one of these.
 */

/** Multi-select rendered as toggle chips — cheaper to scan than a listbox. */
function ChipRow({
  options,
  selected,
  onToggle,
  emptyLabel,
  groupLabel,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  emptyLabel: string;
  groupLabel: string;
}) {
  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    // Without the group, a screen reader meets a row of unexplained toggle
    // buttons — "Labour, pressed" tells you nothing about what it filters.
    <div role="group" aria-label={groupLabel} className="flex items-center gap-1.5 flex-wrap">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className={cn(
              // min-h-[24px] is WCAG 2.5.8, which e2e/tap-targets.spec.ts
              // enforces at exactly 24. text-xs + py-1 lands a hair under on
              // some font stacks, so the floor is stated rather than implied.
              "text-xs rounded-full border px-2.5 py-1 min-h-[24px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:bg-accent/40",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export default function TrackerFilterBar({
  filter,
  onChange,
  categories,
  accounts,
  paymentModes,
  views,
  onSaveView,
  onDeleteView,
  resultCount,
  totalCount,
}: {
  filter: TrackerFilter;
  onChange: (f: TrackerFilter) => void;
  categories: string[];
  /** [id, label] so the chip shows a name while the filter stores an id. */
  accounts: { id: string; name: string }[];
  paymentModes: string[];
  views: SavedTrackerView[];
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
  resultCount: number;
  totalCount: number;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");

  const set = <K extends keyof TrackerFilter>(k: K, v: TrackerFilter[K]) =>
    onChange({ ...filter, [k]: v });

  const toggleIn = (k: "categories" | "accounts" | "paymentModes" | "types", v: string) =>
    set(k, filter[k].includes(v) ? filter[k].filter((x) => x !== v) : [...filter[k], v]);

  const active = isTrackerFilterActive(filter);
  const count = activeFilterCount(filter);

  const saveView = () => {
    const name = viewName.trim();
    if (!name) return;
    onSaveView(name);
    setViewName("");
    setNaming(false);
  };

  return (
    <div className="space-y-3">
      {/* ---- Saved views ---- */}
      {(views.length > 0 || active) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {views.map((v) => (
            <span key={v.id} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => onChange(v.filter)}
                className={cn(
                  "text-xs rounded-l-full border border-r-0 pl-2.5 pr-2 py-1 min-h-[24px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "border-border/50 text-muted-foreground hover:bg-accent/40 inline-flex items-center gap-1",
                )}
              >
                <Bookmark className="w-3 h-3" />
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => onDeleteView(v.id)}
                aria-label={`Delete saved view ${v.name}`}
                title={`Delete "${v.name}"`}
                className="text-xs rounded-r-full border border-border/50 px-1.5 py-1 min-h-[24px] min-w-[24px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}

          {active && views.length < MAX_SAVED_VIEWS && !naming && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setNaming(true)}
            >
              <BookmarkPlus className="w-3.5 h-3.5" /> Save this view
            </Button>
          )}

          {naming && (
            <span className="inline-flex items-center gap-1">
              <Input
                autoFocus
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveView();
                  if (e.key === "Escape") setNaming(false);
                }}
                placeholder="Name this view"
                maxLength={40}
                className="h-7 w-40 text-xs"
              />
              <Button size="sm" className="h-7 text-xs" onClick={saveView}>
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setNaming(false)}
              >
                Cancel
              </Button>
            </span>
          )}
        </div>
      )}

      {/* ---- Primary filters: date, category, account ---- */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label htmlFor="tf-date" className="text-xs text-muted-foreground">
            Date
          </Label>
          <Select
            value={filter.datePreset}
            onValueChange={(v) => set("datePreset", v as TrackerFilter["datePreset"])}
          >
            {/* htmlFor/id, or the label floats free and the combobox is
                announced with no name at all. */}
            <SelectTrigger id="tf-date" className="h-8 text-xs w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKER_DATE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-sm">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filter.datePreset === "custom" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="tf-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="tf-from"
                type="date"
                value={filter.customFrom ?? ""}
                onChange={(e) => set("customFrom", e.target.value || null)}
                className="h-8 text-xs w-36"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="tf-to"
                type="date"
                value={filter.customTo ?? ""}
                min={filter.customFrom ?? undefined}
                onChange={(e) => set("customTo", e.target.value || null)}
                className="h-8 text-xs w-36"
              />
            </div>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          More filters
          {count > 0 && (
            <span className="rounded-full bg-primary/15 text-primary px-1.5 text-[10px] font-medium">
              {count}
            </span>
          )}
        </Button>

        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1 text-muted-foreground"
            onClick={() => onChange(EMPTY_TRACKER_FILTER)}
          >
            <X className="w-3.5 h-3.5" /> Reset
          </Button>
        )}

        {/* Visibility of system status: say what the filter did, always. */}
        {/* Nielsen #1, visibility of system status — and it has to reach a
            screen-reader user too. Filtering changes the list silently; a
            polite live region says how much of it survived. Always mounted so
            the region exists BEFORE the text changes, or the first
            announcement is missed. */}
        <span
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground ml-auto tabular-nums"
        >
          {active ? `Showing ${resultCount} of ${totalCount}` : ""}
        </span>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Category</span>
          <ChipRow
            options={categories}
            selected={filter.categories}
            onToggle={(v) => toggleIn("categories", v)}
            emptyLabel="No categories yet."
            groupLabel="Filter by category"
          />
        </div>

        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Account</span>
          <ChipRow
            options={accounts.map((a) => a.name)}
            selected={filter.accounts
              .map((id) => accounts.find((a) => a.id === id)?.name)
              .filter((n): n is string => !!n)}
            onToggle={(name) => {
              const acc = accounts.find((a) => a.name === name);
              if (acc) toggleIn("accounts", acc.id);
            }}
            emptyLabel="No accounts used yet."
            groupLabel="Filter by account"
          />
        </div>
      </div>

      {/* ---- Advanced, hidden until asked for ---- */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleContent className="space-y-3 pt-1">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label htmlFor="tf-min" className="text-xs text-muted-foreground">
                Min ₹
              </Label>
              <Input
                id="tf-min"
                inputMode="numeric"
                value={filter.minAmount ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "");
                  set("minAmount", v ? Number(v) : null);
                }}
                className="h-8 text-xs w-28"
                placeholder="Any"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-max" className="text-xs text-muted-foreground">
                Max ₹
              </Label>
              <Input
                id="tf-max"
                inputMode="numeric"
                value={filter.maxAmount ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "");
                  set("maxAmount", v ? Number(v) : null);
                }}
                className="h-8 text-xs w-28"
                placeholder="Any"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[12rem]">
              <Label htmlFor="tf-search" className="text-xs text-muted-foreground">
                Description contains
              </Label>
              <Input
                id="tf-search"
                value={filter.search}
                onChange={(e) => set("search", e.target.value)}
                className="h-8 text-xs"
                placeholder="e.g. cement"
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Type</span>
            <ChipRow
              options={["expense", "income", "transfer"]}
              selected={filter.types}
              onToggle={(v) => toggleIn("types", v)}
              emptyLabel=""
              groupLabel="Filter by transaction type"
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Payment mode</span>
            <ChipRow
              options={paymentModes}
              selected={filter.paymentModes}
              onToggle={(v) => toggleIn("paymentModes", v)}
              emptyLabel="No payment modes recorded yet."
              groupLabel="Filter by payment mode"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
