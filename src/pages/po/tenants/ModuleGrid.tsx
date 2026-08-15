import {
  Bell,
  Calculator,
  Check,
  CreditCard,
  Download,
  HandCoins,
  LayoutDashboard,
  type LucideIcon,
  PieChart,
  Plane,
  Scale,
  ScanLine,
  Settings2,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCESS_MENUS, ALL_MENU_IDS } from "@/lib/accessMenus";

/* ─────────────────────────── module icon map ─────────────────────────── */

/**
 * Per-module icon for the toggle pills. This used to be a `ModuleMeta` record
 * carrying `iconBg` / `iconColor` / `pillActive` per module as well — thirteen
 * unused Tailwind class strings each: the grid has always drawn active pills in
 * one emerald treatment and read nothing but `Icon`. Dropped with the split
 * (Stage 4.13) rather than carried into a new file.
 *
 * Keys are the canonical menu ids from `@/lib/accessMenus`; anything without an
 * entry falls back to a generic gear, so a newly-added module renders rather
 * than crashes.
 */
const MODULE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  income: Wallet,
  expenses: HandCoins,
  investments: TrendingUp,
  budget: PieChart,
  goals: Target,
  reminders: Bell,
  calculator: Calculator,
  "bill-scan": ScanLine,
  import: Download,
  insurance: ShieldCheck,
  "net-worth": Scale,
  trips: Plane,
  billing: CreditCard,
};

/**
 * Reusable module selector grid — shows all 14 modules as toggleable pills.
 * `selected` = array of currently-enabled module IDs.
 */
export default function ModuleGrid({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((m) => m !== id) : [...selected, id],
    );

  const all = selected.length === ALL_MENU_IDS.length;

  return (
    <div className="space-y-2">
      {/* Quick actions */}
      <div className="flex items-center justify-between">
        {/* Stage 4.8: the count changes on every pill press and was never
            announced, so a screen-reader user toggling modules got no
            confirmation that anything had happened. */}
        <span className="text-xs text-muted-foreground" aria-live="polite">
          <span className="font-semibold text-foreground">{selected.length}</span> / {ALL_MENU_IDS.length} modules enabled
        </span>
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => onChange(all ? [] : [...ALL_MENU_IDS])}
        >
          {all ? "Deselect all" : "Select all"}
        </button>
      </div>

      {/* Module pills. These decide which features a workspace can reach, and
          whether one was on or off used to be conveyed only by colour plus a
          checkmark that fades to opacity-0 — nothing a screen reader can use.
          `aria-pressed` makes each pill state its own state. */}
      <div
        role="group"
        aria-label="Modules enabled for this workspace"
        className="grid grid-cols-2 sm:grid-cols-3 gap-2"
      >
        {ACCESS_MENUS.map((m) => {
          const active = selected.includes(m.id);
          const Icon = MODULE_ICONS[m.id] ?? Settings2;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(m.id)}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all text-left",
                active
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 shadow-sm"
                  : "border-border/40 bg-muted/10 text-muted-foreground hover:border-border/70 hover:bg-muted/30 hover:text-foreground",
              )}
            >
              {/* Icon container */}
              <span className={cn(
                "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                active
                  ? "bg-emerald-500/20"
                  : "bg-muted/30 group-hover:bg-muted/60",
              )}>
                <Icon className={cn(
                  "h-3.5 w-3.5 transition-colors",
                  active ? "text-emerald-400" : "text-muted-foreground group-hover:text-foreground",
                )} />
              </span>

              <span className="truncate leading-tight">{m.label}</span>

              {/* Active checkmark */}
              <span className={cn(
                "absolute top-2 right-2 h-4 w-4 rounded-full flex items-center justify-center transition-all",
                active
                  ? "bg-primary scale-100 opacity-100"
                  : "scale-75 opacity-0",
              )}
              // Purely decorative now that the button reports `aria-pressed`;
              // opacity-0 hides it visually but leaves it in the a11y tree.
              aria-hidden="true">
                <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
