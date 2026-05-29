import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { InvestmentRecord } from "@/lib/investmentsStore";

type AssetType =
  | "stocks"
  | "mutual_funds"
  | "bonds"
  | "fd"
  | "rd"
  | "pf"
  | "gold"
  | "real_estate"
  | "crypto";

type Currency = "INR" | "USD" | "AED";
type GoalLink = "Retirement" | "House Fund" | "Kid's Education" | "Emergency Stack";

const ASSET_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "stocks", label: "Direct Stocks" },
  { value: "mutual_funds", label: "Mutual Funds" },
  { value: "bonds", label: "Bonds" },
  { value: "fd", label: "Fixed Deposit" },
  { value: "rd", label: "Recurring Deposit" },
  { value: "pf", label: "Provident Fund / PF" },
  { value: "gold", label: "Gold" },
  { value: "real_estate", label: "Real Estate / Property" },
  { value: "crypto", label: "Crypto & Digital Assets" },
];

const GOALS: GoalLink[] = ["Retirement", "House Fund", "Kid's Education", "Emergency Stack"];

const safeNum = (v: string | number | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number, d = 2) => {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-IN", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
};

// Hoisted so identity is stable across renders — inline definitions caused
// the input to remount on every keystroke (focus loss + value stripping).
const NumberInput = ({
  id,
  placeholder,
  step,
  value,
  onChange,
}: {
  id: string;
  placeholder?: string;
  step?: string;
  value: string;
  onChange: (v: string) => void;
}) => {
  // Indian-format display (e.g. 1,00,000.50) while storing a plain numeric
  // string ("100000.5") in form state.
  const formatIndian = (raw: string) => {
    if (raw === "" || raw == null) return "";
    // Preserve a trailing "." while the user is typing decimals.
    const trailingDot = raw.endsWith(".") && !raw.slice(0, -1).includes(".");
    const [intPart, decPart] = raw.split(".");
    if (intPart === "" || intPart === "-") {
      return raw;
    }
    const neg = intPart.startsWith("-");
    const digits = neg ? intPart.slice(1) : intPart;
    if (!/^\d+$/.test(digits)) return raw;
    let formattedInt: string;
    if (digits.length <= 3) {
      formattedInt = digits;
    } else {
      const last3 = digits.slice(-3);
      const rest = digits.slice(0, -3);
      formattedInt = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
    }
    const signed = neg ? "-" + formattedInt : formattedInt;
    if (decPart !== undefined) return `${signed}.${decPart}`;
    if (trailingDot) return `${signed}.`;
    return signed;
  };
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder ?? "0.00"}
      value={formatIndian(value)}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/,/g, "");
        if (cleaned === "" || /^-?\d*\.?\d*$/.test(cleaned)) {
          onChange(cleaned);
        }
      }}
    />
  );
};

const OutputBox = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border bg-muted/40 px-3 py-2">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
    <div className="text-sm font-semibold text-foreground mt-0.5">{value}</div>
  </div>
);

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave?: (payload: InvestmentRecord) => void;
  initial?: InvestmentRecord | null;
};

export default function AddInvestmentDialog({
  open,
  onOpenChange,
  onSave,
  initial,
}: Props) {
  const isEdit = !!initial;
  const [asset, setAsset] = useState<AssetType>("stocks");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [goal, setGoal] = useState<GoalLink | "">("");
  const [form, setForm] = useState<Record<string, string>>({});
  // MF strategy
  const [mfMode, setMfMode] = useState<"SIP" | "Lumpsum">("Lumpsum");
  // Gold subtype
  const [goldType, setGoldType] = useState<"Physical Gold" | "SGB" | "Digital Gold">("Physical Gold");
  // Bond frequency
  const [bondFreq, setBondFreq] = useState<"Yearly" | "Monthly" | "Quarterly">("Yearly");
  // Stocks: which side was last edited (qty*price <-> totalInvested)
  const [stocksEdited, setStocksEdited] = useState<"derived" | "total">("derived");
  // Track whether the user manually edited "Current Value" — if not, we mirror
  // the Invested Amount into it live.
  const [currentTouched, setCurrentTouched] = useState(false);
  // Guards
  const skipNextAssetResetRef = useRef(false);
  const seededIdRef = useRef<string | null>(null);

  // Seed from `initial` when opening in edit mode
  useEffect(() => {
    if (!open) {
      seededIdRef.current = null;
      return;
    }
    if (initial && seededIdRef.current !== initial.id) {
      skipNextAssetResetRef.current = true;
      setAsset(initial.asset);
      setCurrency(initial.currency);
      setGoal(initial.goal ?? "");
      setForm(initial.fields ?? {});
      if (initial.mfMode) setMfMode(initial.mfMode);
      if (initial.goldType) setGoldType(initial.goldType);
      if (initial.bondFreq) setBondFreq(initial.bondFreq);
      setCurrentTouched(true);
      seededIdRef.current = initial.id;
    }
  }, [open, initial]);

  // Reset form when asset changes (skipped on initial seeding)
  useEffect(() => {
    if (skipNextAssetResetRef.current) {
      skipNextAssetResetRef.current = false;
      return;
    }
    setForm({});
    setStocksEdited("derived");
    setCurrentTouched(false);
    if (asset === "bonds" && !form.xirr) {
      setForm((f) => ({ ...f, xirr: "7.5" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  // Reset on close
  useEffect(() => {
    if (!open && !initial) {
      setAsset("stocks");
      setCurrency("INR");
      setGoal("");
      setForm({});
      setMfMode("Lumpsum");
      setGoldType("Physical Gold");
      setBondFreq("Yearly");
      setCurrentTouched(false);
    }
    if (!open && initial) {
      // Reset edit-mode state on close so a future "new" open starts clean.
      setAsset("stocks");
      setCurrency("INR");
      setGoal("");
      setForm({});
      setMfMode("Lumpsum");
      setGoldType("Physical Gold");
      setBondFreq("Yearly");
      setCurrentTouched(false);
    }
  }, [open, initial]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // ---------- Live calculations ----------
  const calc = useMemo(() => {
    switch (asset) {
      case "stocks": {
        const qty = safeNum(form.qty);
        const buy = safeNum(form.buy);
        const total = stocksEdited === "total" ? safeNum(form.total) : qty * buy;
        const avg = qty > 0 ? total / qty : 0;
        return { total, avg };
      }
      case "mutual_funds": {
        const invested = safeNum(form.invested);
        const units = safeNum(form.units);
        const nav = safeNum(form.nav);
        const avgNav = units > 0 ? invested / units : 0;
        const currentValue = units * nav;
        return { avgNav, currentValue };
      }
      case "fd": {
        const p = safeNum(form.deposit);
        const r = safeNum(form.rate);
        // Simple compounded yearly maturity assuming 5y default tenure
        const tenure = safeNum(form.tenure) || 5;
        const maturity = p * Math.pow(1 + r / 100, tenure);
        return { maturity, tenure };
      }
      case "rd": {
        const m = safeNum(form.monthly);
        const months = safeNum(form.months);
        const r = safeNum(form.rate) || 6.5;
        const principal = m * months;
        // RD maturity approx: sum of monthly compounded
        let maturity = 0;
        const monthlyRate = r / 12 / 100;
        for (let i = 1; i <= months; i++) {
          maturity += m * Math.pow(1 + monthlyRate, months - i + 1);
        }
        return { principal, maturity };
      }
      case "pf": {
        const ee = safeNum(form.employee);
        const er = safeNum(form.employer);
        const total = safeNum(form.balance) || ee + er;
        return { contribTotal: ee + er, total };
      }
      case "gold": {
        const qty = safeNum(form.grams);
        const buy = safeNum(form.buy);
        const cur = safeNum(form.current);
        return { invested: qty * buy, currentValue: qty * cur };
      }
      case "real_estate": {
        const pv = safeNum(form.purchase);
        const fees = safeNum(form.fees);
        return { totalCost: pv + fees, current: safeNum(form.current) };
      }
      case "crypto": {
        const q = safeNum(form.qty);
        const p = safeNum(form.buy);
        return { invested: q * p };
      }
      case "bonds": {
        return { current: safeNum(form.current) };
      }
      default:
        return {};
    }
  }, [asset, form, stocksEdited]);

  const CurrencyBadge = () => (
    <Badge variant="outline" className="ml-2 text-[10px] font-medium">
      {currency}
    </Badge>
  );

  // Bound helper for the common case: read/write a key on `form`.
  const N = (id: string, placeholder?: string, step?: string) => (
    <NumberInput
      id={id}
      placeholder={placeholder}
      step={step}
      value={form[id] ?? ""}
      onChange={(v) => set(id, v)}
    />
  );

  // ---------- Per-asset form bodies ----------
  const renderForm = () => {
    switch (asset) {
      case "stocks":
        return (
          <div className="space-y-4">
            <Field label="Investment Name">
              <Input
                placeholder="e.g. Infosys Ltd"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Ticker (Google Finance format)">
              <Input
                placeholder="e.g. NSE:RELIANCE, BOM:500325, NASDAQ:AAPL"
                value={form.ticker ?? ""}
                onChange={(e) => set("ticker", e.target.value.toUpperCase())}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Buying Price<CurrencyBadge /></>}>
                <NumberInput
                  id="buy"
                  placeholder="0.00"
                  value={form.buy ?? ""}
                  onChange={(v) => {
                    set("buy", v);
                    setStocksEdited("derived");
                  }}
                />
              </Field>
              <Field label="Quantity">
                <NumberInput
                  id="qty"
                  placeholder="0"
                  value={form.qty ?? ""}
                  onChange={(v) => {
                    set("qty", v);
                    setStocksEdited("derived");
                  }}
                />
              </Field>
            </div>
            <Field label={<>Total Invested (override)<CurrencyBadge /></>}>
              <NumberInput
                id="total"
                placeholder={fmt(calc.total ?? 0)}
                value={stocksEdited === "total" ? form.total ?? "" : ""}
                onChange={(v) => {
                  set("total", v);
                  setStocksEdited("total");
                  // If overridden, back-fill price = total/qty
                  const qty = safeNum(form.qty);
                  if (qty > 0) set("buy", String(safeNum(v) / qty));
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <OutputBox label="Total Invested" value={fmt(calc.total ?? 0)} />
              <OutputBox label="Buying Avg" value={fmt(calc.avg ?? 0)} />
            </div>
          </div>
        );

      case "mutual_funds":
        return (
          <div className="space-y-4">
            <div className="inline-flex rounded-lg bg-primary/10 p-1">
              {(["SIP", "Lumpsum"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMfMode(m)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mfMode === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <Field label="Investment Name">
              <Input
                placeholder="e.g. Parag Parikh Flexi Cap"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="MFAPI Scheme Code (for live NAV)">
              <Input
                placeholder="e.g. 122639 — from api.mfapi.in"
                value={form.scheme ?? ""}
                onChange={(e) => set("scheme", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Total Invested<CurrencyBadge /></>}>
                {N("invested", "0.00")}
              </Field>
              <Field label="Total Units">
                {N("units", "0.000")}
              </Field>
            </div>
            <Field label={<>Current NAV<CurrencyBadge /></>}>
              {N("nav", "0.00")}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <OutputBox label="Avg NAV" value={fmt(calc.avgNav ?? 0, 4)} />
              <OutputBox label="Current Value" value={fmt(calc.currentValue ?? 0)} />
            </div>
          </div>
        );

      case "bonds":
        return (
          <div className="space-y-4">
            <Field label="Investment Name">
              <Input
                placeholder="e.g. RBI Floating Rate Bond"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Invested Amount<CurrencyBadge /></>}>
                <NumberInput
                  id="invested"
                  placeholder="0.00"
                  value={form.invested ?? ""}
                  onChange={(v) => {
                    set("invested", v);
                    if (!currentTouched) set("current", v);
                  }}
                />
              </Field>
              <Field label="XIRR (%)">
                {N("xirr", "7.5")}
              </Field>
            </div>
            <Field label="Interest Payment Frequency">
              <Select value={bondFreq} onValueChange={(v) => setBondFreq(v as typeof bondFreq)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yearly">Yearly</SelectItem>
                  <SelectItem value="Quarterly">Quarterly</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={<>Current Value<CurrencyBadge /></>}>
              <NumberInput
                id="current"
                placeholder="0.00"
                value={form.current ?? ""}
                onChange={(v) => {
                  setCurrentTouched(true);
                  set("current", v);
                }}
              />
            </Field>
          </div>
        );

      case "fd":
        return (
          <div className="space-y-4">
            <Field label="Bank Name">
              <Input
                placeholder="e.g. HDFC Bank"
                value={form.bank ?? ""}
                onChange={(e) => set("bank", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Deposit Amount<CurrencyBadge /></>}>
                {N("deposit", "0.00")}
              </Field>
              <Field label="Interest Rate (%)">
                {N("rate", "0.00")}
              </Field>
            </div>
            <Field label="Tenure (Years)">
              {N("tenure", "5")}
            </Field>
            <OutputBox
              label={`Maturity Value (after ${calc.tenure ?? 5}y)`}
              value={fmt(calc.maturity ?? 0)}
            />
          </div>
        );

      case "rd":
        return (
          <div className="space-y-4">
            <Field label="Bank Name">
              <Input
                placeholder="e.g. SBI"
                value={form.bank ?? ""}
                onChange={(e) => set("bank", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Monthly Installment<CurrencyBadge /></>}>
                {N("monthly", "0.00")}
              </Field>
              <Field label="Duration (Months)">
                {N("months", "12")}
              </Field>
            </div>
            <Field label="Interest Rate (% p.a.)">
              {N("rate", "6.5")}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <OutputBox label="Total Principal" value={fmt(calc.principal ?? 0)} />
              <OutputBox label="Maturity Value" value={fmt(calc.maturity ?? 0)} />
            </div>
          </div>
        );

      case "pf":
        return (
          <div className="space-y-4">
            <Field label="Investment Name">
              <Input
                placeholder="e.g. EPF — Company X"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Employee Contrib.<CurrencyBadge /></>}>
                {N("employee", "0.00")}
              </Field>
              <Field label={<>Employer Contrib.<CurrencyBadge /></>}>
                {N("employer", "0.00")}
              </Field>
            </div>
            <Field label={<>Current Total Balance<CurrencyBadge /></>}>
              {N("balance", "0.00")}
            </Field>
            <OutputBox label="Contributions Total" value={fmt(calc.contribTotal ?? 0)} />
          </div>
        );

      case "gold":
        return (
          <div className="space-y-4">
            <Field label="Gold Type">
              <Select value={goldType} onValueChange={(v) => setGoldType(v as typeof goldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Physical Gold">Physical Gold</SelectItem>
                  <SelectItem value="SGB">Sovereign Gold Bond (SGB)</SelectItem>
                  <SelectItem value="Digital Gold">Digital Gold</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quantity (Grams)">
              {N("grams", "0.000")}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Buying Price (/g)<CurrencyBadge /></>}>
                {N("buy", "0.00")}
              </Field>
              <Field label={<>Current Price (/g)<CurrencyBadge /></>}>
                {N("current", "0.00")}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <OutputBox label="Total Invested" value={fmt(calc.invested ?? 0)} />
              <OutputBox label="Current Value" value={fmt(calc.currentValue ?? 0)} />
            </div>
          </div>
        );

      case "real_estate":
        return (
          <div className="space-y-4">
            <Field label="Property Name">
              <Input
                placeholder="e.g. Bengaluru Flat"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Purchase Value<CurrencyBadge /></>}>
                {N("purchase", "0.00")}
              </Field>
              <Field label={<>Registration / Setup Fees<CurrencyBadge /></>}>
                {N("fees", "0.00")}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Current Market Value<CurrencyBadge /></>}>
                {N("current", "0.00")}
              </Field>
              <Field label={<>Monthly Rental Yield<CurrencyBadge /></>}>
                {N("rent", "0.00")}
              </Field>
            </div>
            <OutputBox label="Total Cost Basis" value={fmt(calc.totalCost ?? 0)} />
          </div>
        );

      case "crypto":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Token Ticker">
                <Input
                  placeholder="BTC-USD, ETH-USD, SOL-USD…"
                  value={form.ticker ?? ""}
                  onChange={(e) => set("ticker", e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Exchange Platform">
                <Input
                  placeholder="e.g. CoinDCX"
                  value={form.platform ?? ""}
                  onChange={(e) => set("platform", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>Buy Price<CurrencyBadge /></>}>
                {N("buy", "0.00")}
              </Field>
              <Field label="Quantity">
                {N("qty", "0.00000000", "0.00000001")}
              </Field>
            </div>
            <OutputBox label="Total Invested" value={fmt(calc.invested ?? 0)} />
          </div>
        );
    }
  };

  const handleSave = () => {
    if (!asset) return;
    const payload: InvestmentRecord = {
      id: initial?.id ?? (crypto.randomUUID?.() ?? `inv_${Date.now()}`),
      asset,
      currency,
      goal: goal || null,
      mfMode: asset === "mutual_funds" ? mfMode : undefined,
      goldType: asset === "gold" ? goldType : undefined,
      bondFreq: asset === "bonds" ? bondFreq : undefined,
      fields: form,
      derived: calc as Record<string, number>,
      savedAt: initial?.savedAt ?? new Date().toISOString(),
    };
    onSave?.(payload);
    toast({
      title: isEdit ? "Investment updated" : "Investment saved",
      description: `${ASSET_OPTIONS.find((a) => a.value === asset)?.label} ${
        isEdit ? "record updated." : "added to your portfolio."
      }`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modify Investment Record" : "Add New Investment"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the saved details for this asset. Calculations update live as you type."
              : "Track a new asset in your portfolio. Calculations update live as you type."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Asset Type">
              <Select value={asset} onValueChange={(v) => setAsset(v as AssetType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR ₹</SelectItem>
                  <SelectItem value="USD">USD $</SelectItem>
                  <SelectItem value="AED">AED د.إ</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="border-t pt-4">{renderForm()}</div>

          <div className="border-t pt-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Link to Financial Goal
            </Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {GOALS.map((g) => {
                const active = goal === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGoal(active ? "" : g)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:text-foreground border-border"
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <Button onClick={handleSave} className="w-full" size="lg">
            {isEdit ? "Update Investment Record" : "Save Investment Record"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center">
        {label}
      </Label>
      {children}
    </div>
  );
}