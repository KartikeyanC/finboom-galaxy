import { useState } from "react";
import { format, parseISO, addDays, addWeeks, addMonths, addYears, isValid } from "date-fns";
import { CalendarIcon, ChevronDown, Check, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PresetMode = "future" | "past" | "any";

interface Preset {
  label: string;
  iso: () => string;
}

function buildPresets(mode: PresetMode): Preset[] {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  if (mode === "future") {
    return [
      { label: "Today",     iso: () => fmt(today) },
      { label: "Tomorrow",  iso: () => fmt(addDays(today, 1)) },
      { label: "+1 Week",   iso: () => fmt(addWeeks(today, 1)) },
      { label: "+1 Month",  iso: () => fmt(addMonths(today, 1)) },
      { label: "+3 Months", iso: () => fmt(addMonths(today, 3)) },
      { label: "+6 Months", iso: () => fmt(addMonths(today, 6)) },
      { label: "+1 Year",   iso: () => fmt(addYears(today, 1)) },
    ];
  }
  if (mode === "past") {
    return [
      { label: "Today",      iso: () => fmt(today) },
      { label: "Yesterday",  iso: () => fmt(addDays(today, -1)) },
      { label: "-1 Week",    iso: () => fmt(addWeeks(today, -1)) },
      { label: "-1 Month",   iso: () => fmt(addMonths(today, -1)) },
    ];
  }
  return [
    { label: "Today",     iso: () => fmt(today) },
    { label: "Tomorrow",  iso: () => fmt(addDays(today, 1)) },
    { label: "Yesterday", iso: () => fmt(addDays(today, -1)) },
    { label: "+1 Week",   iso: () => fmt(addWeeks(today, 1)) },
    { label: "+1 Month",  iso: () => fmt(addMonths(today, 1)) },
    { label: "+6 Months", iso: () => fmt(addMonths(today, 6)) },
    { label: "+1 Year",   iso: () => fmt(addYears(today, 1)) },
  ];
}

function parseDate(v: string): Date | undefined {
  if (!v) return undefined;
  const d = parseISO(v);
  return isValid(d) ? d : undefined;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  presets?: PresetMode;
  clearable?: boolean;
  className?: string;
  disabled?: (date: Date) => boolean;
}

export function DatePickerField({
  value,
  onChange,
  label,
  placeholder = "Pick a date",
  presets = "any",
  clearable = true,
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = parseDate(value);
  const presetList = buildPresets(presets);
  const defaultMonth = selected ?? new Date();

  const select = (d: Date | undefined) => {
    onChange(d ? format(d, "yyyy-MM-dd") : "");
    if (d) setOpen(false);
  };

  const clear = () => {
    onChange("");
    setOpen(false);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label>{label}</Label>}

      <Popover open={open} onOpenChange={setOpen}>
        {/* ── Trigger button ── */}
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-9 px-3 group",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
            {selected ? (
              <span className="text-foreground">{format(selected, "dd MMM yyyy")}</span>
            ) : (
              <span>{placeholder}</span>
            )}
            <span className="ml-auto flex items-center gap-1">
              {clearable && selected && (
                <X
                  className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); clear(); }}
                />
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
            </span>
          </Button>
        </PopoverTrigger>

        {/* ── Two-panel popover ── */}
        <PopoverContent
          align="start"
          sideOffset={6}
          className="p-0 w-[520px] shadow-xl border border-border/60 overflow-hidden"
        >
          <div className="flex min-h-[320px]">

            {/* ── LEFT: Quick Presets ── */}
            <div className="w-[200px] shrink-0 flex flex-col bg-muted/10 border-r border-border/40">
              <p className="px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Quick Select
              </p>
              <div className="flex-1 px-2 space-y-0.5 pb-3">
                {presetList.map((p) => {
                  const iso = p.iso();
                  const active = value === iso;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => { onChange(iso); setOpen(false); }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <span>{p.label}</span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Clear */}
              {clearable && (
                <div className="border-t border-border/40 p-3">
                  <button
                    type="button"
                    onClick={clear}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1 rounded-md hover:bg-muted/60"
                  >
                    Clear date
                  </button>
                </div>
              )}
            </div>

            {/* ── RIGHT: Calendar ── */}
            <div className="flex flex-col flex-1 bg-background">
              <p className="px-4 pt-4 pb-0 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Pick a date
              </p>
              <Calendar
                mode="single"
                selected={selected}
                onSelect={select}
                defaultMonth={defaultMonth}
                disabled={disabled}
                initialFocus
                className="p-3"
              />

              {/* Footer */}
              <div className="border-t border-border/40 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {selected ? format(selected, "dd MMM yyyy") : "No date selected"}
                </span>
                <Button
                  size="sm"
                  className="h-7 text-xs px-4"
                  onClick={() => setOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>

          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
