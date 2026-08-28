import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FolderKanban, Plus, IndianRupee, Layers, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MetricCard from "@/components/dashboard/MetricCard";
import { useTheme } from "@/contexts/ThemeContext";
import { formatMoney } from "@/lib/finance";
import { useTrackerSpend } from "@/hooks/useTrackerSpend";
import {
  useCreateTracker,
  useMarkTrackerReviewed,
  useSetTrackerStatus,
  useSoftDeleteTracker,
  useUpdateTracker,
} from "@/hooks/useTrackers";
import { useAssignToTracker } from "@/hooks/useTrackerTransactions";
import TrackerCard from "@/components/trackers/TrackerCard";
import TrackerDialog from "@/components/trackers/TrackerDialog";
import TrackerWorkspace from "@/components/trackers/TrackerWorkspace";
import HistoricalReviewDialog from "@/components/trackers/HistoricalReviewDialog";
import { isHistoricalTracker, type Tracker, type TrackerStatus, type TrackerWithSpend } from "@/lib/trackers";

/**
 * Trackers — the index, and the detail view it switches to.
 *
 * Master/detail follows the Trips precedent (Trips.tsx:40-49): component
 * state, not a nested route. The one addition is that `activeId` is mirrored
 * into a `?id=` search param, so the detail view is linkable and the browser
 * Back button returns to the list — without making this the app's first
 * `:id` route inside /app/*, which is a thing to introduce on its own and not
 * alongside a new feature.
 */

const EMPTY_COPY: Record<TrackerStatus, { title: string; body: string }> = {
  active: {
    title: "No trackers yet",
    body: "A tracker groups transactions under a project or life event — a house build, a wedding, a trip — so you can see what the whole thing has cost. Your money stays exactly where it is; a tracker only labels what you have already recorded.",
  },
  completed: {
    title: "Nothing completed yet",
    body: "When a project finishes, mark its tracker complete. It moves here with its final total intact, out of the way of the things you are still spending on.",
  },
  archived: {
    title: "Nothing archived",
    body: "Archiving tidies a tracker out of your active list without losing anything. The transactions stay exactly where they are, and you can reopen it at any time.",
  },
};

export default function Trackers() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [params, setParams] = useSearchParams();
  const activeId = params.get("id");

  const [tab, setTab] = useState<TrackerStatus>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tracker | null>(null);
  /** The tracker whose historical review is open, if any. */
  const [reviewing, setReviewing] = useState<Tracker | null>(null);

  const { data: trackers, isLoading, isError, refetch } = useTrackerSpend();
  const create = useCreateTracker();
  const update = useUpdateTracker();
  const setStatus = useSetTrackerStatus();
  const softDelete = useSoftDeleteTracker();
  const markReviewed = useMarkTrackerReviewed();
  const assign = useAssignToTracker();

  /**
   * Offer the review — never perform it.
   *
   * A tracker whose project predates its creation probably has existing
   * transactions, so we ASK. Nothing is assigned until the user ticks rows
   * and confirms.
   */
  const offerReviewIfHistorical = (t: Tracker) => {
    if (isHistoricalTracker(t) && !t.reviewed_at) setReviewing(t);
  };

  const finishReview = (ids: string[]) => {
    if (!reviewing) return;
    const id = reviewing.id;
    assign.mutate(
      { trackerId: id, ids },
      {
        onSuccess: () => {
          markReviewed.mutate(id);
          setReviewing(null);
        },
      },
    );
  };

  /**
   * Skipping also stamps `reviewed_at`: the user has answered the question,
   * and asking again every visit is nagging. The button stays in the
   * workspace, so this closes the prompt, not the door.
   */
  const skipReview = () => {
    if (reviewing) markReviewed.mutate(reviewing.id);
    setReviewing(null);
  };

  const byStatus = useMemo(() => {
    const groups: Record<TrackerStatus, TrackerWithSpend[]> = {
      active: [],
      completed: [],
      archived: [],
    };
    for (const t of trackers) groups[t.status]?.push(t);
    return groups;
  }, [trackers]);

  const totals = useMemo(() => {
    const live = byStatus.active;
    return {
      count: live.length,
      spent: live.reduce((s, t) => s + t.derivedSpent, 0),
      over: live.filter((t) => t.remaining !== null && t.remaining < 0).length,
    };
  }, [byStatus]);

  const active = trackers.find((t) => t.id === activeId) ?? null;

  // Defined once and rendered in both return paths, so the list and the
  // workspace cannot drift into offering different review behaviour.
  const reviewDialog = reviewing ? (
    <HistoricalReviewDialog
      open
      onOpenChange={(o) => {
        if (!o) setReviewing(null);
      }}
      tracker={reviewing}
      isLight={isLight}
      assigning={assign.isPending}
      onAssign={finishReview}
      onSkip={skipReview}
    />
  ) : null;

  const openTracker = (id: string) => setParams({ id }, { replace: false });
  const backToList = () => setParams({}, { replace: false });

  // A link to a tracker that has since been deleted, or that belongs to a
  // workspace the user has switched away from, falls back to the list with an
  // explanation — never a blank screen.
  if (activeId && !active && !isLoading && !isError) {
    toast.message("That tracker is no longer available.");
    backToList();
  }

  if (active) {
    return (
      <>
        <TrackerWorkspace
          tracker={active}
          isLight={isLight}
          onBack={backToList}
          onEdit={() => {
            setEditing(active);
            setDialogOpen(true);
          }}
          onSetStatus={(status) =>
            setStatus.mutate({ id: active.id, status, spentSoFar: active.derivedSpent })
          }
          onReview={() => setReviewing(active)}
          onDelete={() => {
            softDelete.mutate(active.id);
            backToList();
          }}
        />
        <TrackerDialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setEditing(null);
          }}
          initial={editing}
          saving={update.isPending}
          onSubmit={(input) => {
            if (!editing) return;
            update.mutate(
              { id: editing.id, patch: input },
              {
                onSuccess: () => {
                  setDialogOpen(false);
                  setEditing(null);
                },
              },
            );
          }}
        />
        {reviewDialog}
      </>
    );
  }

  const renderGrid = (list: TrackerWithSpend[], status: TrackerStatus) => {
    if (isLoading) {
      return (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <div className="glass-card p-10 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-display text-lg font-semibold">Your trackers could not be loaded</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Something went wrong reaching your workspace. Your data is safe — this is only the
            list failing to load.
          </p>
          <Button onClick={() => refetch()} className="mt-4">
            Try again
          </Button>
        </div>
      );
    }

    if (list.length === 0) {
      const copy = EMPTY_COPY[status];
      return (
        <div className="glass-card p-10 text-center">
          <FolderKanban className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-display text-lg font-semibold">{copy.title}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg mx-auto">{copy.body}</p>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="mt-4 gap-2"
          >
            <Plus className="w-4 h-4" /> New Tracker
          </Button>
        </div>
      );
    }

    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((t) => (
          <TrackerCard key={t.id} tracker={t} isLight={isLight} onOpen={openTracker} />
        ))}
      </div>
    );
  };

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
            Context · Not an Account
          </span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-1">Trackers</h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Group transactions under a project or life event. Your money stays in your accounts —
            a tracker only organises what you have already recorded.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="w-4 h-4" /> New Tracker
        </Button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Active trackers"
          value={String(totals.count)}
          icon={<Layers className="w-4 h-4" />}
        />
        <MetricCard
          label="Tracked spend"
          value={formatMoney(totals.spent)}
          icon={<IndianRupee className="w-4 h-4" />}
        />
        <MetricCard
          label="Over budget"
          value={String(totals.over)}
          changeType={totals.over > 0 ? "negative" : "neutral"}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <MetricCard
          label="Completed"
          value={String(byStatus.completed.length)}
          icon={<FolderKanban className="w-4 h-4" />}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TrackerStatus)}>
        <TabsList className="rounded-full bg-secondary/60 p-1 h-auto flex-wrap">
          <TabsTrigger value="active" className="rounded-full px-4 py-1.5">
            Active
          </TabsTrigger>
          <TabsTrigger value="completed" className="rounded-full px-4 py-1.5">
            Completed
          </TabsTrigger>
          <TabsTrigger value="archived" className="rounded-full px-4 py-1.5">
            Archived
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {renderGrid(byStatus.active, "active")}
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          {renderGrid(byStatus.completed, "completed")}
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          {renderGrid(byStatus.archived, "archived")}
        </TabsContent>
      </Tabs>

      <TrackerDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        initial={editing}
        saving={create.isPending || update.isPending}
        onSubmit={(input) => {
          if (editing) {
            update.mutate(
              { id: editing.id, patch: input },
              {
                onSuccess: () => {
                  setDialogOpen(false);
                  setEditing(null);
                },
              },
            );
          } else {
            create.mutate(input, {
              onSuccess: (t) => {
                setDialogOpen(false);
                if (t) offerReviewIfHistorical(t);
              },
            });
          }
        }}
      />
      {reviewDialog}
    </div>
  );
}
