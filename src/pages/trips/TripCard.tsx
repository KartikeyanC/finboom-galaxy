import { Flag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { tripTotals, formatINR, type Trip } from "@/lib/tripsStore";

import { KIND_META } from "./tripMeta";

/** One active trip in the list — split out of Trips.tsx in Stage 4.13. */
export default function TripCard({
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
            <div className="text-xs text-muted-foreground">
              {KIND_META[trip.kind].label} · {trip.days} days
            </div>
          </div>
        </div>
        <Badge className="bg-primary/15 text-primary border border-primary/30 text-xs">
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
