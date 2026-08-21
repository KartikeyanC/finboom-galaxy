import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, X, Check, Sparkles, Loader2, Trash2, ChevronUp, ChevronDown, AlertTriangle, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_COLORS } from "@/lib/categories";
import {
  UNITS,
  rowsFromScanResult,
  reconcileTotal,
  moveImage,
  removeImage,
  validateNewFiles,
  fileToBase64,
  partitionRows,
  type ScannedRow,
  type ScanResult,
  type StagedImage,
} from "@/lib/billScan";

const CATEGORIES = Object.keys(EXPENSE_COLORS);

const CATEGORY_ICONS: Record<string, string> = {
  "Food & Dining": "🍔",
  Transport: "🚗",
  Shopping: "🛍️",
  Healthcare: "💊",
  Education: "📚",
  Travel: "✈️",
  Subscriptions: "📺",
  Utilities: "💡",
  Rent: "🏠",
  "Personal Care": "💅",
  Entertainment: "🎬",
};

export default function BillScanPage() {
  const { currentTenantId } = useTenant();
  const [images, setImages] = useState<StagedImage[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [lineItemMode, setLineItemMode] = useState(false);
  const [rows, setRows] = useState<ScannedRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createTxn = useCreateTransaction();

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const { accepted, rejected } = validateNewFiles(images.length, files);
    if (rejected.length) {
      toast.error(
        rejected.length === 1
          ? `Couldn't add that image — ${rejected[0].reason}`
          : `Couldn't add ${rejected.length} images`,
        { description: rejected.map((r) => `${r.file.name}: ${r.reason}`).join("; ") },
      );
    }
    if (!accepted.length) return;
    const staged: StagedImage[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...staged]);
    // A new image invalidates whatever was scanned before it.
    setScanned(false);
    setScanResult(null);
    setRows([]);
  }, [images.length]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const removeStagedImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return removeImage(prev, id);
    });
    setScanned(false);
    setScanResult(null);
    setRows([]);
  };

  const reorder = (index: number, direction: -1 | 1) => {
    setImages((prev) => moveImage(prev, index, direction));
  };

  const reset = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setScanned(false);
    setScanResult(null);
    setRows([]);
  };

  const runScan = async () => {
    if (!images.length) return;
    if (!currentTenantId) {
      toast.error("No workspace selected");
      return;
    }
    setIsScanning(true);
    try {
      const payloadImages = await Promise.all(
        images.map(async (img) => ({ data: await fileToBase64(img.file), mimeType: img.file.type })),
      );
      const { data, error } = await supabase.functions.invoke<ScanResult>("scan-receipt", {
        body: { tenant_id: currentTenantId, images: payloadImages },
      });
      if (error) throw error;
      if (!data) throw new Error("The scan returned nothing readable");

      setScanResult(data);
      const today = new Date().toISOString().slice(0, 10);
      setRows(rowsFromScanResult(data, lineItemMode ? "lineItem" : "lumpsum", today));
      setScanned(true);
      toast.success(`Extracted ${data.items.length} item${data.items.length === 1 ? "" : "s"} from ${data.merchant}`);
    } catch (e) {
      notifyError(e, { title: "Couldn't scan that receipt" });
    } finally {
      setIsScanning(false);
    }
  };

  // Re-derive rows when the toggle flips, from the same scan result — no
  // re-scan needed, and the AI's per-item categories are preserved either way.
  useEffect(() => {
    if (!scanned || !scanResult) return;
    const today = rows[0]?.date ?? new Date().toISOString().slice(0, 10);
    setRows(rowsFromScanResult(scanResult, lineItemMode ? "lineItem" : "lumpsum", today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItemMode]);

  const updateRow = (id: string, patch: Partial<ScannedRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const handleApprove = async () => {
    if (!rows.length) return;
    try {
      for (const r of rows) {
        if (!r.amount || r.amount <= 0) continue;
        await createTxn.mutateAsync({
          type: "expense",
          amount: r.amount,
          currency: "INR",
          category: r.category,
          description: r.name,
          occurred_at: new Date(r.date).toISOString(),
        });
      }
      toast.success(`Logged ${rows.length} expense${rows.length > 1 ? "s" : ""}`);
      reset();
    } catch (e) {
      notifyError(e);
    }
  };

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const reconciliation = scanResult ? reconcileTotal(rows, scanResult.total) : null;
  const { items: itemRows, taxes: taxRows } = partitionRows(rows);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" /> AI Bill Scanner
        </span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">Scan & Log Receipts</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Upload one or more photos of a receipt — a long bill shot in parts works too — and let AI
          extract the merchant, line items and category. Review, then log to your ledger.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload / Preview */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-foreground">Document</h2>
            <div className="flex items-center gap-3">
              <Label htmlFor="mode" className="text-xs text-muted-foreground">
                {lineItemMode ? "Line-Item Split" : "Lumpsum"}
              </Label>
              <Switch id="mode" checked={lineItemMode} onCheckedChange={setLineItemMode} />
            </div>
          </div>

          {!images.length ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`relative w-full h-72 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all ${
                dragOver
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border/60 hover:border-primary/60 hover:bg-accent/40"
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center px-6">
                <p className="font-medium text-foreground">Upload Invoice or Receipt</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Drag & drop or click to browse — up to 5 JPG, PNG or WEBP photos
                </p>
              </div>
            </button>
          ) : (
            <div className="space-y-3">
              {/* Ordered thumbnail strip — this is the "which image is first"
                  control: a long receipt shot in parts is scanned as one
                  document, in the order shown here. */}
              <ul className="flex flex-wrap gap-2" aria-label="Receipt pages, in scan order">
                {images.map((img, i) => (
                  <li
                    key={img.id}
                    className="relative w-20 h-20 rounded-lg border border-border/60 overflow-hidden bg-muted/30 group"
                  >
                    <img src={img.previewUrl} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-background/90 border border-border text-[10px] font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-background/90 py-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => reorder(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move page ${i + 1} earlier`}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent disabled:opacity-30"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => reorder(i, 1)}
                        disabled={i === images.length - 1}
                        aria-label={`Move page ${i + 1} later`}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent disabled:opacity-30"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStagedImage(img.id)}
                        aria-label={`Remove page ${i + 1}`}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/20 hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
                {images.length < 5 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      aria-label="Add another page"
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/60 hover:bg-accent/40 flex items-center justify-center transition-colors"
                    >
                      <Upload className="w-5 h-5 text-muted-foreground" />
                    </button>
                  </li>
                )}
              </ul>

              <div className="relative w-full h-56 rounded-xl border border-border/60 overflow-hidden bg-muted/30 flex items-center justify-center">
                {images[0].file.type.startsWith("image/") ? (
                  <img src={images[0].previewUrl} alt="receipt preview" className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileText className="w-12 h-12" />
                    <span className="text-sm">{images[0].file.name}</span>
                  </div>
                )}

                {isScanning && (
                  <>
                    <div className="absolute inset-0 bg-primary/5 backdrop-blur-[1px]" />
                    <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_20px_hsl(var(--primary))] animate-scan-line" />
                    <div className="absolute inset-x-0 bottom-3 flex items-center justify-center">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 border border-primary/30 text-xs font-medium text-primary">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        AI reading {images.length > 1 ? `${images.length} pages` : "receipt"}…
                      </div>
                    </div>
                  </>
                )}

                {scanned && !isScanning && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-medium animate-fade-in">
                    <Check className="w-3.5 h-3.5" /> Verified
                  </div>
                )}
              </div>

              {!scanned && (
                <Button
                  onClick={runScan}
                  disabled={isScanning}
                  className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                >
                  {isScanning ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ScanLine className="w-4 h-4 mr-2" />
                  )}
                  Scan {images.length > 1 ? `${images.length} pages` : "receipt"}
                </Button>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) addFiles(files);
              e.target.value = "";
            }}
          />

          {scanResult && scanned && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm rounded-lg bg-muted/30 border border-border/60 px-3 py-2">
                <span className="text-muted-foreground">Detected merchant</span>
                <span className="font-medium text-foreground">{scanResult.merchant}</span>
              </div>
              {reconciliation && !reconciliation.matches && (
                <div className="flex items-start gap-2 text-xs rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-500 px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    The rows below add up to ₹{reconciliation.computed.toLocaleString("en-IN")}, but the
                    receipt's own total is ₹{reconciliation.stated.toLocaleString("en-IN")}. Check the
                    line items before approving.
                  </span>
                </div>
              )}
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={reset} disabled={!images.length} className="w-full">
            Start over
          </Button>
        </div>

        {/* Verification Ledger */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
          <h2 className="font-display font-semibold text-foreground">Verification Ledger</h2>

          {!scanned ? (
            <div className="h-72 rounded-xl border border-dashed border-border/60 flex items-center justify-center text-sm text-muted-foreground text-center px-6">
              {isScanning ? "Extracting line items…" : "Upload and scan a receipt to see extracted items here"}
            </div>
          ) : (
            <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
              {itemRows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-border/60 bg-background/40 p-3 space-y-2 animate-fade-in"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={r.name}
                      onChange={(e) => updateRow(r.id, { name: e.target.value })}
                      className="h-9 flex-1 bg-white/5 border border-slate-800"
                      placeholder="Item name"
                    />
                    <button
                      onClick={() => removeRow(r.id)}
                      aria-label={`Remove ${r.name || "item"}`}
                      className="w-9 h-9 rounded-md border border-border/60 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-9 gap-2">
                    <Select
                      value={r.category}
                      onValueChange={(v) => updateRow(r.id, { category: v })}
                    >
                      <SelectTrigger className="h-9 text-xs col-span-4">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            <span className="mr-1">{CATEGORY_ICONS[c] ?? "•"}</span>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={r.qty}
                      onChange={(e) => updateRow(r.id, { qty: Number(e.target.value) || 0 })}
                      className="h-9 col-span-2 bg-white/5 border border-slate-800"
                      placeholder="Qty"
                    />
                    <Select
                      value={r.unit}
                      onValueChange={(v) => updateRow(r.id, { unit: v as ScannedRow["unit"] })}
                    >
                      <SelectTrigger className="h-9 text-xs col-span-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={r.amount}
                      onChange={(e) => updateRow(r.id, { amount: Number(e.target.value) || 0 })}
                      className="h-9 col-span-2"
                      placeholder="Amount"
                    />
                  </div>
                  {/* Its own row, not squeezed into the grid above — a
                      "dd MMM yyyy" date plus icon needs more width than a
                      2/12 column gives it; it was being clipped by the card's
                      own edge with no ellipsis, so half the date read as
                      unreadable rather than just short. */}
                  <DatePickerField
                    value={r.date}
                    onChange={(v) => updateRow(r.id, { date: v })}
                    presets="past"
                    placeholder="Bill date"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Tax & adjustments — a horizontal summary strip, not more item
              cards. Gestalt's law of common region: a divider plus a row
              layout marks CGST/SGST/Round Off as one related set, distinct
              from the purchases above. Horizontal because these are short,
              same-shaped label:value pairs — the case summary bars exist
              for (every checkout/receipt reads subtotal/tax/total this way);
              stacking three short values vertically would only add eye
              movement, not clarity, and 3 items is well inside how many a
              reader parses at a glance side-by-side. */}
          {taxRows.length > 0 && (
            <div className="border-t border-border/60 pt-3">
              <div className="flex flex-wrap items-center justify-around gap-x-3 gap-y-2">
                {taxRows.map((t) => (
                  <div key={t.id} className="flex items-center gap-1">
                    <label htmlFor={`tax-${t.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                      {t.name} :
                    </label>
                    <span className="text-xs text-muted-foreground">₹</span>
                    <Input
                      id={`tax-${t.id}`}
                      type="number"
                      value={t.amount}
                      onChange={(e) => updateRow(t.id, { amount: Number(e.target.value) || 0 })}
                      className="h-7 w-14 text-xs px-1.5"
                    />
                    <button
                      onClick={() => removeRow(t.id)}
                      aria-label={`Remove ${t.name}`}
                      className="w-5 h-5 rounded hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Moved here from the panel header — right above the action it
              describes reads as "this is what you're about to log," rather
              than a stat floating in a corner disconnected from the button. */}
          {scanned && (
            <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border/60 pt-3">
              <span>{rows.length} item{rows.length === 1 ? "" : "s"}</span>
              <span className="font-medium text-foreground">₹{total.toLocaleString("en-IN")}</span>
            </div>
          )}

          <Button
            disabled={!scanned || !rows.length || createTxn.isPending}
            onClick={handleApprove}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            {createTxn.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Approve & Log Scanned Expenses
          </Button>
        </div>
      </div>
    </div>
  );
}
