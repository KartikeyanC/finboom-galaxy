import { useCallback, useMemo, useState } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  Plus,
  RotateCcw,
  Search,
  ChevronDown,
  Check,
  Download,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AssetPreviewTable from "./AssetPreviewTable";
import BudgetPreviewTable from "./BudgetPreviewTable";
import ExpensePreviewTable from "./ExpensePreviewTable";
import GoalPreviewTable from "./GoalPreviewTable";
import IncomePreviewTable from "./IncomePreviewTable";
import {
  parseFile,
  parseExpenses,
  parseIncomeRows,
  parseGoals,
  parseBudgets,
  SUPPORTED_EXT,
  STRUCTURED_EXT,
  downloadExpenseTemplate,
  downloadIncomeTemplate,
  downloadGoalsTemplate,
  downloadBudgetsTemplate,
  type ImportedRow,
  type ExpenseRow,
  type IncomeRow,
  type GoalRow,
  type BudgetRow,
} from "@/lib/importParsers";
import { useImportTransactions } from "@/hooks/useImportTransactions";
import { useCreateGoal } from "@/hooks/useGoals";
import { useSetBudgetAllocation } from "@/hooks/useBudgets";
import { useIncomeStreams } from "@/hooks/useIncomeStreams";
import { BROKERS, CUSTOM_BROKER, type Broker } from "./brokers";


type Section = "assets" | "expenses" | "income" | "goals" | "budgets";
type Source = "broker" | "standard";

const SECTION_META: Record<Section, { label: string; description: string; color: string }> = {
  assets: {
    label: "Assets / Investments",
    description: "Import broker trade history and investment holdings.",
    color: "text-blue-400",
  },
  expenses: {
    label: "Expenses",
    description: "Bulk import past expenses from a spreadsheet.",
    color: "text-rose-400",
  },
  income: {
    label: "Income Streams",
    description: "Import salary, freelance or passive income sources.",
    color: "text-emerald-400",
  },
  goals: {
    label: "Goals",
    description: "Import financial goals with target amounts and dates.",
    color: "text-amber-400",
  },
  budgets: {
    label: "Budgets",
    description: "Import budget allocations by category.",
    color: "text-purple-400",
  },
};

const stageLabel = (ext: string) => {
  if (ext === "pdf") return "Extracting Text from PDF Layers...";
  if (ext === "csv") return "Reading CSV Rows...";
  return "Reading Spreadsheet Rows...";
};

// ── Dropzone shared component ──────────────────────────────────────────────
function Dropzone({
  accept,
  stage,
  progress,
  onFiles,
}: {
  accept: string[];
  stage: string | null;
  progress: number;
  onFiles: (files: FileList | File[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
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
        accept={accept.join(",")}
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      {stage ? (
        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <Loader2 className="w-16 h-16 text-primary animate-spin" />
          <p className="font-medium text-primary">{stage}</p>
          <Progress value={progress} className="h-2 w-full" />
          <p className="text-xs text-muted-foreground font-mono">{Math.round(progress)}%</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="font-medium">Drag & drop files here, or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports {accept.join(" • ")}
            </p>
          </div>
          <div className="flex gap-2 mt-2">
            {accept.map((e) => (
              <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
            ))}
          </div>
        </div>
      )}
    </label>
  );
}

// ── Column info chips ──────────────────────────────────────────────────────
function ColumnHint({ columns }: { columns: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {columns.map((c) => (
        <Badge key={c} variant="secondary" className="font-mono text-xs text-muted-foreground">
          {c}
        </Badge>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function TransactionImporter() {
  const [section, setSection] = useState<Section>("assets");
  const [source, setSource] = useState<Source>("broker");
  const [profile, setProfile] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Per-section row state
  const [assetRows, setAssetRows] = useState<ImportedRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [goalRows, setGoalRows] = useState<GoalRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);

  const importTxns = useImportTransactions();
  const createGoal = useCreateGoal();
  const setBudget = useSetBudgetAllocation();
  const { add: addIncome } = useIncomeStreams();

  const allBrokers = useMemo(() => [...BROKERS, CUSTOM_BROKER], []);
  const broker = allBrokers.find((b) => b.value === profile) ?? null;
  const topBrokers = useMemo(() => BROKERS.slice(0, 3), []);
  const isTopPick = (v: string) => topBrokers.some((b) => b.value === v);

  const runParse = useCallback(
    async (
      files: FileList | File[],
      parser: (f: File) => Promise<unknown[] | { rows: unknown[]; skipped: number }>,
    ) => {
      const list = Array.from(files);
      const allRows: unknown[] = [];
      for (const file of list) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const accepted = section === "assets" ? SUPPORTED_EXT : STRUCTURED_EXT;
        if (!accepted.includes("." + ext)) {
          toast.error(`Unsupported: ${file.name}`);
          continue;
        }
        setStage(stageLabel(ext));
        setProgress(8);
        const tick = window.setInterval(() => {
          setProgress((p) => (p < 90 ? p + Math.max(1, (92 - p) / 8) : p));
        }, 120);
        try {
          const result = await parser(file);
          const parsed = Array.isArray(result) ? result : result.rows;
          const skipped = Array.isArray(result) ? 0 : result.skipped;
          setProgress(100);
          if (!parsed.length) toast.warning(`No rows detected in ${file.name}`);
          else toast.success(`Parsed ${parsed.length} rows from ${file.name}`);
          // BUG-108 — a dropped row used to leave no trace anywhere.
          if (skipped > 0) {
            toast.warning(
              `${skipped} row${skipped === 1 ? "" : "s"} skipped in ${file.name} — missing a date or amount`,
            );
          }
          allRows.push(...parsed);
        } catch (err) {
          console.error(err);
          toast.error(`Failed to parse ${file.name}`);
        } finally {
          window.clearInterval(tick);
          window.setTimeout(() => { setStage(null); setProgress(0); }, 350);
        }
      }
      return allRows;
    },
    [section],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (section === "assets") {
        const rows = await runParse(files, parseFile);
        setAssetRows((prev) => [...prev, ...(rows as ImportedRow[])]);
      } else if (section === "expenses") {
        const rows = await runParse(files, parseExpenses);
        setExpenseRows((prev) => [...prev, ...(rows as ExpenseRow[])]);
      } else if (section === "income") {
        const rows = await runParse(files, parseIncomeRows);
        setIncomeRows((prev) => [...prev, ...(rows as IncomeRow[])]);
      } else if (section === "goals") {
        const rows = await runParse(files, parseGoals);
        setGoalRows((prev) => [...prev, ...(rows as GoalRow[])]);
      } else if (section === "budgets") {
        const rows = await runParse(files, parseBudgets);
        setBudgetRows((prev) => [...prev, ...(rows as BudgetRow[])]);
      }
    },
    [section, runParse],
  );

  /**
   * Source dates vary in format and are sometimes unparseable. Only the date
   * part feeds the de-duplication hash, so an unparseable value falls back to
   * today — stable within a day, which is the best that can be done without a
   * real date in the file.
   */
  const toIsoDate = (raw: string): string => {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  };

  // ── Asset import ─────────────────────────────────────────────────────────
  const syncAssets = async () => {
    if (!assetRows.length) return;
    // One idempotent batch: re-running the same file skips rows already stored
    // rather than appending a second copy of everything.
    const payload = assetRows.map((r) => ({
      type: r.action === "Inflow" ? "income" : "expense",
      amount: r.quantity * r.price * r.rate,
      currency: "INR",
      category: r.asset || "Imported",
      description: `${profile ?? "Import"} • ${r.asset} ${r.quantity} @ ${r.price} ${r.currency}`,
      occurred_at: toIsoDate(r.date),
    }));
    try {
      await importTxns.mutateAsync(payload);
      setAssetRows([]);
    } catch (e) {
      console.error(e);
    }
  };

  // ── Expense import ────────────────────────────────────────────────────────
  const syncExpenses = async () => {
    if (!expenseRows.length) return;
    const payload = expenseRows.map((r) => ({
      type: "expense",
      amount: r.amount,
      currency: r.currency,
      category: r.category,
      description: r.description || null,
      occurred_at: toIsoDate(r.date),
    }));
    try {
      await importTxns.mutateAsync(payload);
      setExpenseRows([]);
    } catch (e) {
      console.error(e);
    }
  };

  // ── Income import ─────────────────────────────────────────────────────────
  const syncIncome = async () => {
    if (!incomeRows.length) return;
    let ok = 0;
    // Await sequentially so each insert sees the prior display_order.
    for (const r of incomeRows) {
      try {
        await addIncome({
          name: r.name,
          amount: r.amount,
          currency: r.currency as "INR" | "USD" | "EUR",
          exchangeRateToINR: r.currency === "USD" ? 83.5 : r.currency === "EUR" ? 90 : 1,
          type: r.type,
          frequency: r.frequency,
          notes: r.notes,
        });
        ok++;
      } catch (e) {
        console.error(e);
      }
    }
    toast.success(`Added ${ok}/${incomeRows.length} income streams`);
    if (ok === incomeRows.length) setIncomeRows([]);
  };

  // ── Goal import ───────────────────────────────────────────────────────────
  const syncGoals = async () => {
    if (!goalRows.length) return;
    let ok = 0;
    for (const r of goalRows) {
      try {
        await createGoal.mutateAsync({
          title: r.title,
          category: r.category || null,
          target_amount: r.target_amount,
          current_amount: r.current_amount,
          currency: r.currency || "INR",
          target_date: r.target_date || null,
          status: r.status || "active",
        });
        ok++;
      } catch (e) {
        console.error(e);
      }
    }
    toast.success(`Imported ${ok}/${goalRows.length} goals`);
    if (ok === goalRows.length) setGoalRows([]);
  };

  // ── Budget import ─────────────────────────────────────────────────────────
  const syncBudgets = async () => {
    if (!budgetRows.length) return;
    let ok = 0;
    for (const r of budgetRows) {
      try {
        // `spent` from the file is ignored on purpose: it is derived from the
        // imported transactions (roadmap 2.4), never taken on trust.
        await setBudget.mutateAsync({
          bucket: r.bucket,
          allocated: r.allocated,
          period: r.period || "monthly",
          period_start: r.period_start || new Date().toISOString().slice(0, 10),
        });
        ok++;
      } catch (e) {
        console.error(e);
      }
    }
    toast.success(`Imported ${ok}/${budgetRows.length} budgets`);
    if (ok === budgetRows.length) setBudgetRows([]);
  };

  const currentRowCount =
    section === "assets" ? assetRows.length
    : section === "expenses" ? expenseRows.length
    : section === "income" ? incomeRows.length
    : section === "goals" ? goalRows.length
    : budgetRows.length;

  const clearCurrent = () => {
    if (section === "assets") setAssetRows([]);
    else if (section === "expenses") setExpenseRows([]);
    else if (section === "income") setIncomeRows([]);
    else if (section === "goals") setGoalRows([]);
    else setBudgetRows([]);
  };

  const isSyncing =
    importTxns.isPending || createGoal.isPending || setBudget.isPending;

  const handleSync = () => {
    if (section === "assets") syncAssets();
    else if (section === "expenses") syncExpenses();
    else if (section === "income") syncIncome();
    else if (section === "goals") syncGoals();
    else syncBudgets();
  };

  const downloadTemplate = () => {
    if (section === "expenses") downloadExpenseTemplate();
    else if (section === "income") downloadIncomeTemplate();
    else if (section === "goals") downloadGoalsTemplate();
    else if (section === "budgets") downloadBudgetsTemplate();
  };

  const templateColumns: Record<Section, string[]> = {
    assets: [],
    expenses: ["date", "category", "description", "amount", "currency"],
    income: ["name", "type", "amount", "currency", "frequency", "notes"],
    goals: ["title", "category", "target_amount", "current_amount", "currency", "target_date", "status"],
    // No `spent`: it is derived from the imported transactions, so promising
    // to import a figure we then ignore would be a lie in the template.
    budgets: ["bucket", "allocated", "period", "period_start"],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-bold">Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Bulk import assets, expenses, income, goals & budgets
        </p>
      </div>

      {/* Dataset selector */}
      <Card className="p-4 bg-card/60 backdrop-blur border-border/60">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Dataset
            </span>
            <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
              <TabsList className="flex-wrap h-auto gap-1">
                {(Object.keys(SECTION_META) as Section[]).map((s) => (
                  <TabsTrigger key={s} value={s}>
                    {SECTION_META[s].label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {section === "assets" && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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

        {/* Section description */}
        <p className={cn("text-xs mt-3", SECTION_META[section].color)}>
          {SECTION_META[section].description}
        </p>
      </Card>


      {/* Broker platform selector */}
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
                    {profile && !isTopPick(profile) ? broker?.label : "More Brokers / Custom"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[280px] p-0" sideOffset={8}>
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
                            onSelect={() => { setProfile(b.value); setPickerOpen(false); }}
                            className="gap-2.5"
                          >
                            <span
                              className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
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

      {/* Broker how-to */}
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

      {/* CSV Template hint for non-assets sections */}
      {section !== "assets" && (
        <Card className="p-4 bg-card/60 backdrop-blur border-border/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h3 className="font-display text-sm font-bold">Expected CSV Columns</h3>
              <ColumnHint columns={templateColumns[section]} />
              <p className="text-xs text-muted-foreground">
                Column names are case-insensitive. Extra columns are ignored.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={downloadTemplate}
            >
              <Download className="w-4 h-4" />
              Download Template
            </Button>
          </div>
        </Card>
      )}

      {/* Dropzone */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border/60">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-bold">Upload File</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {section === "assets"
                ? broker
                  ? `Drop the exported ${broker.label} file (CSV, XLS, XLSX, or PDF).`
                  : "Select a platform above, then drop the exported file."
                : "Drop your CSV or Excel file to auto-extract rows."}
            </p>
          </div>
          <Button asChild size="sm" className="gap-2 shrink-0">
            <label className="cursor-pointer">
              <Upload className="w-4 h-4" />
              Browse Files
              <input
                type="file"
                multiple
                accept={(section === "assets" ? SUPPORTED_EXT : STRUCTURED_EXT).join(",")}
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </label>
          </Button>
        </div>
        <Dropzone
          accept={section === "assets" ? SUPPORTED_EXT : STRUCTURED_EXT}
          stage={stage}
          progress={progress}
          onFiles={handleFiles}
        />
      </Card>

      {/* ── Preview tables ── */}

      {/* Assets preview */}
      {section === "assets" && assetRows.length > 0 && (
        <AssetPreviewTable
          rows={assetRows}
          onUpdate={(id, patch) =>
            setAssetRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
          }
          onRemove={(id) => setAssetRows((prev) => prev.filter((r) => r.id !== id))}
        />
      )}

      {/* Expenses preview */}
      {section === "expenses" && expenseRows.length > 0 && (
        <ExpensePreviewTable
          rows={expenseRows}
          onCategoryChange={(id, category) =>
            setExpenseRows((prev) => prev.map((x) => (x.id === id ? { ...x, category } : x)))
          }
          onRemove={(id) => setExpenseRows((prev) => prev.filter((x) => x.id !== id))}
        />
      )}

      {/* Income preview */}
      {section === "income" && incomeRows.length > 0 && (
        <IncomePreviewTable
          rows={incomeRows}
          onRemove={(id) => setIncomeRows((prev) => prev.filter((x) => x.id !== id))}
        />
      )}

      {/* Goals preview */}
      {section === "goals" && goalRows.length > 0 && (
        <GoalPreviewTable
          rows={goalRows}
          onRemove={(id) => setGoalRows((prev) => prev.filter((x) => x.id !== id))}
        />
      )}

      {/* Budgets preview */}
      {section === "budgets" && budgetRows.length > 0 && (
        <BudgetPreviewTable
          rows={budgetRows}
          onRemove={(id) => setBudgetRows((prev) => prev.filter((x) => x.id !== id))}
        />
      )}

      {/* Finalization bar */}
      {currentRowCount > 0 && (
        <div className="sticky bottom-4 flex flex-wrap gap-3 justify-end rounded-xl border border-border/60 bg-background/80 backdrop-blur p-3 shadow-lg">
          <Button variant="outline" onClick={clearCurrent} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Clear / Reset
          </Button>
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            size="lg"
            className="gap-2"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Approve & Import {currentRowCount} Row{currentRowCount !== 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Asset preview sub-component (extracted to keep main component readable) ──

export default TransactionImporter;
