import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { useVirtualRows } from "@/hooks/useVirtualRows";
import { VirtualSpacerRow } from "@/components/ui/virtual-spacer-row";
import type { ExpenseRow } from "@/lib/importParsers";

import { safe } from "./previewShared";

/**
 * The expense "Validation Queue" — split out of TransactionImporter in
 * Stage 4.13, matching AssetPreviewTable's shape (rows in, callbacks out).
 *
 * It owns its own virtualization (Stage 4.5 / PERF-009): a bank CSV can be
 * thousands of rows and every row here carries an editable input, so mounting
 * them all is far worse than a read-only table of the same length. Keeping the
 * hook next to the markup it measures is also what stopped the importer from
 * carrying one `useVirtualRows` per section at the top of a 960-line component.
 */
export default function ExpensePreviewTable({
  rows,
  onCategoryChange,
  onRemove,
}: {
  rows: ExpenseRow[];
  onCategoryChange: (id: string, category: string) => void;
  onRemove: (id: string) => void;
}) {
  const vExpense = useVirtualRows(rows.length, { estimateSize: 45 });

  return (
    <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-bold">Validation Queue</h3>
          <p className="text-xs text-muted-foreground">
            {rows.length} expense(s) •{" "}
            Total ≈ {formatMoney(rows.reduce((s, r) => s + safe(r.amount), 0))}
          </p>
        </div>
      </div>
      <div
        ref={vExpense.scrollRef}
        className={cn(
          "rounded-lg border border-border/60 overflow-x-auto",
          vExpense.enabled && "max-h-[65vh] overflow-y-auto",
        )}
      >
        <Table>
          <TableHeader className={cn(vExpense.enabled && "sticky top-0 z-10 bg-card")}>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <VirtualSpacerRow height={vExpense.paddingTop} colSpan={6} />
            {(vExpense.enabled
              ? vExpense.virtualItems.map((vi) => ({ r: rows[vi.index], index: vi.index }))
              : rows.map((r, index) => ({ r, index }))
            ).map(({ r, index }) => (
              <TableRow
                key={r.id}
                ref={vExpense.enabled ? vExpense.measureRef : undefined}
                data-index={index}
              >
                <TableCell className="font-mono text-xs">{r.date || "—"}</TableCell>
                <TableCell>
                  <Input
                    value={r.category}
                    onChange={(e) => onCategoryChange(r.id, e.target.value)}
                    className="h-7 text-xs w-32"
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                  {r.description || "—"}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {formatMoney(safe(r.amount))}
                </TableCell>
                <TableCell className="text-xs">{r.currency}</TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onRemove(r.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <VirtualSpacerRow height={vExpense.paddingBottom} colSpan={6} />
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
