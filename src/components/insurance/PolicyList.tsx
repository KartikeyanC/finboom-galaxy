import { useMemo } from "react";
import { AlertTriangle, Car, FileText, Heart, HeartPulse, Package, Paperclip, Pencil, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkDeleteBar, SelectAllBox, SelectBox } from "@/components/bulk/BulkSelect";
import { useBulkSelection } from "@/components/bulk/useBulkSelection";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import {
  CATEGORY_META,
  daysUntil,
  formatDueDate,
  policyUrgency,
  URGENT_DAYS,
  type InsuranceCategory,
  type InsurancePolicy,
} from "@/lib/insuranceStore";

/**
 * The policy cards, grouped by category, with bulk delete — split out of
 * pages/Insurance.tsx (which was already at the 30 kB limit, Stage 4.13).
 */

const CATEGORY_ICON: Record<InsuranceCategory, { Icon: typeof HeartPulse; wrap: string }> = {
  health: { Icon: HeartPulse, wrap: "bg-teal-500/15 text-teal-500 dark:text-teal-400" },
  life: { Icon: Heart, wrap: "bg-sky-500/15 text-sky-500 dark:text-sky-400" },
  vehicle: { Icon: Car, wrap: "bg-amber-500/15 text-amber-500 dark:text-amber-400" },
  gadget: { Icon: Smartphone, wrap: "bg-violet-500/15 text-violet-500 dark:text-violet-400" },
  other: { Icon: Package, wrap: "bg-muted text-muted-foreground" },
};

function CountdownRing({ days }: { days: number }) {
  const overdue = days < 0;
  const urgent = days >= 0 && days < URGENT_DAYS;
  const max = 90;
  const clamped = Math.max(0, Math.min(max, days));
  const pct = (clamped / max) * 100;
  const tone = overdue
    ? "text-destructive"
    : urgent
      ? "text-amber-500"
      : "text-emerald-500";
  const trackTone = overdue
    ? "stroke-destructive/20"
    : urgent
      ? "stroke-amber-500/20"
      : "stroke-emerald-500/20";
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
        <circle cx="28" cy="28" r={r} className={cn("fill-none stroke-[4]", trackTone)} />
        <circle
          cx="28"
          cy="28"
          r={r}
          className={cn("fill-none stroke-[4] transition-all", tone.replace("text-", "stroke-"))}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className={cn("absolute inset-0 flex flex-col items-center justify-center", tone)}>
        <span className="text-sm font-bold leading-none">{overdue ? "!" : days}</span>
        <span className="text-[8px] uppercase tracking-wider opacity-70">{overdue ? "due" : "days"}</span>
      </div>
    </div>
  );
}

export default function PolicyList({
  items,
  categoryOrder,
  uploadingId,
  onPreview,
  onUpload,
  onEdit,
  onDelete,
  onDeleteMany,
}: {
  items: InsurancePolicy[];
  /** The order the category sections are drawn in. */
  categoryOrder: InsuranceCategory[];
  uploadingId: string | null;
  onPreview: (p: InsurancePolicy) => void;
  onUpload: (p: InsurancePolicy) => void;
  onEdit: (p: InsurancePolicy) => void;
  /** Single delete — the page owns its confirm. */
  onDelete: (id: string) => void;
  /** Bulk delete — resolves to how many failed, as BulkDeleteBar expects. */
  onDeleteMany: (ids: string[]) => Promise<number | void>;
}) {
  const grouped = useMemo(() => {
    const g: Record<InsuranceCategory, InsurancePolicy[]> = {
      health: [], life: [], vehicle: [], gadget: [], other: [],
    };
    items.forEach((p) => g[p.category].push(p));
    return g;
  }, [items]);

  // In the order they are drawn, so "select all" ticks exactly what is shown.
  const visibleIds = useMemo(
    () => categoryOrder.flatMap((c) => grouped[c].map((p) => p.id)),
    [categoryOrder, grouped],
  );
  const sel = useBulkSelection(visibleIds);

  return (
    <div className="space-y-12">
      <div className="space-y-2">
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <SelectAllBox sel={sel} />
          Select all policies
        </label>
        <BulkDeleteBar
          sel={sel}
          noun={["policy", "policies"]}
          description="Any uploaded policy documents are deleted with them."
          onDelete={onDeleteMany}
        />
      </div>
      {categoryOrder.filter((c) => grouped[c].length > 0).map((cat) => {
        const meta = CATEGORY_META[cat];
        const { Icon, wrap } = CATEGORY_ICON[cat];
        return (
          <section key={cat}>
            <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
              <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center", wrap)}>
                <Icon className="w-4 h-4" />
              </span>
              <h2 className="text-lg font-semibold font-display">{meta.label} Insurance</h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-muted text-muted-foreground uppercase tracking-wider">
                {grouped[cat].length} Active
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {grouped[cat].map((p) => {
                const d = daysUntil(p.dueDate);
                const urgency = policyUrgency(p.dueDate);
                const overdue = urgency === "overdue";
                const urgent = urgency === "urgent";
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "group relative rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20",
                      overdue
                        ? "border-destructive/40 shadow-lg shadow-destructive/5"
                        : urgent
                          ? "border-amber-500/40 ring-1 ring-amber-500/20"
                          : "border-border hover:border-border/80",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-6">
                      <SelectBox sel={sel} id={p.id} name={p.policyName || p.provider} className="mt-1 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-foreground leading-tight truncate">{p.policyName || p.provider}</h3>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {p.provider} · <span className="font-mono">{p.policyNumber}</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
                            {p.payStructure}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                            {p.paymentFrequency}
                          </span>
                        </div>
                      </div>
                      {overdue ? (
                        <div className="w-12 h-12 rounded-full border-2 border-destructive flex items-center justify-center shrink-0">
                          <span className="text-xs font-black text-destructive tracking-wider">DUE</span>
                        </div>
                      ) : d === null ? (
                        // No date to count down to. A ring drawn at zero
                        // would read as "due today", which is a worse lie
                        // than showing nothing.
                        <div className="w-14 h-14 rounded-full border-2 border-dashed border-border flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-muted-foreground tracking-wider">N/A</span>
                        </div>
                      ) : (
                        <CountdownRing days={d} />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-2 mb-6">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Sum Insured</div>
                        <div className="text-sm font-semibold text-foreground">{formatMoney(p.sumInsured)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Premium</div>
                        <div className="text-sm font-semibold text-foreground">{formatMoney(p.premium)}</div>
                      </div>
                      <div className="col-span-2 pt-3 border-t border-border/60">
                        <div className={cn(
                          "text-[11px] uppercase tracking-wider font-bold mb-1",
                          overdue ? "text-destructive" : urgent ? "text-amber-500" : "text-muted-foreground",
                        )}>Premium Due Date</div>
                        <div className={cn(
                          "text-sm font-bold",
                          overdue ? "text-destructive" : d === null ? "text-muted-foreground" : "text-foreground",
                        )}>{formatDueDate(p.dueDate)}</div>
                      </div>
                    </div>
                    {overdue && (
                      <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-destructive uppercase leading-none mb-1">Action Required</div>
                          <div className="text-xs text-destructive/90">Renew Premium</div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {p.documentPath || p.hasLegacyDocument ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5 h-9 text-xs font-semibold border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                          onClick={() => onPreview(p)}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View Document
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1 gap-1.5 h-9 text-xs font-semibold"
                          disabled={uploadingId === p.id}
                          onClick={() => onUpload(p)}
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          {uploadingId === p.id ? "Uploading…" : "Upload Doc"}
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => onEdit(p)}
                        aria-label="Edit policy"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onDelete(p.id)}
                        aria-label="Delete policy"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
