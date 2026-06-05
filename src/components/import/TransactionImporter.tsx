import { useCallback, useMemo, useState } from "react";
import {
  Upload,
  Loader2,
  Trash2,
  FileSpreadsheet,
  FileText,
  FileType2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RotateCcw,
  Search,
  ChevronDown,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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

type Broker = {
  value: string;
  label: string;
  initial: string;
  brand: string;
  url: string;
  steps: string[];
  footnote: string;
};

const BROKERS: Broker[] = [
  {
    value: "Zerodha",
    label: "Zerodha",
    initial: "Z",
    brand: "#387ED1",
    url: "console.zerodha.com",
    steps: [
      "Login to **console.zerodha.com**",
      "Go to **Console → Reports → Tradebook**",
      "Select segment and date range",
      "Click **XLSX** to download the file",
      "Upload the downloaded file below",
    ],
    footnote: "Imports equity & F&O trades with cost and quantity.",
  },
  {
    value: "Groww",
    label: "Groww",
    initial: "G",
    brand: "#00B386",
    url: "groww.in",
    steps: [
      "Login to **groww.in**",
      "Open **Profile → Reports**",
      "Choose **Capital Gains / Transactions**",
      "Download the **Excel** statement",
      "Upload the file below",
    ],
    footnote: "Imports stocks and mutual fund holdings.",
  },
  {
    value: "INDmoney",
    label: "INDmoney",
    initial: "↑",
    brand: "#111111",
    url: "indmoney.com",
    steps: [
      "Login to **indmoney.com**",
      "Open **Portfolio → Reports**",
      "Select **Transactions** report",
      "Export as **CSV / XLSX**",
      "Upload the downloaded file below",
    ],
    footnote: "Imports US + IN equities and mutual funds.",
  },
  {
    value: "Upstox",
    label: "Upstox",
    initial: "U",
    brand: "#7B3FF2",
    url: "upstox.com",
    steps: [
      "Login to **upstox.com**",
      "Go to **Reports → Trade Report**",
      "Pick the financial year",
      "Download the **XLSX** file",
      "Upload the file below",
    ],
    footnote: "Imports executed trades across segments.",
  },
  {
    value: "ICICI Direct",
    label: "ICICI Direct",
    initial: "i",
    brand: "#F26722",
    url: "icicidirect.com",
    steps: [
      "Login to **icicidirect.com**",
      "Open **Portfolio → Reports**",
      "Choose **Transaction Statement**",
      "Download as **XLSX / PDF**",
      "Upload the file below",
    ],
    footnote: "Imports equity, F&O and MF activity.",
  },
  {
    value: "CDSL",
    label: "CDSL",
    initial: "C",
    brand: "#2563EB",
    url: "cdslindia.com",
    steps: [
      "Login to **CDSL Easi / Easiest**",
      "Open **Holdings Statement**",
      "Select date range",
      "Download the **PDF** statement",
      "Upload the file below",
    ],
    footnote: "Imports demat holdings across linked DPs.",
  },
  {
    value: "Angel One",
    label: "Angel One",
    initial: "A",
    brand: "#E94560",
    url: "angelone.in",
    steps: [
      "Login to **angelone.in**",
      "Open **Reports → Trade Book**",
      "Pick segment and dates",
      "Download as **XLSX**",
      "Upload the file below",
    ],
    footnote: "Imports equity and F&O trades.",
  },
  {
    value: "Aionion",
    label: "Aionion",
    initial: "△",
    brand: "#10B981",
    url: "tradeplus.aionioncapital.com",
    steps: [
      "Login to **tradeplus.aionioncapital.com**",
      "Click **Portfolio+**",
      "Go to **Dashboard → DEMAT HOLDINGS**",
      "Click **Export** to download the XLSX file",
      "Upload the downloaded file below",
    ],
    footnote: "Imports equity holdings with investment cost and market values.",
  },
  {
    value: "Chola Securities",
    label: "Chola Securities",
    initial: "+",
    brand: "#DC2626",
    url: "cholasecurities.com",
    steps: [
      "Login to **cholasecurities.com**",
      "Open **Reports → Holdings**",
      "Pick the financial year",
      "Download as **XLSX**",
      "Upload the file below",
    ],
    footnote: "Imports demat holdings statement.",
  },
  {
    value: "mstock",
    label: "mstock",
    initial: "m",
    brand: "#F97316",
    url: "mstock.com",
    steps: [
      "Login to **mstock.com**",
      "Open **Reports → Trade Book**",
      "Pick segment and dates",
      "Download as **XLSX**",
      "Upload the file below",
    ],
    footnote: "Imports equity and derivatives trades.",
  },
];

const CUSTOM_BROKER: Broker = {
  value: "__custom__",
  label: "Other Platform / Custom Bank PDF",
  initial: "+",
  brand: "#64748B",
  url: "",
  steps: [
    "Export a **CSV, XLS, XLSX or PDF** statement from your platform",
    "Ensure columns include **Date, Symbol/Asset, Type, Quantity, Price**",
    "Drop the file into the upload area below",
    "Review the extracted rows and adjust the FX rate for foreign currencies",
    "Click **Approve & Import Rows** to save to your ledger",
  ],
  footnote: "Generic parser — works with most bank and broker statements.",
};

type Section = "assets" | "income";
type Source = "broker" | "standard";

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
  const [section, setSection] = useState<Section>("assets");
  const [source, setSource] = useState<Source>("broker");
  const [profile, setProfile] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const createTxn = useCreateTransaction();

  const allBrokers = useMemo(() => [...BROKERS, CUSTOM_BROKER], []);
  const broker = allBrokers.find((b) => b.value === profile) ?? null;
  const topBrokers = useMemo(() => BROKERS.slice(0, 3), []);
  const isTopPick = (v: string) => topBrokers.some((b) => b.value === v);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SUPPORTED_EXT.includes("." + ext)) {
        toast.error(`Unsupported: ${file.name}`);
        continue;
      }
      setStage(stageLabel(ext));
      setProgress(8);
      const tick = window.setInterval(() => {
        setProgress((p) => (p < 90 ? p + Math.max(1, (92 - p) / 8) : p));
      }, 120);
      try {
        const parsed = await parseFile(file);
        setProgress(100);
        if (!parsed.length) toast.warning(`No rows detected in ${file.name}`);
        else toast.success(`Parsed ${parsed.length} rows from ${file.name}`);
        setRows((prev) => [...prev, ...parsed]);
      } catch (err) {
        console.error(err);
        toast.error(`Failed to parse ${file.name}`);
      } finally {
        window.clearInterval(tick);
        window.setTimeout(() => {
          setStage(null);
          setProgress(0);
        }, 350);
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

  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  const totalINR = useMemo(
    () =>
      rows.reduce(
        (s, r) => s + safe(r.quantity) * safe(r.price) * safe(r.rate),
        0,
      ),
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
          description: `${profile ?? "Import"} • ${r.asset} ${r.quantity} @ ${r.price} ${r.currency}`,
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
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-bold">Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Bulk import assets, income & expenses
        </p>
      </div>

      {/* Consolidated segmented header */}
      <Card className="p-4 bg-card/60 backdrop-blur border-border/60">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Dataset
            </span>
            <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
              <TabsList>
                <TabsTrigger value="assets">Assets</TabsTrigger>
                <TabsTrigger value="income">Income &amp; Expenses</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {section === "assets" && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Source
              </span>
              <Tabs value={source} onValueChange={(v) => setSource(v as Source)}>
                <TabsList>
                  <TabsTrigger value="broker">Import from Broker</TabsTrigger>
                  <TabsTrigger value="standard">Standard Import</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
        </div>
      </Card>

      {/* Progressive platform selector (Assets + Broker only) */}
      {section === "assets" && source === "broker" && (
        <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
          <div className="flex flex-col gap-2 mb-4">
            <h3 className="font-display text-base font-bold">Select Your Platform or Broker</h3>
            <p className="text-xs text-muted-foreground">
              Pick a top platform or search the full list to load tailored export steps.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {topBrokers.map((b) => {
              const active = b.value === profile;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setProfile(b.value)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all min-h-[44px]",
                    active
                      ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                      : "border-border/60 bg-secondary/30 hover:border-primary/40 hover:bg-secondary/50",
                  )}
                >
                  <span
                    className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: b.brand }}
                  >
                    {b.initial}
                  </span>
                  <span className="text-sm font-medium truncate">{b.label}</span>
                </button>
              );
            })}

            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all min-h-[44px]",
                    profile && !isTopPick(profile)
                      ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                      : "border-dashed border-border/60 bg-secondary/20 hover:border-primary/40 hover:bg-secondary/40",
                  )}
                >
                  <span className="w-7 h-7 rounded-md flex items-center justify-center bg-secondary/60 shrink-0">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                  </span>
                  <span className="text-sm font-medium truncate flex-1">
                    {profile && !isTopPick(profile)
                      ? broker?.label
                      : "More Brokers / Custom"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[280px] p-0"
                sideOffset={8}
              >
                <Command>
                  <CommandInput placeholder="Search platforms…" />
                  <CommandList>
                    <CommandEmpty>No platform found.</CommandEmpty>
                    <CommandGroup>
                      {allBrokers.map((b) => {
                        const isCustom = b.value === "__custom__";
                        const active = b.value === profile;
                        return (
                          <CommandItem
                            key={b.value}
                            value={b.label}
                            onSelect={() => {
                              setProfile(b.value);
                              setPickerOpen(false);
                            }}
                            className="gap-2.5"
                          >
                            <span
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                              style={{ backgroundColor: b.brand }}
                            >
                              {isCustom ? <Plus className="w-3.5 h-3.5" /> : b.initial}
                            </span>
                            <span className="flex-1 truncate">{b.label}</span>
                            {active && <Check className="w-4 h-4 text-emerald-500" />}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </Card>
      )}

      {/* How-to-export — appears only after platform selected */}
      {section === "assets" && source === "broker" && broker && (
        <div className="rounded-xl border border-border/60 bg-slate-900/50 p-6 animate-in slide-in-from-top-2 fade-in">
          <h3 className="font-display text-base font-bold mb-3">
            How to Export from {broker.label}
          </h3>
          <ol className="space-y-1.5 text-sm text-foreground/90 list-decimal pl-5">
            {broker.steps.map((s, i) => (
              <li
                key={i}
                dangerouslySetInnerHTML={{
                  __html: s
                    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                    .replace(
                      broker.url,
                      `<a href="https://${broker.url}" target="_blank" rel="noreferrer" class="text-primary underline underline-offset-2">${broker.url}</a>`,
                    ),
                }}
              />
            ))}
          </ol>
          <p className="text-xs text-muted-foreground mt-4">{broker.footnote}</p>
        </div>
      )}

      {/* Dropzone */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-bold">Upload File</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {section === "assets" && source === "broker"
                ? broker
                  ? `Drop the exported ${broker.label} file (CSV, XLS, XLSX, or PDF).`
                  : "Select a platform above, then drop the exported file (CSV, XLS, XLSX, or PDF)."
                : "Drop CSV, XLS, XLSX, or PDF statements to auto-extract rows."}
            </p>
          </div>
          <Button asChild size="sm" className="gap-2 shrink-0">
            <label className="cursor-pointer">
              <Upload className="w-4 h-4" />
              Browse Files
              <input
                type="file"
                multiple
                accept={SUPPORTED_EXT.join(",")}
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </label>
          </Button>
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
            <div className="flex flex-col items-center gap-4 w-full max-w-sm">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <Loader2 className="absolute inset-0 m-auto w-16 h-16 text-primary animate-spin" />
              </div>
              <p className="font-medium text-primary">{stage}</p>
              <Progress value={progress} className="h-2 w-full" />
              <p className="text-xs text-muted-foreground font-mono">
                {Math.round(progress)}%
              </p>
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
        <Card className="p-6 bg-card/60 backdrop-blur border-border/60 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-bold">Validation Queue</h3>
              <p className="text-xs text-muted-foreground">
                {rows.length} row(s) • Total ≈ {totalINR > 0 ? formatMoney(totalINR) : "—"}
              </p>
            </div>
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
                  const total = safe(r.quantity) * safe(r.price) * safe(r.rate);
                  return (
                    <TableRow key={r.id}>
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
                              updateRow(r.id, {
                                rate:
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value) || 0,
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

          {/* Sticky finalization bar */}
          <div className="sticky bottom-4 mt-6 flex flex-wrap gap-3 justify-end rounded-xl border border-border/60 bg-background/80 backdrop-blur p-3 shadow-lg">
            <Button variant="outline" onClick={() => setRows([])} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Clear / Reset Form
            </Button>
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
              Approve & Import Rows
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export default TransactionImporter;