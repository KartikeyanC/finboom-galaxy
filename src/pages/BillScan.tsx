import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, X, Check, Sparkles, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { EXPENSE_COLORS } from "@/lib/categories";

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

const VENDOR_MAP: { pattern: RegExp; category: string; merchant: string }[] = [
  { pattern: /shell|bp|hp petrol|indian oil|uber|ola|rapido|metro|gas/i, category: "Transport", merchant: "Fuel/Ride" },
  { pattern: /starbucks|mcdonald|kfc|domino|pizza|swiggy|zomato|cafe|restaurant|burger/i, category: "Food & Dining", merchant: "Restaurant" },
  { pattern: /walmart|amazon|flipkart|myntra|mall|store|reliance retail/i, category: "Shopping", merchant: "Store" },
  { pattern: /apollo|pharma|hospital|clinic|medplus|chemist/i, category: "Healthcare", merchant: "Pharmacy" },
  { pattern: /netflix|spotify|prime|hotstar|youtube|subscription/i, category: "Subscriptions", merchant: "Subscription" },
  { pattern: /electricity|water bill|gas bill|broadband|airtel|jio|vodafone|utility/i, category: "Utilities", merchant: "Utility" },
  { pattern: /makemytrip|goibibo|irctc|airline|flight|hotel/i, category: "Travel", merchant: "Travel" },
  { pattern: /school|university|course|udemy|coursera|tuition/i, category: "Education", merchant: "Education" },
  { pattern: /rent|landlord|lease/i, category: "Rent", merchant: "Rent" },
  { pattern: /movie|pvr|inox|bookmyshow|concert/i, category: "Entertainment", merchant: "Entertainment" },
  { pattern: /salon|spa|barber/i, category: "Personal Care", merchant: "Personal Care" },
];

const SAMPLE_ITEMS = [
  { name: "Mushroom", category: "Shopping", amount: 120, qty: 1, unit: "pk" },
  { name: "Carrot", category: "Shopping", amount: 46, qty: 1, unit: "kg" },
  { name: "Dustbin", category: "Shopping", amount: 146, qty: 1, unit: "pc" },
  { name: "Juice", category: "Food & Dining", amount: 90, qty: 500, unit: "ml" },
];

const UNITS = ["pc", "pk", "kg", "g", "L", "ml"] as const;
type Unit = (typeof UNITS)[number];

type ScannedRow = {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  qty: number;
  unit: Unit;
};

function detectMerchant(filename: string) {
  for (const v of VENDOR_MAP) {
    if (v.pattern.test(filename)) return v;
  }
  return { merchant: "General Store", category: "Shopping" };
}

export default function BillScanPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [lineItemMode, setLineItemMode] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [rows, setRows] = useState<ScannedRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createTxn = useCreateTransaction();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = useCallback((f: File) => {
    const ok = /\.(png|jpe?g|pdf)$/i.test(f.name);
    if (!ok) {
      toast.error("Please upload a PNG, JPG or PDF file");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setScanned(false);
    setRows([]);
    setIsScanning(true);

    // Simulated AI parsing
    setTimeout(() => {
      const detected = detectMerchant(f.name);
      setMerchant(detected.merchant);
      const today = new Date().toISOString().slice(0, 10);
      // generate a deterministic-ish total
      const total = Math.round(400 + (f.size % 3500));
      const items: ScannedRow[] = SAMPLE_ITEMS.map((s) => ({
        id: crypto.randomUUID(),
        name: s.name,
        category: s.category,
        amount: s.amount,
        date: today,
        qty: s.qty,
        unit: s.unit as Unit,
      }));
      const itemsTotal = items.reduce((a, b) => a + b.amount, 0);
      const lumpsum: ScannedRow[] = [
        {
          id: crypto.randomUUID(),
          name: detected.merchant,
          category: detected.category,
          amount: itemsTotal || total,
          date: today,
          qty: 1,
          unit: "pc",
        },
      ];
      setRows(lineItemMode ? items : lumpsum);
      setIsScanning(false);
      setScanned(true);
      toast.success(`AI extracted ${lineItemMode ? items.length : 1} entr${lineItemMode ? "ies" : "y"}`);
    }, 2400);
  }, [previewUrl, lineItemMode]);

  // Re-derive rows when toggle flips after a scan
  useEffect(() => {
    if (!scanned || !file) return;
    const today = rows[0]?.date ?? new Date().toISOString().slice(0, 10);
    const detected = detectMerchant(file.name);
    if (lineItemMode && rows.length <= 1) {
      setRows(
        SAMPLE_ITEMS.map((s) => ({
          id: crypto.randomUUID(),
          name: s.name,
          category: s.category,
          amount: s.amount,
          date: today,
          qty: s.qty,
          unit: s.unit as Unit,
        }))
      );
    } else if (!lineItemMode && rows.length > 1) {
      const total = rows.reduce((s, r) => s + r.amount, 0);
      setRows([
        {
          id: crypto.randomUUID(),
          name: detected.merchant,
          category: detected.category,
          amount: total,
          date: today,
          qty: 1,
          unit: "pc",
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItemMode]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const updateRow = (id: string, patch: Partial<ScannedRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setScanned(false);
    setRows([]);
    setMerchant("");
  };

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
      toast.error((e as Error).message);
    }
  };

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" /> AI Bill Scanner
        </span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1">Scan & Log Receipts</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Drop a receipt and let AI extract the merchant, amount, and category — review, then log to your ledger.
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

          {!file ? (
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
                  Drag & drop or click to browse — PNG, JPG, PDF
                </p>
              </div>
            </button>
          ) : (
            <div className="relative w-full h-72 rounded-xl border border-border/60 overflow-hidden bg-muted/30 flex items-center justify-center">
              {previewUrl ? (
                <img src={previewUrl} alt="receipt" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <FileText className="w-12 h-12" />
                  <span className="text-sm">{file.name}</span>
                </div>
              )}

              {isScanning && (
                <>
                  <div className="absolute inset-0 bg-primary/5 backdrop-blur-[1px]" />
                  <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_20px_hsl(var(--primary))] animate-scan-line" />
                  <div className="absolute inset-x-0 bottom-3 flex items-center justify-center">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 border border-primary/30 text-xs font-medium text-primary">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      AI parsing receipt…
                    </div>
                  </div>
                </>
              )}

              {scanned && !isScanning && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-medium animate-fade-in">
                  <Check className="w-3.5 h-3.5" /> Verified
                </div>
              )}

              <button
                onClick={reset}
                className="absolute top-3 left-3 w-7 h-7 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />

          {merchant && scanned && (
            <div className="flex items-center justify-between text-sm rounded-lg bg-muted/30 border border-border/60 px-3 py-2">
              <span className="text-muted-foreground">Detected merchant</span>
              <span className="font-medium text-foreground">{merchant}</span>
            </div>
          )}
        </div>

        {/* Verification Ledger */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-foreground">Verification Ledger</h2>
            <span className="text-xs text-muted-foreground">
              {rows.length} item{rows.length === 1 ? "" : "s"} · ₹{total.toLocaleString("en-IN")}
            </span>
          </div>

          {!scanned ? (
            <div className="h-72 rounded-xl border border-dashed border-border/60 flex items-center justify-center text-sm text-muted-foreground">
              {isScanning ? "Extracting line items…" : "Upload a receipt to see extracted items here"}
            </div>
          ) : (
            <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
              {rows.map((r) => (
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
                      className="w-9 h-9 rounded-md border border-border/60 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
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
                      onValueChange={(v) => updateRow(r.id, { unit: v as Unit })}
                    >
                      <SelectTrigger className="h-9 text-xs col-span-2">
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
                    <Input
                      type="date"
                      value={r.date}
                      onChange={(e) => updateRow(r.id, { date: e.target.value })}
                      className="h-9 col-span-2"
                    />
                  </div>
                </div>
              ))}
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