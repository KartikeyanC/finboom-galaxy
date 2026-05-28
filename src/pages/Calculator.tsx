import { useMemo, useState } from "react";
import {
  Calculator as CalcIcon,
  TrendingDown,
  PiggyBank,
  LineChart,
  Target,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ------------------------------ helpers ------------------------------ */

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const DASH = "--";

function num(v: string): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  if (!isFinite(n) || isNaN(n)) return null;
  return n;
}

function ResultCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
      ? "text-rose-400"
      : "text-foreground";
  return (
    <div className="rounded-lg border border-border/40 bg-secondary/30 p-4">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-display">
        {label}
      </div>
      <div className={`mt-1 font-display text-2xl font-bold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  prefix?: string;
}) {
  const n = num(value);
  const sliderVal = n === null ? min : Math.min(Math.max(n, min), max);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="text-xs text-muted-foreground">
          {prefix}
          {(n ?? 0).toLocaleString("en-IN")}
          {suffix}
        </div>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="number"
        step={step}
      />
      <Slider
        value={[sliderVal]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(String(vals[0]))}
      />
    </div>
  );
}

/* --------------------- 1. Stock Average Down --------------------- */

function AverageDownCalc() {
  const [u1, setU1] = useState("100");
  const [p1, setP1] = useState("250");
  const [u2, setU2] = useState("50");
  const [p2, setP2] = useState("200");

  const { totalInv, totalUnits, avgPrice } = useMemo(() => {
    const U1 = num(u1), P1 = num(p1), U2 = num(u2), P2 = num(p2);
    if (U1 === null || P1 === null || U2 === null || P2 === null) {
      return { totalInv: null, totalUnits: null, avgPrice: null };
    }
    const inv = U1 * P1 + U2 * P2;
    const units = U1 + U2;
    return {
      totalInv: inv,
      totalUnits: units,
      avgPrice: units > 0 ? inv / units : null,
    };
  }, [u1, p1, u2, p2]);

  const clear = () => {
    setU1(""); setP1(""); setU2(""); setP2("");
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <div className="rounded-lg border border-border/40 bg-secondary/20 p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
            First Purchase
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Units / Shares</Label>
              <Input value={u1} onChange={(e) => setU1(e.target.value)} type="number" placeholder="0" />
            </div>
            <div>
              <Label>Price Per Share</Label>
              <Input value={p1} onChange={(e) => setP1(e.target.value)} type="number" placeholder="0" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/40 bg-secondary/20 p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
            Second Purchase (The Dip)
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Units / Shares</Label>
              <Input value={u2} onChange={(e) => setU2(e.target.value)} type="number" placeholder="0" />
            </div>
            <div>
              <Label>Price Per Share</Label>
              <Input value={p2} onChange={(e) => setP2(e.target.value)} type="number" placeholder="0" />
            </div>
          </div>
        </div>

        <Button variant="outline" onClick={clear} className="w-full">
          <RotateCcw className="w-4 h-4 mr-2" /> Clear Fields
        </Button>
      </div>

      <div className="space-y-3">
        <ResultCard label="Total Investment" value={totalInv === null ? DASH : inr(totalInv)} />
        <ResultCard
          label="Total Units Held"
          value={totalUnits === null ? DASH : totalUnits.toLocaleString("en-IN")}
        />
        <ResultCard
          label="Average Price Per Share"
          value={avgPrice === null ? DASH : inr(avgPrice)}
        />
      </div>
    </div>
  );
}

/* --------------------------- 2. SIP --------------------------- */

function PieBreakdown({ invested, gain }: { invested: number; gain: number }) {
  const total = invested + gain;
  if (total <= 0) return null;
  const investedPct = (invested / total) * 100;
  const gainPct = 100 - investedPct;
  const bg = `conic-gradient(hsl(var(--primary)) 0 ${investedPct}%, hsl(var(--accent, var(--primary))) ${investedPct}% 100%)`;
  return (
    <div className="rounded-lg border border-border/40 bg-secondary/30 p-4 flex items-center gap-4">
      <div
        className="w-24 h-24 rounded-full shrink-0"
        style={{ background: bg, WebkitMask: "radial-gradient(circle, transparent 30px, black 31px)", mask: "radial-gradient(circle, transparent 30px, black 31px)" }}
      />
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-primary" />
          <span className="text-muted-foreground">Invested</span>
          <span className="ml-auto font-semibold">{investedPct.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-emerald-400" />
          <span className="text-muted-foreground">Returns</span>
          <span className="ml-auto font-semibold">{gainPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function SIPCalc() {
  const [sip, setSip] = useState("10000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("10");

  const { invested, gain, future } = useMemo(() => {
    const P = num(sip), R = num(rate), Y = num(years);
    if (P === null || R === null || Y === null || P <= 0 || Y <= 0) {
      return { invested: null, gain: null, future: null };
    }
    const i = R / 100 / 12;
    const n = Y * 12;
    const F = i === 0 ? P * n : P * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
    const inv = P * n;
    return { invested: inv, gain: F - inv, future: F };
  }, [sip, rate, years]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <SliderField label="Monthly Investment (₹)" value={sip} onChange={setSip} min={500} max={200000} step={500} prefix="₹" />
        <SliderField label="Expected Annual Return (%)" value={rate} onChange={setRate} min={1} max={30} step={0.1} suffix="%" />
        <SliderField label="Time Period (Years)" value={years} onChange={setYears} min={1} max={40} step={1} suffix=" yrs" />
      </div>
      <div className="space-y-3">
        <ResultCard label="Total Amount Invested" value={invested === null ? DASH : inr(invested)} />
        <ResultCard label="Estimated Wealth Gained" value={gain === null ? DASH : inr(gain)} tone="positive" />
        <ResultCard label="Future Wealth Value" value={future === null ? DASH : inr(future)} />
        {invested !== null && gain !== null && gain > 0 && (
          <PieBreakdown invested={invested} gain={gain} />
        )}
      </div>
    </div>
  );
}

/* --------------------------- 3. CAGR --------------------------- */

function CAGRCalc() {
  const [initial, setInitial] = useState("100000");
  const [final, setFinal] = useState("250000");
  const [years, setYears] = useState("5");

  const { absPct, cagr } = useMemo(() => {
    const I = num(initial), F = num(final), Y = num(years);
    if (I === null || F === null || Y === null || I <= 0 || Y <= 0) {
      return { absPct: null, cagr: null };
    }
    const abs = ((F - I) / I) * 100;
    const c = (Math.pow(F / I, 1 / Y) - 1) * 100;
    return { absPct: abs, cagr: c };
  }, [initial, final, years]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <SliderField label="Initial Investment (₹)" value={initial} onChange={setInitial} min={1000} max={10000000} step={1000} prefix="₹" />
        <SliderField label="Final Value (₹)" value={final} onChange={setFinal} min={1000} max={50000000} step={1000} prefix="₹" />
        <SliderField label="Duration (Years)" value={years} onChange={setYears} min={1} max={40} step={1} suffix=" yrs" />
      </div>
      <div className="space-y-3">
        <ResultCard
          label="Absolute Growth"
          value={absPct === null ? DASH : `${absPct.toFixed(2)}%`}
          tone={absPct !== null && absPct < 0 ? "negative" : "positive"}
        />
        <ResultCard
          label="CAGR (Annualized)"
          value={cagr === null ? DASH : `${cagr.toFixed(2)}%`}
          tone={cagr !== null && cagr < 0 ? "negative" : "positive"}
        />
      </div>
    </div>
  );
}

/* --------------------- 4. Profit & Loss --------------------- */

function PnLCalc() {
  const [buy, setBuy] = useState("100");
  const [sell, setSell] = useState("125");
  const [qty, setQty] = useState("50");
  const [fees, setFees] = useState("0.5");

  const { pnl, roi } = useMemo(() => {
    const B = num(buy), S = num(sell), Q = num(qty);
    const FeePct = num(fees) ?? 0;
    if (B === null || S === null || Q === null || B <= 0 || Q <= 0) {
      return { pnl: null, roi: null };
    }
    const gross = (S - B) * Q;
    const turnover = (B + S) * Q;
    const feeCost = (FeePct / 100) * turnover;
    const net = gross - feeCost;
    const invested = B * Q;
    return { pnl: net, roi: (net / invested) * 100 };
  }, [buy, sell, qty, fees]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div>
          <Label>Buy Price</Label>
          <Input value={buy} onChange={(e) => setBuy(e.target.value)} type="number" />
        </div>
        <div>
          <Label>Sell Price</Label>
          <Input value={sell} onChange={(e) => setSell(e.target.value)} type="number" />
        </div>
        <div>
          <Label>Quantity</Label>
          <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" />
        </div>
        <div>
          <Label>Brokerage / Taxes (%) — optional</Label>
          <Input value={fees} onChange={(e) => setFees(e.target.value)} type="number" step="0.01" />
        </div>
      </div>
      <div className="space-y-3">
        <ResultCard
          label="Net Profit / Loss"
          value={pnl === null ? DASH : inr(pnl)}
          tone={pnl === null ? "default" : pnl >= 0 ? "positive" : "negative"}
        />
        <ResultCard
          label="Return on Investment (ROI)"
          value={roi === null ? DASH : `${roi.toFixed(2)}%`}
          tone={roi === null ? "default" : roi >= 0 ? "positive" : "negative"}
        />
      </div>
    </div>
  );
}

/* --------------------------- page --------------------------- */

export default function CalculatorPage() {
  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1200px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
          Tools
        </span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
          <CalcIcon className="w-7 h-7" /> Investment Calculator Suite
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Institutional-grade calculators for averaging down, SIPs, CAGR, and P&L targets.
        </p>
      </header>

      <div className="glass-card p-6">
        <Tabs defaultValue="avg">
          <TabsList className="mb-6 flex flex-wrap h-auto">
            <TabsTrigger value="avg"><TrendingDown className="w-4 h-4 mr-2" />Average Down</TabsTrigger>
            <TabsTrigger value="sip"><PiggyBank className="w-4 h-4 mr-2" />SIP</TabsTrigger>
            <TabsTrigger value="cagr"><LineChart className="w-4 h-4 mr-2" />CAGR</TabsTrigger>
            <TabsTrigger value="pnl"><Target className="w-4 h-4 mr-2" />Profit / Loss</TabsTrigger>
          </TabsList>
          <TabsContent value="avg"><AverageDownCalc /></TabsContent>
          <TabsContent value="sip"><SIPCalc /></TabsContent>
          <TabsContent value="cagr"><CAGRCalc /></TabsContent>
          <TabsContent value="pnl"><PnLCalc /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}