import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { ImportedRow } from "@/lib/importParsers";

/**
 * The investment "Validation Queue" — the editable preview of parsed broker
 * rows. Split out of TransactionImporter in Stage 4.13; it is self-contained
 * (props in, callbacks out) and was the last 120 lines of a 1 260-line file.
 */
export default function AssetPreviewTable({
  rows,
  onUpdate,
  onRemove,
}: {
  rows: ImportedRow[];
  onUpdate: (id: string, patch: Partial<ImportedRow>) => void;
  onRemove: (id: string) => void;
}) {
  const totalINR = useMemo(
    () => rows.reduce((s, r) => s + (r.quantity * r.price * r.rate), 0),
    [rows],
  );
  // Stage 4.5: a broker statement can be thousands of trades, each row here
  // carrying an editable FX-rate input.
  const virtual = useVirtualRows(rows.length, { estimateSize: 49 });
  return (
    <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-bold">Validation Queue</h3>
          <p className="text-xs text-muted-foreground">
            {rows.length} row(s) • Total ≈ {totalINR > 0 ? formatMoney(totalINR) : "—"}
          </p>
        </div>
      </div>
      <div
        ref={virtual.scrollRef}
        className={cn(
          "rounded-lg border border-border/60 overflow-x-auto",
          virtual.enabled && "max-h-[65vh] overflow-y-auto",
        )}
      >
        <Table>
          <TableHeader className={cn(virtual.enabled && "sticky top-0 z-10 bg-card")}>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead className="text-right">Base Price</TableHead>
              <TableHead>FX Rate</TableHead>
              <TableHead className="text-right">INR Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <VirtualSpacerRow height={virtual.paddingTop} colSpan={8} />
            {(virtual.enabled
              ? virtual.virtualItems.map((vi) => ({ r: rows[vi.index], index: vi.index }))
              : rows.map((r, index) => ({ r, index }))
            ).map(({ r, index }) => {
              const foreign = r.currency !== "INR";
              const total = r.quantity * r.price * r.rate;
              return (
                <TableRow
                  key={r.id}
                  ref={virtual.enabled ? virtual.measureRef : undefined}
                  data-index={index}
                >
                  <TableCell className="font-mono text-xs">{r.date || "—"}</TableCell>
                  <TableCell className="font-medium">{r.asset || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.action === "Inflow" ? "default" : "secondary"}
                      className={cn(
                        r.action === "Inflow"
                          ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20"
                          : "bg-rose-500/15 text-rose-500 hover:bg-rose-500/20",
                      )}
                    >
                      {r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number.isFinite(r.quantity) && r.quantity !== 0 ? r.quantity : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.currency}{" "}
                    {Number.isFinite(r.price) && r.price !== 0 ? r.price.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell>
                    {foreign ? (
                      <Input
                        type="number"
                        value={Number.isFinite(r.rate) ? r.rate : ""}
                        step="0.01"
                        onChange={(e) =>
                          onUpdate(r.id, {
                            rate: e.target.value === "" ? 0 : Number(e.target.value) || 0,
                          })
                        }
                        className="h-8 w-24 text-xs"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">1.00</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {total > 0 ? formatMoney(total) : "—"}
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
              );
            })}
            <VirtualSpacerRow height={virtual.paddingBottom} colSpan={8} />
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
