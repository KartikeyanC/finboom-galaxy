import { useMemo, useState } from "react";
import {
  Plane,
  Plus,
  Flag,
  Trash2,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/lib/tripsStore";

import { KIND_META } from "./trips/tripMeta";
import NewTripDialog from "./trips/NewTripDialog";
import TripCard from "./trips/TripCard";
import TripWorkspace from "./trips/TripWorkspace";

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

  // BUG-068 — was max-w-[1200px], out of step with every other
  // record-list page's max-w-[1400px].
  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
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
                    <Badge variant="secondary" className="text-xs">
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
                      className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
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
        onCreate={async (t) => {
          await upsert(t);
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
