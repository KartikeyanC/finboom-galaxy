import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import {
  CONTEXT_HINT, CONTEXT_LABEL,
  type GraceWindow, type MaturityLead,
  type ReminderContext, type ReminderFrequency,
} from "@/lib/remindersStore";

export interface ReminderDraft {
  enabled: boolean;
  context: ReminderContext;
  date: string;
  amount?: string;
  notes?: string;
  frequency?: ReminderFrequency;
  grace?: GraceWindow;
  verifyLiquidity?: boolean;
  maturityLeads?: MaturityLead[];
}

export const emptyDraft = (ctx: ReminderContext): ReminderDraft => ({
  enabled: false,
  context: ctx,
  date: "",
  frequency: ctx === "fixed_due" ? "monthly" : undefined,
  grace: ctx === "fixed_due" ? "1d" : undefined,
  verifyLiquidity: ctx === "balance_buffer" ? true : undefined,
  maturityLeads: ctx === "maturity" ? ["30d", "7d"] : undefined,
});

interface Props {
  value: ReminderDraft;
  onChange: (v: ReminderDraft) => void;
  /** Hide the context picker if the parent already knows the context. */
  lockContext?: boolean;
}

export function ReminderField({ value, onChange, lockContext }: Props) {
  const set = <K extends keyof ReminderDraft>(k: K, v: ReminderDraft[K]) =>
    onChange({ ...value, [k]: v });

  const toggleLead = (lead: MaturityLead) => {
    const cur = value.maturityLeads ?? [];
    onChange({
      ...value,
      maturityLeads: cur.includes(lead)
        ? cur.filter((l) => l !== lead)
        : [...cur, lead],
    });
  };

  const switchContext = (ctx: ReminderContext) => {
    onChange({ ...emptyDraft(ctx), enabled: value.enabled, date: value.date, notes: value.notes, amount: value.amount });
  };

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <div>
            <Label className="text-sm font-medium">Enable Reminder</Label>
            <p className="text-[11px] text-muted-foreground">
              We&apos;ll surface this in your control center.
            </p>
          </div>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(v) => set("enabled", v)}
        />
      </div>

      {value.enabled && (
        <div className="space-y-3 pt-2 border-t border-border/40">
          {!lockContext && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["fixed_due", "balance_buffer", "maturity"] as ReminderContext[]).map((ctx) => (
                <button
                  key={ctx}
                  type="button"
                  onClick={() => switchContext(ctx)}
                  className={cn(
                    "text-left rounded-lg border px-3 py-2 transition-colors",
                    value.context === ctx
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/50 hover:bg-accent/40",
                  )}
                >
                  <div className="text-xs font-semibold text-foreground">
                    {CONTEXT_LABEL[ctx]}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {CONTEXT_HINT[ctx]}
                  </div>
                </button>
              ))}
            </div>
          )}

          {value.context === "fixed_due" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={value.date} onChange={(e) => set("date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Frequency</Label>
                <Select value={value.frequency ?? "monthly"} onValueChange={(v) => set("frequency", v as ReminderFrequency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">One-time</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">Grace Period Warning</Label>
                <Select value={value.grace ?? "1d"} onValueChange={(v) => set("grace", v as GraceWindow)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3d">Remind me 3 days early</SelectItem>
                    <SelectItem value="1d">Remind me 1 day early</SelectItem>
                    <SelectItem value="exact">Remind me on the exact due date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {value.context === "balance_buffer" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Investment Date</Label>
                <Input type="date" value={value.date} onChange={(e) => set("date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Estimated Debit Amount</Label>
                <Input type="number" inputMode="decimal" placeholder="10000" value={value.amount ?? ""} onChange={(e) => set("amount", e.target.value)} />
              </div>
              <label className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2 cursor-pointer">
                <Checkbox
                  checked={!!value.verifyLiquidity}
                  onCheckedChange={(v) => set("verifyLiquidity", !!v)}
                  className="mt-0.5"
                />
                <span className="text-xs text-foreground leading-relaxed">
                  Alert me 48 hours early to verify my funding bank account balance has enough liquidity.
                </span>
              </label>
            </div>
          )}

          {value.context === "maturity" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Maturity Date</Label>
                <Input type="date" value={value.date} onChange={(e) => set("date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reallocation Alerts</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["30d", "7d"] as MaturityLead[]).map((lead) => {
                    const active = (value.maturityLeads ?? []).includes(lead);
                    return (
                      <button
                        key={lead}
                        type="button"
                        onClick={() => toggleLead(lead)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                          active
                            ? "border-primary/60 bg-primary/10 text-foreground"
                            : "border-border/50 hover:bg-accent/40 text-muted-foreground",
                        )}
                      >
                        <span className={cn("w-3.5 h-3.5 rounded-full border", active ? "border-primary bg-primary" : "border-muted-foreground/50")} />
                        Notify {lead === "30d" ? "30 days" : "7 days"} prior
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Custom Note (optional)</Label>
            <Input
              placeholder="Leave blank for a smart default message"
              value={value.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={140}
            />
          </div>
        </div>
      )}
    </div>
  );
}
