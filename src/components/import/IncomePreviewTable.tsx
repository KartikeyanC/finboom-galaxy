import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { IncomeRow } from "@/lib/importParsers";

import { safe } from "./previewShared";

/** The income "Validation Queue" — split out of TransactionImporter in Stage 4.13. */
export default function IncomePreviewTable({
  rows,
  onRemove,
}: {
  rows: IncomeRow[];
  onRemove: (id: string) => void;
}) {
  const vIncome = useVirtualRows(rows.length, { estimateSize: 45 });

  return (
    <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-bold">Validation Queue</h3>
          <p className="text-xs text-muted-foreground">{rows.length} income stream(s)</p>
        </div>
      </div>
      <div
        ref={vIncome.scrollRef}
        className={cn(
          "rounded-lg border border-border/60 overflow-x-auto",
          vIncome.enabled && "max-h-[65vh] overflow-y-auto",
        )}
      >
        <Table>
          <TableHeader className={cn(vIncome.enabled && "sticky top-0 z-10 bg-card")}>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <VirtualSpacerRow height={vIncome.paddingTop} colSpan={7} />
            {(vIncome.enabled
              ? vIncome.virtualItems.map((vi) => ({ r: rows[vi.index], index: vi.index }))
              : rows.map((r, index) => ({ r, index }))
            ).map(({ r, index }) => (
              <TableRow
                key={r.id}
                ref={vIncome.enabled ? vIncome.measureRef : undefined}
                data-index={index}
              >
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>
                  <Badge variant={r.type === "passive" ? "secondary" : "default"} className="text-xs">
                    {r.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {formatMoney(safe(r.amount))}
                </TableCell>
                <TableCell className="text-xs">{r.currency}</TableCell>
                <TableCell className="text-xs">{r.frequency}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                  {r.notes || "—"}
                </TableCell>
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
            <VirtualSpacerRow height={vIncome.paddingBottom} colSpan={7} />
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
