import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  /** Full ISO datetime string. Always non-empty when used. */
  value: string;
  onChange: (iso: string) => void;
  label?: string;
}

function safeDate(v: string): Date {
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function relativeDayLabel(d: Date) {
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, yest)) return "Yesterday";
  return format(d, "EEE, d MMM yyyy");
}

export default function DateTimeField({ value, onChange, label = "Transaction Date & Time" }: Props) {
  const [open, setOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"chips" | "calendar">("chips");

  const current = useMemo(() => safeDate(value), [value]);

  const setDatePart = (d: Date) => {
    const next = new Date(current);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    onChange(next.toISOString());
  };

  const setTimePart = (h: number, m: number) => {
    const next = new Date(current);
    next.setHours(h, m, 0, 0);
    onChange(next.toISOString());
  };

  const setToToday = () => {
    const now = new Date();
    onChange(now.toISOString());
  };
  const setToYesterday = () => {
    const next = new Date();
    next.setDate(next.getDate() - 1);
    // preserve current time so backdating only shifts the date
    next.setHours(current.getHours(), current.getMinutes(), 0, 0);
    onChange(next.toISOString());
  };

  const hours24 = current.getHours();
  const minutes = current.getMinutes();
  const isPM = hours24 >= 12;
  const hours12 = ((hours24 + 11) % 12) + 1;

  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const isToday = isSameDay(current, today);
  const isYesterday = isSameDay(current, yest);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5 text-primary" />
        {label}
        <span className="text-xs text-muted-foreground font-normal">· auto-filled</span>
      </Label>

      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setPickerMode("chips"); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between text-left font-normal h-10"
          >
            <span className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground">{relativeDayLabel(current)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="tabular-nums">{format(current, "hh:mm a")}</span>
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="w-[320px] p-3 space-y-3"
        >
          {/* Chips */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => { setToToday(); setPickerMode("chips"); }}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                isToday && pickerMode === "chips"
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/50 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => { setToYesterday(); setPickerMode("chips"); }}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                isYesterday && pickerMode === "chips"
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/50 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setPickerMode("calendar")}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                pickerMode === "calendar"
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/50 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              Specific date
            </button>
          </div>

          {pickerMode === "calendar" && (
            <div className="rounded-md border border-border/50">
              <Calendar
                mode="single"
                selected={current}
                onSelect={(d) => { if (d) setDatePart(d); }}
                disabled={(d) => d > new Date(new Date().setHours(23, 59, 59, 999))}
                initialFocus
                className={cn("p-2 pointer-events-auto")}
              />
            </div>
          )}

          {/* Time controls */}
          <div className="rounded-md border border-border/50 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Clock className="w-3 h-3" /> Time
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={12}
                value={hours12}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10);
                  if (!Number.isFinite(raw)) return;
                  const clamped = Math.min(12, Math.max(1, raw));
                  const h24 = (clamped % 12) + (isPM ? 12 : 0);
                  setTimePart(h24, minutes);
                }}
                className="h-9 w-16 text-center tabular-nums"
              />
              <span className="text-muted-foreground font-medium">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={String(minutes).padStart(2, "0")}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10);
                  if (!Number.isFinite(raw)) return;
                  const clamped = Math.min(59, Math.max(0, raw));
                  setTimePart(hours24, clamped);
                }}
                className="h-9 w-16 text-center tabular-nums"
              />
              <div className="ml-auto flex rounded-md border border-border/50 p-0.5">
                {(["AM", "PM"] as const).map((p) => {
                  const active = (p === "PM") === isPM;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        const h12 = ((hours24 + 11) % 12) + 1;
                        const h24 = (h12 % 12) + (p === "PM" ? 12 : 0);
                        setTimePart(h24, minutes);
                      }}
                      className={cn(
                        "px-2.5 py-1 text-xs font-semibold rounded-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {[
                { label: "Now", action: () => onChange(new Date().toISOString()) },
                { label: "9:00 AM", action: () => setTimePart(9, 0) },
                { label: "1:00 PM", action: () => setTimePart(13, 0) },
                { label: "7:00 PM", action: () => setTimePart(19, 0) },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={q.action}
                  className="rounded-full border border-border/50 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Quick chips visible inline under the field */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={setToToday}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            isToday
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/50 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
          )}
        >
          Today
        </button>
        <button
          type="button"
          onClick={setToYesterday}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            isYesterday
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/50 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
          )}
        >
          Yesterday
        </button>
        <button
          type="button"
          onClick={() => { setOpen(true); setPickerMode("calendar"); }}
          className="rounded-full border border-dashed border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40"
        >
          Specific date
        </button>
      </div>
    </div>
  );
}