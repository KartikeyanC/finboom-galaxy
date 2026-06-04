import { useMemo, useState } from "react";
import {
  Plane,
  Plus,
  Wallet,
  Banknote,
  CreditCard,
  Smartphone,
  Landmark,
  Users,
  User,
  Home,
  Flag,
  Trash2,
  Gauge,
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  PieChart,
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
  type TripExpense,
} from "@/lib/tripsStore";
import {
  useAccounts,
  bucketOf,
  BUCKET_META,
  CASH_ACCOUNT_ID,
  type StoredAccount,
  type TripBucket,
} from "@/lib/accountsStore";

const KIND_META: Record<TripKind, { label: string; icon: typeof User; tint: string }> = {
  solo: { label: "Solo Trip", icon: User, tint: "text-chart-2" },
  friends: { label: "Friends Trip", icon: Users, tint: "text-chart-4" },
  family: { label: "Family Trip", icon: Home, tint: "text-chart-3" },
};

const CATEGORIES = ["Food", "Stay", "Travel", "Activity", "Shopping", "Other"];

const BUCKET_ORDER: TripBucket[] = ["bank", "credit", "wallet", "cash"];
const BUCKET_ICON: Record<TripBucket, typeof Wallet> = {
  bank: Landmark,
  credit: CreditCard,
  wallet: Smartphone,
  cash: Banknote,
};
const BUCKET_ROW_TITLE: Record<TripBucket, string> = {
  bank: "🏦 Bank Accounts / Debit Cards",
  credit: "💳 Credit Cards",
  wallet: "📱 Digital Wallets & UPI Channels",
  cash: "💵 Physical Cash on Hand",
};

/** Build the virtual cash account (the only one in the cash bucket). */
const CASH_ACCOUNT: StoredAccount = {
  id: CASH_ACCOUNT_ID,
  type: "cash",
  name: "Physical Cash",
  color: "copper",
  icon: "coins",
};

function bucketGradient(b: TripBucket): React.CSSProperties {
  const g = BUCKET_META[b].gradient;
  return { background: `linear-gradient(135deg, ${g.from}, ${g.to})` };
}

/** Used when displaying expenses from legacy trips whose accountId no longer exists. */
function fallbackAccount(id: string): StoredAccount {
  if (id === "_legacy_card")
    return { id, type: "credit", name: "Card (legacy)" };
  if (id === "_legacy_wallet")
    return { id, type: "wallet", name: "Wallet (legacy)" };
  if (id === CASH_ACCOUNT_ID) return CASH_ACCOUNT;
  return { id, type: "other", name: "Removed account" };
}

/* ============================================================
   Page root
   ============================================================ */
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
            Fund trips from your real accounts, credit lines and wallets. Spending stays out
            of home-screen analytics — every paise tracked against the exact account it left.
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
              The trip will be closed and moved to the archive with all stats preserved. It
              will remain isolated from your home-screen daily expense graphs.
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
   Trip card (hub)
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
   New Trip dialog — Multi-account Liquidity Funding Board
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
  const { accounts: realAccounts } = useAccounts();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<TripKind>("solo");
  const [days, setDays] = useState(5);
  const [companions, setCompanions] = useState("");
  /** accountId → amount */
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [openRows, setOpenRows] = useState<Record<TripBucket, boolean>>({
    bank: true,
    credit: false,
    wallet: false,
    cash: true,
  });

  // Group real accounts by bucket; cash bucket is always just the virtual cash account.
  const byBucket: Record<TripBucket, StoredAccount[]> = useMemo(() => {
    const map: Record<TripBucket, StoredAccount[]> = {
      bank: [],
      credit: [],
      wallet: [],
      cash: [CASH_ACCOUNT],
    };
    for (const a of realAccounts) {
      const b = bucketOf(a.type);
      if (b === "cash") continue; // virtual cash always represents cash bucket
      map[b].push(a);
    }
    return map;
  }, [realAccounts]);

  const total = Object.values(alloc).reduce((s, n) => s + (n || 0), 0);

  const reset = () => {
    setName("");
    setKind("solo");
    setDays(5);
    setCompanions("");
    setAlloc({});
  };

  const setAccountAmount = (id: string, v: number) =>
    setAlloc((prev) => {
      const next = { ...prev };
      if (!v || v <= 0) delete next[id];
      else next[id] = v;
      return next;
    });

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
      allocation: alloc,
      expenses: [],
      status: "active",
      createdAt: new Date().toISOString(),
    };
    onCreate(trip);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                placeholder="e.g. Himachal Solo Run"
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Account Allocation Matrix
              </div>
              <span className="text-[10px] text-muted-foreground">
                Tap a row · enter amount per account
              </span>
            </div>

            <div className="space-y-2">
              {BUCKET_ORDER.map((b) => (
                <BucketRow
                  key={b}
                  bucket={b}
                  open={openRows[b]}
                  onToggle={() =>
                    setOpenRows((prev) => ({ ...prev, [b]: !prev[b] }))
                  }
                  accounts={byBucket[b]}
                  alloc={alloc}
                  onChange={setAccountAmount}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Total Allocated Trip Capital Pool
            </span>
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

/* ============================================================
   Bucket row with expandable per-account inputs
   ============================================================ */
function BucketRow({
  bucket,
  open,
  onToggle,
  accounts,
  alloc,
  onChange,
}: {
  bucket: TripBucket;
  open: boolean;
  onToggle: () => void;
  accounts: StoredAccount[];
  alloc: Record<string, number>;
  onChange: (id: string, v: number) => void;
}) {
  const Icon = BUCKET_ICON[bucket];
  const rowTotal = accounts.reduce((s, a) => s + (alloc[a.id] || 0), 0);
  const active = rowTotal > 0;

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        active ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card/30",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white shrink-0"
            style={bucketGradient(bucket)}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">{BUCKET_ROW_TITLE[bucket]}</div>
            <div className="text-[11px] text-muted-foreground">
              {accounts.length} {accounts.length === 1 ? "account" : "accounts"} ·{" "}
              {rowTotal > 0 ? `₹${formatINR(rowTotal)} allocated` : "tap to fund"}
            </div>
          </div>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2">
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
              No {BUCKET_META[bucket].label.toLowerCase()} accounts yet. Add one from{" "}
              <span className="text-primary font-medium">Accounts & Wallets</span> to fund
              trips from this source.
            </div>
          ) : (
            accounts.map((a) => (
              <AccountAllocationInput
                key={a.id}
                account={a}
                bucket={bucket}
                value={alloc[a.id] || 0}
                onChange={(v) => onChange(a.id, v)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AccountAllocationInput({
  account,
  bucket,
  value,
  onChange,
}: {
  account: StoredAccount;
  bucket: TripBucket;
  value: number;
  onChange: (v: number) => void;
}) {
  const filled = value > 0;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card/60 p-2 pl-3 transition-all",
        filled ? "border-primary/40 ring-1 ring-primary/30" : "border-border/40",
      )}
    >
      <div
        className="h-8 w-8 rounded-md flex items-center justify-center text-white shrink-0"
        style={bucketGradient(bucket)}
      >
        <span className="text-[11px] font-semibold">
          {(account.name || "?").charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{account.name || "Account"}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {account.bank || BUCKET_META[bucket].label}
          {account.last4 ? ` · •••• ${account.last4}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">₹</span>
        <Input
          type="number"
          min={0}
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder="0"
          className="h-9 w-28 text-right font-display"
        />
      </div>
    </div>
  );
}

/* ============================================================
   Trip workspace
   ============================================================ */
function TripWorkspace({
  trip,
  onBack,
  onAddExpense,
  onRemoveExpense,
  onConclude,
}: {
  trip: Trip;
  onBack: () => void;
  onAddExpense: (e: TripExpense) => void;
  onRemoveExpense: (id: string) => void;
  onConclude: () => void;
  onUpdateTrip: (t: Trip) => void;
}) {
  const tot = tripTotals(trip);
  const Kind = KIND_META[trip.kind].icon;
  const { accounts: realAccounts } = useAccounts();

  // Resolve every accountId in trip.allocation to a StoredAccount (real or fallback).
  const fundedAccounts: StoredAccount[] = useMemo(() => {
    const ids = Object.keys(trip.allocation);
    return ids.map((id) => {
      if (id === CASH_ACCOUNT_ID) return CASH_ACCOUNT;
      const real = realAccounts.find((a) => a.id === id);
      return real || fallbackAccount(id);
    });
  }, [trip.allocation, realAccounts]);

  // Logging form state
  const firstId = fundedAccounts[0]?.id ?? CASH_ACCOUNT_ID;
  const [accountId, setAccountId] = useState<string>(firstId);
  const [amount, setAmount] = useState<number | "">("");
  const [category, setCategory] = useState("Food");
  const [note, setNote] = useState("");
  const [splitWith, setSplitWith] = useState<string[]>([]);

  // Solo burn-rate
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

  // Bucket-level spend breakdown
  const bucketSpend = useMemo(() => {
    const map: Record<TripBucket, number> = { bank: 0, credit: 0, wallet: 0, cash: 0 };
    for (const e of trip.expenses) {
      const acc =
        e.accountId === CASH_ACCOUNT_ID
          ? CASH_ACCOUNT
          : realAccounts.find((a) => a.id === e.accountId) || fallbackAccount(e.accountId);
      map[bucketOf(acc.type)] += e.amount;
    }
    return map;
  }, [trip.expenses, realAccounts]);

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter an amount");
      return;
    }
    if (!accountId) {
      toast.error("Choose a payment account");
      return;
    }
    const rem = tot.remainingByAccount[accountId] ?? 0;
    if (rem - amt < 0) {
      const accName =
        fundedAccounts.find((a) => a.id === accountId)?.name || "this account";
      toast.warning(`Heads up — ${accName} pool will go negative after this entry.`);
    }
    onAddExpense({
      id: `exp_${Date.now()}`,
      amount: amt,
      accountId,
      category,
      note: note.trim() || undefined,
      at: new Date().toISOString(),
      splitWith: trip.kind === "solo" ? undefined : splitWith,
    });
    setAmount("");
    setNote("");
    setSplitWith([]);
    const accName =
      fundedAccounts.find((a) => a.id === accountId)?.name || "account";
    toast.success(`₹${formatINR(amt)} logged from ${accName}`);
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
      </div>

      {/* Per-account balance grid */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Real-Time Account Balance Tracker</div>
          <Badge variant="secondary" className="text-[10px]">
            {fundedAccounts.length} funded
          </Badge>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fundedAccounts.map((acc) => {
            const b = bucketOf(acc.type);
            const Icon = BUCKET_ICON[b];
            const allocated = trip.allocation[acc.id] || 0;
            const spent = tot.spentByAccount[acc.id] || 0;
            const remaining = allocated - spent;
            const pct = allocated > 0 ? Math.min(100, (spent / allocated) * 100) : 0;
            const low = remaining < allocated * 0.2;
            return (
              <div
                key={acc.id}
                className="relative overflow-hidden rounded-xl p-4 text-white shadow-md ring-1 ring-white/10"
                style={bucketGradient(b)}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-widest opacity-80">
                        {BUCKET_META[b].label}
                      </div>
                      <div className="text-sm font-semibold truncate max-w-[140px]">
                        {acc.name}
                      </div>
                    </div>
                  </div>
                  {low && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 ring-1 ring-white/25">
                      Low
                    </span>
                  )}
                </div>
                <div className="relative mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest opacity-70">
                      Remaining
                    </div>
                    <div className="font-display text-xl font-bold">
                      ₹{formatINR(remaining)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest opacity-70">
                      Spent
                    </div>
                    <div className="text-sm font-semibold opacity-90">
                      ₹{formatINR(spent)}
                    </div>
                  </div>
                </div>
                <div className="relative mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden">
                  <div className="h-full bg-white/80" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bucket breakdown bar chart */}
      {tot.spent > 0 && (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PieChart className="w-4 h-4 text-primary" /> Spend Breakdown by Payment Type
          </div>
          <div className="space-y-2">
            {BUCKET_ORDER.map((b) => {
              const amt = bucketSpend[b];
              if (!amt) return null;
              const pct = (amt / tot.spent) * 100;
              return (
                <div key={b} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {BUCKET_META[b].emoji} {BUCKET_META[b].label}
                    </span>
                    <span className="text-muted-foreground">
                      ₹{formatINR(amt)} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${BUCKET_META[b].gradient.from}, ${BUCKET_META[b].gradient.to})`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Logging workspace */}
      <div className="glass-card p-5 space-y-4">
        <div className="text-sm font-semibold">Log a Trip Expense</div>

        <div className="space-y-1.5">
          <Label>Amount (₹)</Label>
          <Input
            type="number"
            min={0}
            value={amount}
            onChange={(e) =>
              setAmount(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder="0"
            className="h-14 text-2xl font-display"
          />
        </div>

        {/* Account selector — only funded sources */}
        <div className="space-y-1.5">
          <Label>Pay from</Label>
          {fundedAccounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
              No funded accounts on this trip.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {fundedAccounts.map((acc) => {
                const b = bucketOf(acc.type);
                const Icon = BUCKET_ICON[b];
                const active = accountId === acc.id;
                const remain = tot.remainingByAccount[acc.id] ?? 0;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setAccountId(acc.id)}
                    className={cn(
                      "relative overflow-hidden rounded-xl p-3 text-left ring-1 transition-all min-h-[72px]",
                      active
                        ? "ring-2 ring-primary scale-[1.02] shadow-md"
                        : "ring-white/10 opacity-80 hover:opacity-100",
                    )}
                    style={bucketGradient(b)}
                  >
                    <div className="text-white">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        <span className="text-[10px] uppercase tracking-widest opacity-80">
                          {BUCKET_META[b].label}
                        </span>
                      </div>
                      <div className="text-sm font-semibold truncate mt-0.5">
                        {acc.name}
                      </div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        Left ₹{formatINR(remain)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dinner at the cliff cafe"
              className="h-11"
            />
          </div>
        </div>

        {/* Friends/Family split */}
        {trip.kind !== "solo" && trip.companions.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-border/40 bg-card/40 p-3">
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
                Your share ≈ ₹{formatINR(Number(amount) / (splitWith.length + 1))} ·{" "}
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
              const acc =
                e.accountId === CASH_ACCOUNT_ID
                  ? CASH_ACCOUNT
                  : realAccounts.find((a) => a.id === e.accountId) ||
                    fallbackAccount(e.accountId);
              const b = bucketOf(acc.type);
              const Icon = BUCKET_ICON[b];
              return (
                <div
                  key={e.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                      style={bucketGradient(b)}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {e.category}
                        {e.note ? ` · ${e.note}` : ""}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>
                          {BUCKET_META[b].emoji} {acc.name}
                        </span>
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