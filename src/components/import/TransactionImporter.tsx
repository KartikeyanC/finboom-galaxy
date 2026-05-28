import { useCallback, useMemo, useState } from "react";
import { Upload, Loader2, Trash2, FileSpreadsheet, FileText, FileType2, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Landmark, LineChart, Building2, Wallet, Sparkles } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { parseFile, SUPPORTED_EXT, type ImportedRow } from "@/lib/importParsers";
import { useCreateTransaction } from "@/hooks/useTransactions";

const PROFILES = [
  { value: "Zerodha", label: "Zerodha", icon: LineChart },
  { value: "Groww", label: "Groww", icon: Sparkles },
  { value: "Angel One", label: "Angel One", icon: Landmark },
  { value: "HDFC Ledger", label: "HDFC Ledger", icon: Building2 },
  { value: "Custom Template", label: "Custom", icon: Wallet },
];

const stageLabel = (ext: string) => {
  if (ext === "pdf") return "Extracting Text from PDF Layers...";
  if (ext === "csv") return "Reading CSV Rows...";
  return "Reading Spreadsheet Rows...";
};

const extIcon = (name: string) => {
  const e = name.split(".").pop()?.toLowerCase();
  if (e === "pdf") return FileText;
  if (e === "csv") return FileType2;
  return FileSpreadsheet;
};

export function TransactionImporter() {
  const [profile, setProfile] = useState(PROFILES[0].value);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const createTxn = useCreateTransaction();

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SUPPORTED_EXT.includes("." + ext)) {
        toast.error(`Unsupported: ${file.name}`);
        continue;
      }
      setStage(stageLabel(ext));
      try {
        const parsed = await parseFile(file);
        if (!parsed.length) toast.warning(`No rows detected in ${file.name}`);
        else toast.success(`Parsed ${parsed.length} rows from ${file.name}`);
        setRows((prev) => [...prev, ...parsed]);
      } catch (err) {
        console.error(err);
        toast.error(`Failed to parse ${file.name}`);
      } finally {
        setStage(null);
      }
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const updateRow = (id: string, patch: Partial<ImportedRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const totalINR = useMemo(
    () => rows.reduce((s, r) => s + r.quantity * r.price * r.rate, 0),
    [rows],
  );

  const sync = async () => {
    if (!rows.length) return;
    let ok = 0;
    for (const r of rows) {
      const amount = r.quantity * r.price * r.rate;
      const occurred_at = (() => {
        const d = new Date(r.date);
        return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      })();
      try {
        await createTxn.mutateAsync({
          type: r.action === "Inflow" ? "income" : "expense",
          amount,
          currency: "INR",
          category: r.asset || "Imported",
          description: `${profile} • ${r.asset} ${r.quantity} @ ${r.price} ${r.currency}`,
          occurred_at,
        });
        ok++;
      } catch (e) {
        console.error(e);
      }
    }
    toast.success(`Synced ${ok}/${rows.length} rows to ledger`);
    if (ok === rows.length) setRows([]);
  };

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-bold">Import Transactions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Drop CSV, XLS, XLSX, or PDF statements to auto-extract rows.
          </p>
        </div>

        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-primary font-display mb-2">
            Broker / Bank Profile
          </div>
          <Tabs value={profile} onValueChange={setProfile}>
            <div className="-mx-1 overflow-x-auto scrollbar-themed">
              <TabsList className="inline-flex w-max flex-nowrap h-auto">
                {PROFILES.map((p) => {
                  const Icon = p.icon;
                  return (
                    <TabsTrigger key={p.value} value={p.value} className="whitespace-nowrap">
                      <Icon className="w-4 h-4 mr-2" />
                      {p.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
          </Tabs>
        </div>

        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "relative flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed transition-all cursor-pointer py-12 px-6",
            dragOver
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border/60 hover:border-primary/50 hover:bg-accent/30",
          )}
        >
          <input
            type="file"
            multiple
            accept={SUPPORTED_EXT.join(",")}
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          {stage ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <Loader2 className="absolute inset-0 m-auto w-16 h-16 text-primary animate-spin" />
              </div>
              <p className="font-medium text-primary">{stage}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="font-medium">Drag & drop files here, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports .csv • .xls • .xlsx • .pdf
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                {SUPPORTED_EXT.map((e) => (
                  <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>
                ))}
              </div>
            </div>
          )}
        </label>
      </Card>

      {/* Preview */}
      {rows.length > 0 && (
        <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-bold">Validation Queue</h3>
              <p className="text-xs text-muted-foreground">
                {rows.length} row(s) • Total ≈ {formatMoney(totalINR)}
              </p>
            </div>
            <Button
              onClick={sync}
              disabled={createTxn.isPending}
              size="lg"
              className="gap-2"
            >
              {createTxn.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Approve & Sync to Ledger
            </Button>
          </div>

          <div className="rounded-lg border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
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
                {rows.map((r) => {
                  const foreign = r.currency !== "INR";
                  const total = r.quantity * r.price * r.rate;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.date}</TableCell>
                      <TableCell className="font-medium">{r.asset}</TableCell>
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
                      <TableCell className="text-right font-mono">{r.quantity}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.currency} {r.price.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {foreign ? (
                          <Input
                            type="number"
                            value={r.rate}
                            step="0.01"
                            onChange={(e) =>
                              updateRow(r.id, { rate: Number(e.target.value) || 0 })
                            }
                            className="h-8 w-24 text-xs"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">1.00</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatMoney(total)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeRow(r.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default TransactionImporter;