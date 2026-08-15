import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/finance";
import type { BudgetRow } from "@/lib/importParsers";

import { safe } from "./previewShared";

/** The budgets "Validation Queue" — split out of TransactionImporter in Stage 4.13. */
export default function BudgetPreviewTable({
  rows,
  onRemove,
}: {
  rows: BudgetRow[];
  onRemove: (id: string) => void;
}) {
  return (
    <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-bold">Validation Queue</h3>
          <p className="text-xs text-muted-foreground">{rows.length} budget bucket(s)</p>
        </div>
      </div>
      <div className="rounded-lg border border-border/60 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Period Start</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.bucket}</TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {formatMoney(safe(r.allocated))}
                </TableCell>
                <TableCell className="text-xs">{r.period}</TableCell>
                <TableCell className="font-mono text-xs">{r.period_start || "—"}</TableCell>
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
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
