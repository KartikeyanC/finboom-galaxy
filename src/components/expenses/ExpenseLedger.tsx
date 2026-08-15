import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Pencil,
  Plus,
  Trash2,
  Search,
  Sunrise,
  Sun,
  Moon,
  X,
  Sparkles,
  UtensilsCrossed,
  Bus,
  ShoppingBasket,
  Clapperboard,
  Zap,
  Users,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Plane,
  Heart,
  GraduationCap,
  Home,
  Scissors,
  TrendingUp,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { CategoryChart, ChartViewToggle, useChartView, type ChartSlice } from "@/components/ui/category-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TransactionDialog from "@/components/transactions/TransactionDialog";
import {
  useDeleteTransaction,
  useTransactions,
  type Transaction,
} from "@/hooks/useTransactions";
import { formatMoney, toINR } from "@/lib/finance";
import { categoryBadgeClass } from "@/lib/categories";
import { useTheme } from "@/contexts/ThemeContext";
import MatrixFilter from "@/components/filters/MatrixFilter";
import { EXPENSE_CATEGORIES } from "@/lib/finance";
import { parseSplit } from "@/lib/splitMeta";
import PeriodSelect from "@/components/ledger/PeriodSelect";
import { ledgerPeriodLabel, useLedgerPeriod } from "@/lib/ledgerPeriod";

type ChipDef = {
  id: string;
  label: string;
  icon: LucideIcon;
  tint: string;
  match?: string[];
};

const CHIPS: ChipDef[] = [
  { id: "all", label: "All", icon: Sparkles, tint: "text-amber-300" },
  { id: "food", label: "Food & Dining", icon: UtensilsCrossed, tint: "text-yellow-300", match: ["Food & Dining"] },
  { id: "transport", label: "Transport", icon: Bus, tint: "text-orange-300", match: ["Transport", "Travel & Transport", "Travel"] },
  { id: "groceries", label: "Groceries", icon: ShoppingBasket, tint: "text-pink-300", match: ["Groceries", "Shopping"] },
  { id: "entertainment", label: "Entertainment", icon: Clapperboard, tint: "text-indigo-300", match: ["Entertainment"] },
  { id: "bills", label: "Bills", icon: Zap, tint: "text-violet-300", match: ["Utilities", "Subscriptions", "Rent"] },
];

type Slot = "morning" | "afternoon" | "evening";
const SLOT_META: Record<Slot, { short: string; icon: typeof Sunrise; tint: string }> = {
  morning:   { short: "Morning",   icon: Sunrise, tint: "text-amber-300/90" },
  afternoon: { short: "Afternoon", icon: Sun,     tint: "text-orange-300/90" },
  evening:   { short: "Evening",   icon: Moon,    tint: "text-indigo-300/90" },
};

// Category icon map
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Food & Dining":  UtensilsCrossed,
  "Transport":      Bus,
  "Travel":         Plane,
  "Shopping":       ShoppingBasket,
  "Healthcare":     Heart,
  "Education":      GraduationCap,
  "Rent":           Home,
  "Utilities":      Zap,
  "Subscriptions":  Zap,
  "Entertainment":  Clapperboard,
  "Personal Care":  Scissors,
  "Investment":     TrendingUp,
  "Groceries":      ShoppingBasket,
  "Other":          CircleDot,
};

// Strip the [AccountName|accountId] prefix that account-linked transactions embed.
const ACCOUNT_PREFIX_RE = /^\[[^\]|]+\|[^\]]+\]\s*/;
function stripAccountPrefix(desc: string | null | undefined): string {
  if (!desc) return "";
  return desc.replace(ACCOUNT_PREFIX_RE, "");
}

function slotFor(d: Date): Slot {
  const h = d.getHours();
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDayLabel(d: Date) {
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function ExpenseLedger() {
  // Stage 4.2: bounded at the server by the shared period, so the search, the
  // chips, the matrix filter and the chart below all stay exactly correct over
  // what was actually fetched.
  const period = useLedgerPeriod();
  const { data, isLoading } = useTransactions("expense", period);
  const del = useDeleteTransaction();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [chip, setChip] = useState<string>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useChartView();

  // chip + search narrowing happens first; matrix filter handles date/category cross-filter
  const preFiltered = useMemo(() => {
    const list = data ?? [];
    const chipDef = CHIPS.find((c) => c.id === chip);
    const q = search.trim().toLowerCase();
    return list.filter((t) => {
      if (chipDef?.match && !chipDef.match.includes(t.category)) return false;
      if (q.length >= 2) {
        const hay = `${t.category} ${t.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, chip, search]);

  return (
    <div className="glass-card p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 flex-wrap">
        <div>
          <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
            Expense Ledger
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {preFiltered.length} {preFiltered.length === 1 ? "entry" : "entries"} in view
            {" · "}
            <span className="lowercase">{ledgerPeriodLabel(period)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelect />
          <ChartViewToggle view={view} onChange={setView} />
          <AnimatePresence initial={false}>
            {searchOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 200, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Type 2+ letters…"
                  className="h-8 text-xs"
                />
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              if (searchOpen) setSearch("");
              setSearchOpen(!searchOpen);
            }}
            aria-label="Search expenses"
          >
            {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add expense
          </Button>
        </div>
      </div>

      {/* Sticky filter chip rail */}
      <div className="sticky top-0 z-10 bg-background/85 backdrop-blur border-y border-border/40">
        <div className="flex items-center gap-2 px-5 py-2.5 overflow-x-auto no-scrollbar touch-pan-x">
          {CHIPS.map((c) => {
            const active = chip === c.id;
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => setChip(c.id)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-3.5 py-1.5 text-xs font-medium border transition-all",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    active ? "text-primary-foreground" : c.tint,
                  )}
                  strokeWidth={2.25}
                />
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Matrix filter + list */}
      <div className="px-5 py-5">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-10 text-sm">Loading…</p>
        ) : (
          <MatrixFilter<Transaction>
            items={preFiltered}
            getDate={(t) => new Date(t.occurred_at)}
            getCategory={(t) => t.category}
            getAmount={(t) => toINR(Number(t.amount), t.currency)}
            allCategories={[...EXPENSE_CATEGORIES]}
            currencyTag="INR"
          >
            {(filtered) => {
              if (view !== "list") {
                if (filtered.length === 0) {
                  return (
                    <p className="text-center text-muted-foreground py-10 text-sm">
                      {data && data.length > 0
                        ? "No expenses match your filters."
                        : "No expenses yet. Click Add to log your first one."}
                    </p>
                  );
                }
                {
                  const m = new Map<string, number>();
                  filtered.forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + toINR(Number(t.amount), t.currency)));
                  const slices: ChartSlice[] = Array.from(m, ([name, value]) => ({ name, value }));
                  return <CategoryChart data={slices} view={view} centerLabel="Spent" emptyText="No expenses to chart." />;
                }
              }
              const byDay = new Map<string, { date: Date; items: Transaction[] }>();
              filtered.forEach((t) => {
                const d = new Date(t.occurred_at);
                const k = dayKey(d);
                if (!byDay.has(k)) byDay.set(k, { date: d, items: [] });
                byDay.get(k)!.items.push(t);
              });
              const days = Array.from(byDay.entries())
                .map(([k, v]) => ({ key: k, date: v.date, items: v.items }))
                .sort((a, b) => b.date.getTime() - a.date.getTime());

              if (days.length === 0) {
                return (
                  <p className="text-center text-muted-foreground py-10 text-sm">
                    {data && data.length > 0
                      ? "No expenses match your filters."
                      : "No expenses yet. Click Add to log your first one."}
                  </p>
                );
              }
              return (
                <div className="space-y-6 mt-4">
                  {days.map((day) => (
                    <DayBlock
                      key={day.key}
                      dayKey={day.key}
                      date={day.date}
                      items={day.items}
                      isLight={isLight}
                      onEdit={(t) => { setEditing(t); setDialogOpen(true); }}
                      onDelete={(id) => setDeleteId(id)}
                    />
                  ))}
                </div>
              );
            }}
          </MatrixFilter>
        )}
      </div>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type="expense"
        initial={editing}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteId) {
                  await del.mutateAsync(deleteId);
                  setDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ----------------------- Day block ----------------------- */

function DayBlock({
  dayKey: dKey,
  date,
  items,
  isLight,
  onEdit,
  onDelete,
}: {
  dayKey: string;
  date: Date;
  items: Transaction[];
  isLight: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const dayTotal = items.reduce((s, t) => s + toINR(Number(t.amount), t.currency), 0);
  const amounts = items.map((t) => toINR(Number(t.amount), t.currency));
  const minA = Math.min(...amounts);
  const maxA = Math.max(...amounts);
  const fmtN = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  // Flat list sorted latest-first; slot label rendered inline per row.
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
      ),
    [items],
  );

  return (
    <section>
      {/* Thin date ribbon — click to collapse/expand the day */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left flex items-center justify-between gap-3 px-3 py-1.5 mb-1.5 rounded-md bg-white/[0.03] border border-border/30 hover:bg-white/[0.05] hover:border-border/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-foreground/45 shrink-0 transition-transform duration-200", !open && "-rotate-90")}
          />
          <h3 className="font-display text-xs font-semibold text-foreground uppercase tracking-wider">
            {formatDayLabel(date)}
          </h3>
          <span className="text-xs text-foreground/55 tabular-nums">
            · {items.length} {items.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {items.length > 1 && (
            <span className="hidden sm:inline-flex items-center gap-2.5 text-xs font-medium tabular-nums">
              <span className="inline-flex items-center gap-0.5 text-emerald-400/85" title="Lowest entry">
                <ArrowDown className="h-3 w-3" strokeWidth={2.5} /> ₹{fmtN(minA)}
              </span>
              <span className="inline-flex items-center gap-0.5 text-emerald-400/85" title="Highest entry">
                <ArrowUp className="h-3 w-3" strokeWidth={2.5} /> ₹{fmtN(maxA)}
              </span>
            </span>
          )}
          <span className="font-display text-sm font-bold text-foreground tabular-nums">
            ₹{dayTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        </div>
      </button>

      {/* Day rows — collapsible */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="day-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-border/40 bg-white/[0.02] overflow-hidden divide-y divide-border/30 transition-colors hover:border-border/60">
        <AnimatePresence initial={false} mode="popLayout">
          {sorted.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <Row t={t} isLight={isLight} onEdit={onEdit} onDelete={onDelete} />
            </motion.div>
          ))}
        </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ----------------------- Row ----------------------- */

function Row({
  t,
  isLight,
  onEdit,
  onDelete,
}: {
  t: Transaction;
  isLight: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const d = new Date(t.occurred_at);
  const amount = formatMoney(Number(t.amount), t.currency);
  const slot = slotFor(d);
  const slotMeta = SLOT_META[slot];
  const SlotIcon = slotMeta.icon;
  const { meta: split, clean: afterSplit } = parseSplit(t.description);
  const cleanDesc = stripAccountPrefix(afterSplit);
  const title = cleanDesc.trim() || t.category;
  const hasDescription = !!cleanDesc.trim();
  const CategoryIcon = CATEGORY_ICONS[t.category] ?? CircleDot;
  const isOwe = split?.mode === "owe";
  return (
    <div
      className={cn(
        "group/row flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 sm:py-2 hover:bg-muted/20 transition-colors",
        isOwe && "border-l-2 border-amber-500/70 bg-amber-500/[0.04]",
      )}
    >
      {/* Left cluster: time + category + description, tightly grouped */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={cn("inline-flex items-center text-primary/70")}
          title={t.category}
        >
          <CategoryIcon className="w-3.5 h-3.5" />
        </span>
        <span className="text-xs font-mono text-foreground/65 shrink-0 tabular-nums" title={slotMeta.short}>
          {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0",
            categoryBadgeClass("expense", t.category, isLight),
          )}
        >
          {t.category}
        </span>
        {split && (
          <span
            className="inline-flex items-center text-indigo-300/90 shrink-0"
            title={`Split with ${split.friend}`}
          >
            <Users className="w-3.5 h-3.5" />
          </span>
        )}
        <span className="text-sm text-foreground font-medium truncate min-w-0">
          {title}
          {!hasDescription && (
            <span className="ml-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/60 font-normal">
              · no note
            </span>
          )}
        </span>
        {split?.mode === "settled" && (
          <span className="hidden sm:inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 text-xs font-medium shrink-0">
            💳 Paid via UPI
          </span>
        )}
        {split?.mode === "owe" && (
          <span className="hidden sm:inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 px-1.5 py-0.5 text-xs font-medium shrink-0">
            ⚠️ Unsettled · {split.friend}
          </span>
        )}
        {split?.mode === "paid_full" && (
          <span className="hidden sm:inline-flex items-center rounded-md border border-teal-500/40 bg-teal-500/10 text-teal-300 px-1.5 py-0.5 text-xs font-medium shrink-0">
            🫱 Owed by {split.friend}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0">
        <span className="font-display text-sm font-semibold tabular-nums text-coral/90">
          − {amount}
        </span>
        <div className="flex items-center gap-0.5 opacity-100 sm:opacity-30 sm:group-hover/row:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 sm:h-7 sm:w-7"
            onClick={() => onEdit(t)}
            aria-label="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 sm:h-7 sm:w-7 text-coral hover:text-coral"
            onClick={() => onDelete(t.id)}
            aria-label="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}