import { useMemo, useState } from "react";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAccounts, bucketOf, type StoredAccount, type TripBucket } from "@/lib/accountsStore";
import { formatINR, type Trip, type TripKind } from "@/lib/tripsStore";
import { BUCKET_ORDER, CASH_ACCOUNT, KIND_META } from "./tripMeta";
import { BucketRow } from "./BucketRow";

/**
 * The "new trip" wizard: name, kind, companions and the opening allocation
 * across payment buckets. Split out of Trips.tsx in Stage 4.13 — at 215 lines
 * it was the single largest thing in that file and shares no state with the
 * page beyond its props.
 */

export default function NewTripDialog({
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
      id: crypto.randomUUID(),
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              <span className="text-xs text-muted-foreground">
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
