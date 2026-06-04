import { useMemo, useState } from "react";
import {
  Plane,
  Plus,
  Wallet,
  CreditCard,
  Smartphone,
  Users,
  User,
  Home,
  Flag,
  Trash2,
  Gauge,
  Archive,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useTrips,
  tripTotals,
  formatINR,
  type Trip,
  type TripKind,
  type PaymentSource,
} from "@/lib/tripsStore";

const KIND_META: Record<TripKind, { label: string; icon: typeof User; tint: string }> = {
  solo: { label: "Solo Trip", icon: User, tint: "text-chart-2" },
  friends: { label: "Friends Trip", icon: Users, tint: "text-chart-4" },
  family: { label: "Family Trip", icon: Home, tint: "text-chart-3" },
};

const SOURCE_META: Record<
  PaymentSource,
  { label: string; icon: typeof Wallet; emoji: string }
> = {
  cash: { label: "Cash", icon: Wallet, emoji: "💵" },
  card: { label: "Card", icon: CreditCard, emoji: "💳" },
  wallet: { label: "Mobile Wallet", icon: Smartphone, emoji: "📱" },
};

const CATEGORIES = ["Food", "Stay", "Travel", "Activity", "Shopping", "Other"];

export default function TripsPage() {
  const { trips, upsert, remove, addExpense, removeExpense, archive } = useTrips();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);

  const active = useMemo(
    () => trips.find((t) => t.id === activeId) ?? null,
    [trips, activeId],
  );

  if (active) {
    return (
      <TripWorkspace
        trip={active}
        onBack={() => setActiveId(null)}
        onAddExpense={(e) => addExpense(active.id, e)}
        onRemoveExpense={(id) => removeExpense(active.id, id)}
        onConclude={() => setArchiveTarget(active.id)}
        onUpdateTrip={(t) => upsert(t)}
      />
    );
  }

  const activeTrips = trips.filter((t) => t.status === "active");
  const archived = trips.filter((t) => t.status === "archived");

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[1200px] mx-auto">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
            Sandbox · Isolated from Daily Ledger
          </span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
            <Plane className="w-7 h-7 text-primary" /> Trip Tracker Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Create isolated trip profiles, fund them from cash, card and wallet pools, then log
            spends on the go. Trip data stays out of home-screen analytics.
          </p>
        </div>
        <Button onClick={() => setSetupOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Trip
        </Button>
      </header>

      {activeTrips.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Plane className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-display text-lg font-semibold">No active trips</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Spin up a sandbox to keep vacation spending out of your daily metrics.
          </p>
          <Button onClick={() => setSetupOpen(true)} className="mt-4 gap-2">
            <Plus className="w-4 h-4" /> Start a Trip
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeTrips.map((t) => (
            <TripCard
              key={t.id}
              trip={t}
              onOpen={() => setActiveId(t.id)}
              onConclude={() => setArchiveTarget(t.id)}
              onDelete={() => {
                if (confirm(`Delete "${t.name}"? This cannot be undone.`)) remove(t.id);
              }}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Archive className="w-4 h-4" /> Archive · {archived.length}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {archived.map((t) => {
              const tot = tripTotals(t);
              const Kind = KIND_META[t.kind].icon;
              return (
                <div
                  key={t.id}
                  className="glass-card p-4 opacity-90 hover:opacity-100 transition-opacity"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Kind className={cn("w-4 h-4", KIND_META[t.kind].tint)} />
                      <span className="text-sm font-semibold truncate">{t.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      Archived
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Spent ₹{formatINR(tot.spent)} of ₹{formatINR(tot.allocated)}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => {
                        if (confirm(`Delete archived trip "${t.name}"?`)) remove(t.id);
                      }}
                      className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <NewTripDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onCreate={(t) => {
          upsert(t);
          setActiveId(t.id);
          toast.success(`Trip "${t.name}" created`);
        }}
      />

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-primary" /> Conclude Trip & Merge Archive?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The trip will be closed and moved to the archive with all stats preserved. It will
              remain isolated from your home-screen daily expense graphs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveTarget) {
                  archive(archiveTarget);
                  toast.success("Trip archived");
                  setActiveId(null);
                  setArchiveTarget(null);
                }
              }}
            >
              Conclude & Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================================================
   Trip Card on the hub
   ============================================================ */
function TripCard({
  trip,
  onOpen,
  onConclude,
  onDelete,
}: {
  trip: Trip;
  onOpen: () => void;
  onConclude: () => void;
  onDelete: () => void;
}) {
  const tot = tripTotals(trip);
  const pct = tot.allocated > 0 ? Math.min(100, (tot.spent / tot.allocated) * 100) : 0;
  const Kind = KIND_META[trip.kind].icon;
  return (
    <div className="glass-card p-5 space-y-4 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Kind className={cn("w-4 h-4", KIND_META[trip.kind].tint)} />
          </div>
          <div className="min-w-0">
            <div className="font-display font-semibold truncate">{trip.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {KIND_META[trip.kind].label} · {trip.days} days
            </div>
          </div>
        </div>
        <Badge className="bg-primary/15 text-primary border border-primary/30 text-[10px]">
          Active
        </Badge>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">Spent ₹{formatINR(tot.spent)}</span>
          <span className="font-medium">Left ₹{formatINR(tot.remaining)}</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onOpen}>
          Open
        </Button>
        <Button size="sm" variant="outline" onClick={onConclude} className="gap-1">
          <Flag className="w-3.5 h-3.5" /> Conclude
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete trip">
          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
   New Trip dialog — Pre-Trip Liquidity Funding Board
   ============================================================ */
function NewTripDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (t: Trip) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TripKind>("solo");
  const [days, setDays] = useState(5);
  const [cash, setCash] = useState(0);
  const [card, setCard] = useState(0);
  const [wallet, setWallet] = useState(0);
  const [companions, setCompanions] = useState("");

  const total = (cash || 0) + (card || 0) + (wallet || 0);

  const reset = () => {
    setName("");
    setKind("solo");
    setDays(5);
    setCash(0);
    setCard(0);
    setWallet(0);
    setCompanions("");
  };

  const submit = () => {
    if (!name.trim()) {
      toast.error("Give your trip a name");
      return;
    }
    if (total <= 0) {
      toast.error("Allocate at least one funding source");
      return;
    }
    const trip: Trip = {
      id: `trip_${Date.now()}`,
      name: name.trim(),
      kind,
      startDate: new Date().toISOString(),
      days: Math.max(1, days || 1),
      companions:
        kind === "solo"
          ? []
          : companions
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 6),
      allocation: { cash: cash || 0, card: card || 0, wallet: wallet || 0 },
      expenses: [],
      status: "active",
      createdAt: new Date().toISOString(),
    };
    onCreate(trip);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-primary" /> Pre-Trip Liquidity Funding Board
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Trip name</Label>
              <Input
                placeholder="e.g. High-Spend Solo Trip to Himachal"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trip days</Label>
              <Input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Trip type</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(KIND_META) as TripKind[]).map((k) => {
                const M = KIND_META[k];
                const Icon = M.icon;
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "h-16 rounded-lg border flex flex-col items-center justify-center gap-1 text-xs font-medium transition-all",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 hover:bg-accent/40",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {M.label}
                  </button>
                );
              })}
            </div>
          </div>

          {kind !== "solo" && (
            <div className="space-y-1.5">
              <Label>Companions (comma separated)</Label>
              <Input
                placeholder="Riya, Aman, Neha"
                value={companions}
                onChange={(e) => setCompanions(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Starting Allocations
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <SourceInput
                source="cash"
                value={cash}
                onChange={setCash}
                hint="Physical currency"
              />
              <SourceInput
                source="card"
                value={card}
                onChange={setCard}
                hint="Card limit / balance"
              />
              <SourceInput
                source="wallet"
                value={wallet}
                onChange={setWallet}
                hint="UPI / Wallet"
              />
            </div>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Trip Allocation Capital</span>
            <span className="font-display text-xl font-bold text-primary">
              ₹{formatINR(total)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Start Trip</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceInput({
  source,
  value,
  onChange,
  hint,
}: {
  source: PaymentSource;
  value: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  const M = SOURCE_META[source];
  const Icon = M.icon;
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Icon className="w-3.5 h-3.5 text-primary" />
        {M.emoji} {M.label}
      </div>
      <Input
        type="number"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder="0"
      />
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

/* ============================================================
   Workspace inside an active trip
   ============================================================ */
function TripWorkspace({
  trip,
  onBack,
  onAddExpense,
  onRemoveExpense,
  onConclude,
  onUpdateTrip,
}: {
  trip: Trip;
  onBack: () => void;
  onAddExpense: (e: import("@/lib/tripsStore").TripExpense) => void;
  onRemoveExpense: (id: string) => void;
  onConclude: () => void;
  onUpdateTrip: (t: Trip) => void;
}) {
  const tot = tripTotals(trip);
  const Kind = KIND_META[trip.kind].icon;

  // Logging form state
  const [source, setSource] = useState<PaymentSource>("cash");
  const [amount, setAmount] = useState<number | "">("");
  const [category, setCategory] = useState("Food");
  const [note, setNote] = useState("");
  const [splitWith, setSplitWith] = useState<string[]>([]);

  const dayUsed = Math.max(
    1,
    Math.ceil(
      (Date.now() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  const daysLeft = Math.max(1, trip.days - dayUsed + 1);
  const burnAllowed = tot.remaining / daysLeft;
  const todaySpent = trip.expenses
    .filter((e) => new Date(e.at).toDateString() === new Date().toDateString())
    .reduce((s, e) => s + e.amount, 0);
  const burnPct = burnAllowed > 0 ? Math.min(150, (todaySpent / burnAllowed) * 100) : 0;

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter an amount");
      return;
    }
    if (tot.remainingBySource[source] - amt < 0) {
      toast.warning(
        `Heads up — ${SOURCE_META[source].label} pool will go negative after this entry.`,
      );
    }
    onAddExpense({
      id: `exp_${Date.now()}`,
      amount: amt,
      source,
      category,
      note: note.trim() || undefined,
      at: new Date().toISOString(),
      splitWith: trip.kind === "solo" ? undefined : splitWith,
    });
    setAmount("");
    setNote("");
    setSplitWith([]);
    toast.success(`₹${formatINR(amt)} logged from ${SOURCE_META[source].label}`);
  };

  const toggleSplit = (name: string) => {
    setSplitWith((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display flex items-center gap-1">
              <Kind className={cn("w-3.5 h-3.5", KIND_META[trip.kind].tint)} />
              {KIND_META[trip.kind].label} · Sandbox
            </span>
            <h1 className="font-display text-2xl font-bold text-foreground mt-1">
              {trip.name}
            </h1>
          </div>
        </div>
        <Button onClick={onConclude} className="gap-2">
          <Flag className="w-4 h-4" /> 🏁 Conclude Trip & Merge Archive
        </Button>
      </div>

      {/* Fuel gauge */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Trip Fuel Gauge
            </div>
            <div className="font-display text-xl mt-1">
              Spent <span className="text-foreground">₹{formatINR(tot.spent)}</span>{" "}
              <span className="text-muted-foreground">·</span> Remaining{" "}
              <span className="text-primary font-bold">₹{formatINR(tot.remaining)}</span>
            </div>
          </div>
          <Badge variant="secondary" className="text-[11px]">
            Allocated ₹{formatINR(tot.allocated)}
          </Badge>
        </div>
        <Progress
          value={tot.allocated > 0 ? (tot.spent / tot.allocated) * 100 : 0}
          className="h-2.5"
        />
        <div className="grid sm:grid-cols-3 gap-2 pt-1">
          {(Object.keys(SOURCE_META) as PaymentSource[]).map((s) => {
            const M = SOURCE_META[s];
            const Icon = M.icon;
            const remain = tot.remainingBySource[s];
            const low = remain < trip.allocation[s] * 0.2;
            return (
              <div
                key={s}
                className={cn(
                  "rounded-lg border p-3 flex items-center justify-between",
                  low ? "border-warning/40 bg-warning/5" : "border-border/40 bg-card/40",
                )}
              >
                <div className="flex items-center gap-2 text-xs">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                  <span className="font-medium">{M.label}</span>
                </div>
                <div className="text-sm font-display font-semibold">
                  ₹{formatINR(remain)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Solo burn-rate */}
      {trip.kind === "solo" && (
        <div className="glass-card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="w-4 h-4 text-primary" /> Daily Burn-Rate Velocity Gauger
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {daysLeft} day{daysLeft === 1 ? "" : "s"} left
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Allowed per day ₹{formatINR(burnAllowed)} · Spent today ₹{formatINR(todaySpent)}
          </div>
          <Progress
            value={Math.min(100, burnPct)}
            className={cn("h-2", burnPct > 100 && "[&>div]:bg-destructive")}
          />
          {burnPct > 100 && (
            <div className="text-[11px] text-destructive">
              ⚠️ Over today's pace by ₹{formatINR(todaySpent - burnAllowed)}
            </div>
          )}
        </div>
      )}

      {/* High-density logging workspace */}
      <div className="glass-card p-5 space-y-4">
        <div className="text-sm font-semibold">Log a Trip Expense</div>

        {/* Payment source selector */}
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SOURCE_META) as PaymentSource[]).map((s) => {
            const M = SOURCE_META[s];
            const Icon = M.icon;
            const active = source === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  "h-14 rounded-xl border-2 flex items-center justify-center gap-2 font-semibold text-sm transition-all",
                  active
                    ? "border-primary bg-primary/15 text-primary shadow-sm"
                    : "border-border/50 hover:bg-accent/40",
                )}
              >
                <span>{M.emoji}</span>
                <Icon className="w-4 h-4" />
                {M.label}
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-[1fr_180px] gap-3">
          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="0"
              className="h-12 text-lg font-display"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Note (optional)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Dinner at the cliff cafe"
          />
        </div>

        {/* Friends/Family split */}
        {trip.kind !== "solo" && trip.companions.length > 0 && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Share with
            </Label>
            <div className="flex flex-wrap gap-2">
              {trip.companions.map((c) => {
                const active = splitWith.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleSplit(c)}
                    className={cn(
                      "px-3 h-8 rounded-full text-xs font-medium border transition-all",
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/50 hover:bg-accent/40",
                    )}
                  >
                    {active ? "✓ " : ""}
                    {c}
                  </button>
                );
              })}
            </div>
            {splitWith.length > 0 && Number(amount) > 0 && (
              <div className="text-[11px] text-muted-foreground">
                Your share ≈ ₹
                {formatINR(Number(amount) / (splitWith.length + 1))} ·{" "}
                {splitWith.join(", ")} owe you ₹
                {formatINR(
                  (Number(amount) / (splitWith.length + 1)) * splitWith.length,
                )}
              </div>
            )}
          </div>
        )}

        <Button onClick={submit} className="w-full h-11 gap-2">
          <Plus className="w-4 h-4" /> Log Expense
        </Button>
      </div>

      {/* Ledger */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Trip Ledger</div>
          <Badge variant="secondary" className="text-[10px]">
            {trip.expenses.length} entries · Isolated
          </Badge>
        </div>
        {trip.expenses.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No expenses logged yet.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {trip.expenses.map((e) => {
              const M = SOURCE_META[e.source];
              const Icon = M.icon;
              return (
                <div
                  key={e.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {e.category}
                        {e.note ? ` · ${e.note}` : ""}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span>{M.emoji} {M.label}</span>
                        <span>·</span>
                        <span>{new Date(e.at).toLocaleString("en-IN")}</span>
                        {e.splitWith && e.splitWith.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3 h-3" /> {e.splitWith.join(", ")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-display font-semibold">
                      ₹{formatINR(e.amount)}
                    </div>
                    <button
                      onClick={() => onRemoveExpense(e.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground text-center">
        🔒 Isolation Guardrail · Trip data does not flow into home-screen daily metrics.
      </div>
    </div>
  );
}