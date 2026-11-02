import { useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { BulkSelection } from "./useBulkSelection";

/**
 * Bulk delete for any list — the one pattern every menu shares:
 *
 *   const sel = useBulkSelection(rows.map((r) => r.id));   // ./useBulkSelection
 *   <SelectAllBox sel={sel} />                 ← in the header
 *   <SelectBox sel={sel} id={r.id} name={r.name} />   ← on each row
 *   <BulkDeleteBar sel={sel} noun={["goal", "goals"]}
 *     onDelete={(ids) => removeMany(ids)} />   ← above the list
 *
 * The bar appears only while something is ticked; Delete asks once, runs
 * [onDelete], reports how many went (and how many didn't), and clears.
 * A selection only ever counts rows that are still visible, so a filter or a
 * delete elsewhere can never send a hidden row to the bin.
 */

/** The header box: ticks every visible row, or clears them. */
export function SelectAllBox({ sel, className }: { sel: BulkSelection; className?: string }) {
  return (
    <Checkbox
      className={className}
      aria-label={sel.all ? "Clear all" : "Select all"}
      checked={sel.all ? true : sel.some ? "indeterminate" : false}
      onCheckedChange={() => sel.setAll(!sel.all)}
    />
  );
}

/** One row's box; [name] makes "Select Groceries" rather than "Select". */
export function SelectBox({
  sel,
  id,
  name,
  className,
}: {
  sel: BulkSelection;
  id: string;
  name?: string;
  className?: string;
}) {
  return (
    <Checkbox
      className={className}
      aria-label={name ? `Select ${name}` : "Select"}
      checked={sel.isSelected(id)}
      onCheckedChange={() => sel.toggle(id)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** "N selected · Delete selected", shown only while rows are ticked. */
export function BulkDeleteBar({
  sel,
  noun,
  onDelete,
  description,
  className,
}: {
  sel: BulkSelection;
  /** [singular, plural]: ["goal", "goals"]. */
  noun: [string, string];
  /**
   * Deletes the ids. Resolve to how many failed (or nothing when all went);
   * a throw counts as all of them failing.
   */
  onDelete: (ids: string[]) => Promise<number | void> | number | void;
  /** Extra line in the confirm (what else goes with them). */
  description?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!sel.some && !open) return null;

  const n = sel.count;
  const word = n === 1 ? noun[0] : noun[1];

  const run = async () => {
    const ids = sel.ids;
    setBusy(true);
    let failed = 0;
    try {
      failed = (await onDelete(ids)) ?? 0;
    } catch {
      failed = ids.length;
    }
    setBusy(false);
    setOpen(false);
    const done = ids.length - failed;
    if (failed === 0) {
      toast.success(`Deleted ${done} ${done === 1 ? noun[0] : noun[1]}`);
      sel.clear();
    } else if (done > 0) {
      toast.warning(`Deleted ${done} of ${ids.length}. ${failed} couldn't be deleted — try again.`);
    } else {
      toast.error(`Couldn't delete the ${ids.length === 1 ? noun[0] : noun[1]}. Try again.`);
    }
  };

  return (
    <>
      {sel.some && (
        <div
          role="toolbar"
          aria-label={`Selected ${noun[1]}`}
          className={cn(
            "sticky top-2 z-10 flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 text-foreground shadow-sm",
            className,
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Clear selection"
            onClick={sel.clear}
          >
            <X className="h-4 w-4" />
          </Button>
          <span className="whitespace-nowrap text-sm font-medium">{n} selected</span>
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto h-8 gap-1.5"
            onClick={() => setOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete selected
          </Button>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {n} {word}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {description ? `${description} ` : ""}This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
