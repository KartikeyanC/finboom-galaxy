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
  type LucideIcon,
} from "lucide-react";
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
import MatrixFilter from "@/components/filters/MatrixFilter";
import { EXPENSE_CATEGORIES } from "@/lib/finance";

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
  { id: "transport", label: "Transport", icon: Bus, tint: "text-orange-300", match: ["Transport"] },
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
  const { data, isLoading } = useTransactions("expense");
  const del = useDeleteTransaction();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [chip, setChip] = useState<string>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

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
          <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
            Expense Ledger
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {preFiltered.length} {preFiltered.length === 1 ? "entry" : "entries"} in view
          </p>
        </div>
        <div className="flex items-center gap-2">
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
  onEdit,
  onDelete,
}: {
  dayKey: string;
  date: Date;
  items: Transaction[];
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const dayTotal = items.reduce((s, t) => s + toINR(Number(t.amount), t.currency), 0);

  // Flat list sorted latest-first; slot label rendered inline per row.
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      ),
    [items],
  );

  return (
    <section>
      {/* Thin date ribbon */}
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 mb-1.5 rounded-md bg-white/[0.03] border border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="font-display text-xs font-semibold text-foreground uppercase tracking-wider">
            {formatDayLabel(date)}
          </h4>
          <span className="text-[11px] text-foreground/55 tabular-nums">
            · {items.length} {items.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <span className="font-display text-sm font-bold text-foreground tabular-nums">
          ₹{dayTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </span>
      </div>

      {/* Unified rounded card with all day rows stacked */}
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
              <Row t={t} onEdit={onEdit} onDelete={onDelete} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ----------------------- Row ----------------------- */

function Row({
  t,
  onEdit,
  onDelete,
}: {
  t: Transaction;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const d = new Date(t.occurred_at);
  const amount = formatMoney(Number(t.amount), t.currency);
  const slot = slotFor(d);
  const slotMeta = SLOT_META[slot];
  const SlotIcon = slotMeta.icon;
  const title = t.description?.trim() || t.category;
  const hasDescription = !!t.description?.trim();
  return (
    <div
      className="group/row flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 sm:py-2 hover:bg-muted/20 transition-colors"
    >
      {/* Left cluster: time + category + description, tightly grouped */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={cn("inline-flex items-center", slotMeta.tint)}
          title={slotMeta.short}
        >
          <SlotIcon className="w-3 h-3" />
        </span>
        <span className="text-[11px] font-mono text-foreground/65 shrink-0 tabular-nums">
          {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0",
            categoryBadgeClass("expense", t.category),
          )}
        >
          {t.category}
        </span>
        <span className="text-sm text-foreground font-medium truncate min-w-0">
          {title}
          {!hasDescription && (
            <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-normal">
              · no note
            </span>
          )}
        </span>
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