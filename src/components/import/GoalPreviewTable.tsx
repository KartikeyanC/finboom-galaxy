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
import { formatMoney } from "@/lib/finance";
import type { GoalRow } from "@/lib/importParsers";

import { safe } from "./previewShared";

/**
 * The goals "Validation Queue" — split out of TransactionImporter in
 * Stage 4.13. Not virtualized, deliberately: Stage 4.5 left this table alone
 * because nobody imports 200 goals, and windowing costs find-in-page.
 */
export default function GoalPreviewTable({
  rows,
  onRemove,
}: {
  rows: GoalRow[];
  onRemove: (id: string) => void;
}) {
  return (
    <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-bold">Validation Queue</h3>
          <p className="text-xs text-muted-foreground">{rows.length} goal(s)</p>
        </div>
      </div>
      <div className="rounded-lg border border-border/60 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Target Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.category || "—"}</TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {formatMoney(safe(r.target_amount))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(safe(r.current_amount))}
                </TableCell>
                <TableCell className="text-xs">{r.currency}</TableCell>
                <TableCell className="font-mono text-xs">{r.target_date || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">{r.status}</Badge>
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
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
