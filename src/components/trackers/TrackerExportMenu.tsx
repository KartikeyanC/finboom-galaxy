import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { findGroupForSub } from "@/lib/expenseSubcategories";
import {
  dlBlob,
  makeCSV,
  trackerExportFilename,
  trackerExportRow,
  trackerSheetName,
  type ExportableTxn,
} from "@/pages/export/reportData";
import type { TrackerWithSpend } from "@/lib/trackers";

/**
 * Export one tracker — CSV, Excel, or print/PDF.
 *
 * Reuses the existing export primitives rather than inventing a parallel
 * pipeline: `makeCSV` + `dlBlob` from reportData.ts, the same
 * `await import("xlsx")` dynamic import Export.tsx uses (keeping the 429 kB
 * library out of the main bundle), and `window.print()` — which IS the PDF
 * path in this codebase, via the `print:` Tailwind variants.
 *
 * 🔴 Exports what is ON SCREEN. The rows passed in are the FILTERED rows, so a
 * statement always matches the view that produced it. An export that quietly
 * includes rows the user had filtered out is one they may hand to an
 * accountant without ever noticing.
 */

/** Splits "Sub · note" when the prefix names a real subcategory. */
function splitSub(desc: string | null): { sub: string; note: string } {
  const d = desc ?? "";
  const i = d.indexOf(" · ");
  if (i === -1) return { sub: "", note: d };
  const candidate = d.slice(0, i);
  // A leading phrase is only a subcategory if it names one; otherwise it is
  // the user's own words and must survive intact.
  return findGroupForSub(candidate)
    ? { sub: candidate, note: d.slice(i + 3) }
    : { sub: "", note: d };
}

export default function TrackerExportMenu({
  tracker,
  rows,
  accountName,
  filtered,
}: {
  tracker: TrackerWithSpend;
  /** Already filtered — what the user is looking at. */
  rows: ExportableTxn[];
  accountName: (id: string | null) => string;
  filtered: boolean;
}) {
  const build = () =>
    rows.map((t) =>
      trackerExportRow(t, { trackerName: tracker.name, accountName, splitSub }),
    );

  const guard = (): boolean => {
    if (rows.length === 0) {
      toast.error("There is nothing to export in the current view.");
      return false;
    }
    return true;
  };

  const exportCSV = () => {
    if (!guard()) return;
    try {
      dlBlob(
        makeCSV(build()),
        trackerExportFilename(tracker.name, "csv"),
        "text/csv;charset=utf-8",
      );
    } catch (e) {
      notifyError(e);
    }
  };

  const exportExcel = async () => {
    if (!guard()) return;
    try {
      const xlsx = await import("xlsx");
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(
        wb,
        xlsx.utils.json_to_sheet(build()),
        trackerSheetName(tracker.name),
      );
      xlsx.writeFile(wb, trackerExportFilename(tracker.name, "xlsx"));
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
          {filtered
            ? `${rows.length} filtered ${rows.length === 1 ? "transaction" : "transactions"}`
            : `All ${rows.length} ${rows.length === 1 ? "transaction" : "transactions"}`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportCSV} className="gap-2">
          <FileText className="w-4 h-4" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportExcel} className="gap-2">
          <FileSpreadsheet className="w-4 h-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()} className="gap-2">
          <Printer className="w-4 h-4" /> Print / PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
