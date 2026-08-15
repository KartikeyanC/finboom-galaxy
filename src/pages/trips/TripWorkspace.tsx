import { useMemo, useState } from "react";
import {
  ArrowLeft, Flag, Gauge, PieChart, Plus, Trash2, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  tripTotals,
  formatINR,
  type Trip,
  type TripExpense,
} from "@/lib/tripsStore";
import { CategoryChart, ChartViewToggle, useChartView, type ChartSlice } from "@/components/ui/category-chart";
import {
  useAccounts,
  bucketOf,
  BUCKET_META,
  CASH_ACCOUNT_ID,
  type StoredAccount,
  type TripBucket,
} from "@/lib/accountsStore";

import {
  BUCKET_ICON,
  BUCKET_ORDER,
  CASH_ACCOUNT,
  CATEGORIES,
  KIND_META,
  bucketGradient,
  fallbackAccount,
} from "./tripMeta";

/**
 * The open-trip workspace: funding board, expense entry and the spend
 * breakdown — split out of Trips.tsx in Stage 4.13.
 *
 * It is the whole second half of the page and shares nothing with the trip
 * list but the `Trip` it is handed and the four callbacks that write back.
 */
export default function TripWorkspace({
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
  const [ledgerView, setLedgerView] = useChartView();
  const tripSlices: ChartSlice[] = (() => {
    const m = new Map<string, number>();
    trip.expenses.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount));
    return Array.from(m, ([name, value]) => ({ name, value }));
  })();
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
          <Badge variant="secondary" className="text-xs">
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
          <Badge variant="secondary" className="text-xs">
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
                      <div className="text-[11px] uppercase tracking-widest opacity-80">
                        {BUCKET_META[b].label}
                      </div>
                      <div className="text-sm font-semibold truncate max-w-[140px]">
                        {acc.name}
                      </div>
                    </div>
                  </div>
                  {low && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/15 ring-1 ring-white/25">
                      Low
                    </span>
                  )}
                </div>
                <div className="relative mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-widest opacity-70">
                      Remaining
                    </div>
                    <div className="font-display text-xl font-bold">
                      ₹{formatINR(remaining)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-widest opacity-70">
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
            <Badge variant="secondary" className="text-xs">
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
            <div className="text-xs text-destructive">
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
          <MoneyInput
            value={amount}
            onValueChange={(n) => setAmount(n === undefined ? "" : n)}
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
                        <span className="text-[11px] uppercase tracking-widest opacity-80">
                          {BUCKET_META[b].label}
                        </span>
                      </div>
                      <div className="text-sm font-semibold truncate mt-0.5">
                        {acc.name}
                      </div>
                      <div className="text-xs opacity-80 mt-0.5">
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
              <div className="text-xs text-muted-foreground">
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
          <div className="flex items-center gap-2">
            {trip.expenses.length > 0 && <ChartViewToggle view={ledgerView} onChange={setLedgerView} />}
            <Badge variant="secondary" className="text-xs">
              {trip.expenses.length} entries · Isolated
            </Badge>
          </div>
        </div>
        {trip.expenses.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No expenses logged yet.
          </div>
        ) : ledgerView !== "list" ? (
          <CategoryChart data={tripSlices} view={ledgerView} centerLabel="Spent" emptyText="No trip expenses to chart." />
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
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
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

      <div className="text-xs text-muted-foreground text-center">
        🔒 Isolation Guardrail · Trip data does not flow into home-screen daily metrics.
      </div>
    </div>
  );
}
