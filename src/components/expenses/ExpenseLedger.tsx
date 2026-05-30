import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Pencil,
  Plus,
  Trash2,
  Search,
  ChevronDown,
  Sunrise,
  Sun,
  Moon,
  X,
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

type ChipDef = { id: string; label: string; icon: string; match?: string[] };

const CHIPS: ChipDef[] = [
  { id: "all", label: "All", icon: "✨" },
  { id: "food", label: "Food & Dining", icon: "🍔", match: ["Food & Dining"] },
  { id: "transport", label: "Transport", icon: "🚗", match: ["Transport"] },
  { id: "groceries", label: "Groceries", icon: "🛒", match: ["Groceries", "Shopping"] },
  { id: "entertainment", label: "Entertainment", icon: "🍿", match: ["Entertainment"] },
  { id: "bills", label: "Bills", icon: "⚡", match: ["Utilities", "Subscriptions", "Rent"] },
];

type Slot = "morning" | "afternoon" | "evening";
const SLOT_META: Record<Slot, { label: string; icon: typeof Sunrise; tint: string }> = {
  morning: { label: "Morning Spends · 6 AM – 12 PM", icon: Sunrise, tint: "bg-amber-500/5 text-amber-300/90" },
  afternoon: { label: "Afternoon Spends · 12 PM – 5 PM", icon: Sun, tint: "bg-orange-500/5 text-orange-300/90" },
  evening: { label: "Evening & Night · 5 PM – 6 AM", icon: Moon, tint: "bg-indigo-500/5 text-indigo-300/90" },
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add expense
        </Button>
      </div>

      {/* Sticky filter chip rail */}
      <div className="sticky top-0 z-10 bg-background/85 backdrop-blur border-y border-border/40">
        <div className="flex items-center gap-2 px-5 py-2.5 overflow-x-auto no-scrollbar touch-pan-x">
          {CHIPS.map((c) => {
            const active = chip === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setChip(c.id)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="text-sm leading-none">{c.icon}</span>
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
                      searchOpen={searchOpen}
                      setSearchOpen={setSearchOpen}
                      search={search}
                      setSearch={setSearch}
                      openGroups={openGroups}
                      setOpenGroups={setOpenGroups}
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
  searchOpen,
  setSearchOpen,
  search,
  setSearch,
  openGroups,
  setOpenGroups,
  onEdit,
  onDelete,
}: {
  dayKey: string;
  date: Date;
  items: Transaction[];
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  openGroups: Record<string, boolean>;
  setOpenGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const dayTotal = items.reduce((s, t) => s + toINR(Number(t.amount), t.currency), 0);

  const slots = useMemo(() => {
    const bySlot: Record<Slot, Transaction[]> = { morning: [], afternoon: [], evening: [] };
    items.forEach((t) => bySlot[slotFor(new Date(t.occurred_at))].push(t));
    return (Object.keys(SLOT_META) as Slot[])
      .map((s) => ({ slot: s, items: bySlot[s] }))
      .filter((b) => b.items.length > 0);
  }, [items]);

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2">
          <h4 className="font-display text-sm font-semibold text-foreground">
            {formatDayLabel(date)}
          </h4>
          <span className="text-xs text-muted-foreground">· {items.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence initial={false}>
            {searchOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 180, opacity: 1 }}
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
          <span className="font-display text-sm font-bold text-foreground tabular-nums">
            ₹{dayTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {slots.map(({ slot, items: slotItems }) => (
          <SlotBlock
            key={slot}
            dayKey={dKey}
            slot={slot}
            items={slotItems}
            openGroups={openGroups}
            setOpenGroups={setOpenGroups}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

/* ----------------------- Slot block ----------------------- */

function SlotBlock({
  dayKey: dKey,
  slot,
  items,
  openGroups,
  setOpenGroups,
  onEdit,
  onDelete,
}: {
  dayKey: string;
  slot: Slot;
  items: Transaction[];
  openGroups: Record<string, boolean>;
  setOpenGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const meta = SLOT_META[slot];
  const Icon = meta.icon;

  // group by category to collapse duplicates
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    items.forEach((t) => {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    });
    return Array.from(map.entries()).map(([category, txns]) => ({ category, txns }));
  }, [items]);

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className={cn("flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wider font-semibold", meta.tint)}>
        <Icon className="w-3.5 h-3.5" />
        <span>{meta.label}</span>
      </div>

      <div className="divide-y divide-border/30">
        <AnimatePresence initial={false} mode="popLayout">
          {groups.map(({ category, txns }) => {
            const key = `${dKey}-${slot}-${category}`;
            const collapsed = txns.length >= 2;
            const open = !!openGroups[key];
            const total = txns.reduce((s, t) => s + toINR(Number(t.amount), t.currency), 0);

            if (!collapsed) {
              return (
                <motion.div
                  key={key}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <Row t={txns[0]} onEdit={onEdit} onDelete={onDelete} />
                </motion.div>
              );
            }

            return (
              <motion.div key={key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button
                  onClick={() => setOpenGroups((s) => ({ ...s, [key]: !s[key] }))}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                        categoryBadgeClass("expense", category),
                      )}
                    >
                      {category}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      ({txns.length} entries)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-semibold tabular-nums">
                      ₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden bg-muted/20"
                    >
                      <div className="divide-y divide-border/20">
                        {txns.map((t) => (
                          <Row key={t.id} t={t} onEdit={onEdit} onDelete={onDelete} compact />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ----------------------- Row ----------------------- */

function Row({
  t,
  onEdit,
  onDelete,
  compact,
}: {
  t: Transaction;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  const d = new Date(t.occurred_at);
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 hover:bg-muted/20 transition-colors",
        compact ? "py-1.5 pl-6" : "py-2.5",
      )}
    >
      <span className="text-[11px] font-mono text-muted-foreground w-12 shrink-0 tabular-nums">
        {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      {!compact && (
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0",
            categoryBadgeClass("expense", t.category),
          )}
        >
          {t.category}
        </span>
      )}
      <span className="text-sm text-foreground/90 truncate flex-1 min-w-0">
        {t.description ?? <span className="text-muted-foreground">—</span>}
      </span>
      <span className="font-display text-sm font-semibold tabular-nums">
        {formatMoney(Number(t.amount), t.currency)}
      </span>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(t)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-coral hover:text-coral"
          onClick={() => onDelete(t.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}