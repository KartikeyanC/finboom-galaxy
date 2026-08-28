import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Archive,
  Pencil,
  Trash2,
  RotateCcw,
  History,
  X,
  AlertTriangle,
  Wallet,
  Receipt,
  IndianRupee,
  PiggyBank,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  CategoryChart,
  ChartViewToggle,
  useChartView,
  type ChartSlice,
} from "@/components/ui/category-chart";
import MetricCard from "@/components/dashboard/MetricCard";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { percentOf } from "@/lib/progress";
import { breakdownSlices, isHistoricalTracker, type TrackerWithSpend } from "@/lib/trackers";
import { categoryBadgeClass } from "@/lib/categories";
import { useAccounts } from "@/lib/accountsStore";
import { useTrackerTransactions, useUnassignFromTracker } from "@/hooks/useTrackerTransactions";
import { useTenantSetting } from "@/hooks/useTenantSetting";
import TrackerFilterBar from "./TrackerFilterBar";
import TrackerExportMenu from "./TrackerExportMenu";
import {
  EMPTY_TRACKER_FILTER,
  applyTrackerFilters,
  isTrackerFilterActive,
  normaliseViews,
  type TrackerFilter,
} from "@/lib/trackerFilters";
import { trackerTypeMeta } from "./trackerMeta";
import TrackerBadge from "./TrackerBadge";

/**
 * One tracker, opened.
 *
 * Shares the page shell with the list at max-w-[1400px] — BUG-068 exists
 * because Trips used 1400 on its list and 1200 in TripWorkspace, and the
 * width visibly jumps when you open one.
 *
 * Every figure here is derived from the rows this component already fetched;
 * nothing is stored and nothing is recomputed by a second code path.
 */
export default function TrackerWorkspace({
  tracker,
  isLight,
  onBack,
  onEdit,
  onSetStatus,
  onDelete,
  onReview,
}: {
  tracker: TrackerWithSpend;
  isLight: boolean;
  onBack: () => void;
  onEdit: () => void;
  onSetStatus: (status: "active" | "completed" | "archived") => void;
  onDelete: () => void;
  onReview: () => void;
}) {
  const meta = trackerTypeMeta(tracker.type);
  const Icon = meta.icon;
  const [view, setView] = useChartView("list");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: rows = [], isLoading, isError } = useTrackerTransactions(tracker.id);
  const unassign = useUnassignFromTracker();
  const { accounts } = useAccounts();

  const [filter, setFilter] = useState<TrackerFilter>(EMPTY_TRACKER_FILTER);
  const { value: storedViews, setValue: setStoredViews } = useTenantSetting("tracker_views");
  const views = useMemo(() => normaliseViews(storedViews), [storedViews]);

  // Everything below reads `visible`, not `rows`: the totals, the breakdowns
  // and the list must agree with each other, or a filtered view shows a
  // category chart that does not add up to the number above it.
  const visible = useMemo(
    () => applyTrackerFilters(rows, filter, tracker),
    [rows, filter, tracker],
  );
  const filtering = isTrackerFilterActive(filter);

  /**
   * Spend for what is currently VISIBLE.
   *
   * When a filter is on, showing the whole-tracker total above a list of
   * three rows invites the reader to think those three cost that much. The
   * label changes too, so the number is never ambiguous about what it counts.
   */
  const visibleSpent = useMemo(
    () => breakdownSlices(visible, () => "all").reduce((sum, x) => sum + x.value, 0),
    [visible],
  );

  const accountName = useMemo(() => {
    const m = new Map(accounts.map((a) => [a.id, a.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown account") : "Unassigned");
  }, [accounts]);

  const categorySlices: ChartSlice[] = useMemo(
    () => breakdownSlices(visible, (i) => visible[i].category),
    [visible],
  );

  const accountSlices: ChartSlice[] = useMemo(
    () => breakdownSlices(visible, (i) => accountName(visible[i].account_id)),
    [visible, accountName],
  );

  /** The options the filter bar offers, drawn from what this tracker holds. */
  const filterOptions = useMemo(() => {
    const cats = [...new Set(rows.map((r) => r.category))].sort();
    const acctIds = [...new Set(rows.map((r) => r.account_id).filter((id): id is string => !!id))];
    const modes = [...new Set(rows.map((r) => r.payment_mode).filter((m): m is string => !!m))].sort();
    return {
      categories: cats,
      accounts: acctIds.map((id) => ({ id, name: accountName(id) })),
      paymentModes: modes,
    };
  }, [rows, accountName]);

  const saveView = (name: string) => {
    setStoredViews([
      ...views,
      { id: crypto.randomUUID(), name, filter },
    ]);
  };

  const deleteView = (id: string) => setStoredViews(views.filter((v) => v.id !== id));

  const hasBudget = tracker.remaining !== null;
  const pct = hasBudget ? percentOf(tracker.derivedSpent, Number(tracker.budget)) : 0;
  const over = hasBudget && (tracker.remaining ?? 0) < 0;

  const fmtDate = (d: string) =>
    new Date(`${d}T00:00:00.000Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Print/PDF statement header. Hidden on screen, and the only place the
          generated-on date appears — a printed statement with no date is not
          a record of anything. */}
      <div className="hidden print:block mb-4">
        <div className="text-lg font-bold">FinRoot</div>
        <h1 className="text-2xl font-bold mt-1">{tracker.name}</h1>
        <div className="text-sm mt-1">
          {tracker.type} · {fmtDate(tracker.start_date)} →{" "}
          {tracker.end_date ? fmtDate(tracker.end_date) : "ongoing"}
        </div>
        <div className="text-sm">
          Generated {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          {filtering ? " · filtered view" : ""}
        </div>
        <div className="text-sm mt-2">
          Total spent {formatMoney(filtering ? visibleSpent : tracker.derivedSpent)}
          {hasBudget ? ` · Budget ${formatMoney(Number(tracker.budget))}` : " · No budget set"}
          {hasBudget
            ? over
              ? ` · ${formatMoney(Math.abs(tracker.remaining ?? 0))} over`
              : ` · ${formatMoney(tracker.remaining ?? 0)} remaining`
            : ""}
        </div>
      </div>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to all trackers" className="print:hidden">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
              {tracker.type}
            </span>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
                <Icon className="w-5 h-5 text-primary shrink-0" />
                {tracker.name}
              </h1>
              <TrackerBadge name={tracker.name} isLight={isLight} />
              {tracker.status !== "active" && (
                <span className="text-xs rounded-md border px-2 py-0.5 text-muted-foreground border-border">
                  {tracker.status === "completed" ? "Completed" : "Archived"}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {fmtDate(tracker.start_date)} → {tracker.end_date ? fmtDate(tracker.end_date) : "ongoing"}
            </p>
            {tracker.description && (
              <p className="text-sm text-muted-foreground mt-2 max-w-xl">{tracker.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          {tracker.status === "active" ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onSetStatus("completed")}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Complete
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onSetStatus("active")}>
              <RotateCcw className="w-3.5 h-3.5" /> Reopen
            </Button>
          )}
          {tracker.status !== "archived" && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onSetStatus("archived")}>
              <Archive className="w-3.5 h-3.5" /> Archive
            </Button>
          )}
          <TrackerExportMenu
            tracker={tracker}
            rows={visible}
            accountName={accountName}
            filtered={filtering}
          />
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label={filtering ? "Spent (filtered)" : "Total spent"}
          value={formatMoney(filtering ? visibleSpent : tracker.derivedSpent)}
          icon={<IndianRupee className="w-4 h-4" />}
        />
        <MetricCard
          label="Budget"
          value={hasBudget ? formatMoney(Number(tracker.budget)) : "Not set"}
          icon={<PiggyBank className="w-4 h-4" />}
        />
        <MetricCard
          label={over ? "Over budget" : "Remaining"}
          value={hasBudget ? formatMoney(Math.abs(tracker.remaining ?? 0)) : "—"}
          changeType={over ? "negative" : "neutral"}
          icon={<Wallet className="w-4 h-4" />}
        />
        <MetricCard
          label="Transactions"
          value={String(visible.length)}
          icon={<Receipt className="w-4 h-4" />}
        />
      </div>

      {hasBudget && (
        <div className="glass-card p-5 space-y-2">
          <div className="flex items-center justify-between">
            {/* h2, not h3 — BUG-097: heading order inside cards. */}
            <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
              Budget progress
            </h2>
            <span
              className={cn(
                "text-sm font-medium inline-flex items-center gap-1",
                over ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {/* WCAG 1.4.1: red alone does not carry "over budget" for a
                  colour-blind reader, and does not survive a greyscale print
                  either. The icon and the word below both say it. */}
              {over && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
              {pct}%
            </span>
          </div>
          <Progress
            value={pct}
            aria-label={`Budget used: ${pct}% of ${formatMoney(Number(tracker.budget))}`}
            className={cn("h-2", over && "[&>div]:bg-destructive")}
          />
          <p className="text-xs text-muted-foreground">
            {formatMoney(tracker.derivedSpent)} of {formatMoney(Number(tracker.budget))}
            {over
              ? ` · ${formatMoney(Math.abs(tracker.remaining ?? 0))} over budget`
              : ` · ${formatMoney(tracker.remaining ?? 0)} left`}
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
              Where it went
            </h2>
            <ChartViewToggle view={view} onChange={setView} />
          </div>
          {categorySlices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No spending is tagged to this tracker yet, so there is nothing to break down.
            </p>
          ) : view === "list" ? (
            // CategoryChart renders donut/bar only; the list is the page's own,
            // the same split GoalManager.tsx:303 uses.
            <ul className="space-y-2">
              {categorySlices.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground truncate">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {formatMoney(c.value)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <CategoryChart
              data={categorySlices}
              view={view}
              centerLabel="Spent"
              emptyText="No spending tagged to this tracker yet."
            />
          )}
        </section>

        <section className="glass-card p-5 space-y-4">
          <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
            Accounts used
          </h2>
          {accountSlices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has been paid towards this tracker yet, so no account has been touched.
            </p>
          ) : (
            <ul className="space-y-2">
              {accountSlices.map((a) => (
                <li key={a.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground truncate">{a.name}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {formatMoney(a.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
            Transactions
          </h2>
          {/* Prominent while the question is unanswered, quieter afterwards —
              but never removed, because a user who skipped may change their
              mind and should not have to hunt for it. */}
          {isHistoricalTracker(tracker) && (
            <Button
              variant={tracker.reviewed_at ? "ghost" : "outline"}
              size="sm"
              className="gap-1.5 print:hidden"
              onClick={onReview}
            >
              <History className="w-3.5 h-3.5" />
              Review previous transactions
            </Button>
          )}
        </div>

        {rows.length > 0 && (
          <div className="print:hidden">
          <TrackerFilterBar
            filter={filter}
            onChange={setFilter}
            categories={filterOptions.categories}
            accounts={filterOptions.accounts}
            paymentModes={filterOptions.paymentModes}
            views={views}
            onSaveView={saveView}
            onDeleteView={deleteView}
            resultCount={visible.length}
            totalCount={rows.length}
          />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">
            Those transactions could not be loaded just now. Check your connection and try again.
          </p>
        ) : rows.length > 0 && visible.length === 0 ? (
          // Distinct from "nothing tagged yet": the data exists, the filter
          // hid it, and the way out is to change the filter — not to go and
          // record something.
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              No transactions match these filters. {rows.length} are tagged to this tracker.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setFilter(EMPTY_TRACKER_FILTER)}
            >
              Reset filters
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              No transactions are tagged to this tracker yet. Once you can tag them, everything you
              record for {tracker.name} will appear here — and stay in your normal expense list too.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {visible.map((t) => (
              <li key={t.id} className="py-2.5 flex items-center gap-3">
                <span className="text-xs font-mono text-foreground/65 shrink-0 tabular-nums w-20">
                  {new Date(t.occurred_at).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                {/* The CATEGORY badge is always shown, never replaced by the
                    tracker: inside a tracker you already know the tracker, and
                    the category is the information you came for. */}
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0",
                    categoryBadgeClass(t.type === "income" ? "income" : "expense", t.category, isLight),
                  )}
                >
                  {t.category}
                </span>
                <span className="text-sm text-foreground truncate min-w-0 flex-1">
                  {t.description || t.category}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                  {accountName(t.account_id)}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium tabular-nums shrink-0",
                    t.type === "income" ? "text-success" : "text-foreground",
                  )}
                >
                  {formatMoney(Number(t.amount), t.currency)}
                </span>
                {/* Removing the label, not the transaction. Deliberately a
                    quiet icon: it is a correction, not a primary action. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground print:hidden"
                  title="Remove from this tracker"
                  aria-label={`Remove ${t.description || t.category} from ${tracker.name}`}
                  onClick={() => unassign.mutate(t.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{tracker.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The tracker is removed from your list. Your transactions are not deleted and no
              balance changes — they simply stop being grouped under this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete tracker
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
