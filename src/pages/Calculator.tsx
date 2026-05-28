import { useMemo, useState } from "react";
import {
  Calculator as CalcIcon,
  TrendingDown,
  PiggyBank,
  LineChart,
  Target,
  RotateCcw,
  Wallet,
  Split,
  Timer,
  Percent,
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
  const [stepUp, setStepUp] = useState("10");

  const { invested, gain, future } = useMemo(() => {
    const P = num(sip), R = num(rate), Y = num(years);
    const S = num(stepUp) ?? 0;
    if (P === null || R === null || Y === null || P <= 0 || Y <= 0) {
      return { invested: null, gain: null, future: null };
    }
    const i = R / 100 / 12;
    const step = S / 100;
    let monthly = P;
    let future = 0;
    let inv = 0;
    for (let y = 0; y < Y; y++) {
      for (let m = 0; m < 12; m++) {
        future = (future + monthly) * (1 + i);
        inv += monthly;
      }
      monthly = monthly * (1 + step);
    }
    return { invested: inv, gain: future - inv, future };
  }, [sip, rate, years, stepUp]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <SliderField label="Monthly Investment (₹)" value={sip} onChange={setSip} min={500} max={200000} step={500} prefix="₹" />
        <SliderField label="Expected Annual Return (%)" value={rate} onChange={setRate} min={1} max={30} step={0.1} suffix="%" />
        <SliderField label="Time Period (Years)" value={years} onChange={setYears} min={1} max={40} step={1} suffix=" yrs" />
        <SliderField label="Annual Step-Up (%)" value={stepUp} onChange={setStepUp} min={0} max={50} step={1} suffix="%" />
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

/* --------------------------- 4. SWP --------------------------- */

function SWPCalc() {
  const [lump, setLump] = useState("1000000");
  const [withdraw, setWithdraw] = useState("10000");
  const [rate, setRate] = useState("8");
  const [months, setMonths] = useState("120");

  const { totalPayout, remaining } = useMemo(() => {
    const L = num(lump), W = num(withdraw), R = num(rate), M = num(months);
    if (L === null || W === null || R === null || M === null || L <= 0 || M <= 0) {
      return { totalPayout: null, remaining: null };
    }
    const i = R / 100 / 12;
    let bal = L;
    let paid = 0;
    for (let m = 0; m < M; m++) {
      bal = bal * (1 + i) - W;
      paid += W;
      if (bal < 0) {
        paid += bal; // reduce overpaid
        bal = 0;
        break;
      }
    }
    return { totalPayout: paid, remaining: bal };
  }, [lump, withdraw, rate, months]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <SliderField label="Lump-Sum Investment (₹)" value={lump} onChange={setLump} min={10000} max={50000000} step={10000} prefix="₹" />
        <SliderField label="Monthly Withdrawal (₹)" value={withdraw} onChange={setWithdraw} min={500} max={500000} step={500} prefix="₹" />
        <SliderField label="Annual Interest Rate (%)" value={rate} onChange={setRate} min={1} max={20} step={0.1} suffix="%" />
        <SliderField label="Withdrawal Period (Months)" value={months} onChange={setMonths} min={1} max={480} step={1} suffix=" mo" />
      </div>
      <div className="space-y-3">
        <ResultCard label="Total Payout Received" value={totalPayout === null ? DASH : inr(totalPayout)} tone="positive" />
        <ResultCard
          label="Remaining Balance"
          value={remaining === null ? DASH : inr(remaining)}
          tone={remaining === null ? "default" : remaining > 0 ? "positive" : "negative"}
        />
      </div>
    </div>
  );
}

/* ---------------------- 5. Stock Split ---------------------- */

function StockSplitCalc() {
  const [price, setPrice] = useState("1000");
  const [shares, setShares] = useState("100");
  const [oldR, setOldR] = useState("2");
  const [newR, setNewR] = useState("5");

  const { newPrice, newShares, fractional } = useMemo(() => {
    const P = num(price), S = num(shares), O = num(oldR), N = num(newR);
    if (P === null || S === null || O === null || N === null || O <= 0 || N <= 0) {
      return { newPrice: null, newShares: null, fractional: null };
    }
    const np = P * (O / N);
    const totalNew = S * (N / O);
    const whole = Math.floor(totalNew);
    const frac = totalNew - whole;
    return { newPrice: np, newShares: whole, fractional: frac * np };
  }, [price, shares, oldR, newR]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div>
          <Label>Current Stock Price (₹)</Label>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" />
        </div>
        <div>
          <Label>Current Shares Owned</Label>
          <Input value={shares} onChange={(e) => setShares(e.target.value)} type="number" />
        </div>
        <div className="rounded-lg border border-border/40 bg-secondary/20 p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
            Split Ratio (Old : New)
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Old Shares</Label>
              <Input value={oldR} onChange={(e) => setOldR(e.target.value)} type="number" />
            </div>
            <div>
              <Label>New Shares</Label>
              <Input value={newR} onChange={(e) => setNewR(e.target.value)} type="number" />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <ResultCard label="Adjusted Price Per Share" value={newPrice === null ? DASH : inr(newPrice)} />
        <ResultCard
          label="Total Shares After Split"
          value={newShares === null ? DASH : newShares.toLocaleString("en-IN")}
        />
        <ResultCard
          label="Fractional Cash Refund"
          value={fractional === null ? DASH : inr(fractional)}
        />
      </div>
    </div>
  );
}

/* --------------------- 6. Rule of 72 --------------------- */

function Rule72Calc() {
  const [rate, setRate] = useState("8");

  const { years, months } = useMemo(() => {
    const R = num(rate);
    if (R === null || R <= 0) return { years: null, months: null };
    const total = 72 / R;
    const y = Math.floor(total);
    const m = Math.round((total - y) * 12);
    return { years: y, months: m };
  }, [rate]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <SliderField label="Annual Interest Rate (%)" value={rate} onChange={setRate} min={1} max={30} step={0.1} suffix="%" />
        <p className="text-xs text-muted-foreground">
          Rule of 72: an approximation of how long an investment takes to double at a fixed annual return.
        </p>
      </div>
      <div className="space-y-3">
        <ResultCard
          label="Years to Double"
          value={years === null ? DASH : `${years} yr ${months} mo`}
          tone="positive"
        />
        <ResultCard
          label="Exact Duration"
          value={years === null ? DASH : `${(72 / (num(rate) ?? 1)).toFixed(2)} years`}
        />
      </div>
    </div>
  );
}

/* ---------------- 7. Percentage / Spread ---------------- */

function PercentageCalc() {
  const [x, setX] = useState("10");
  const [y, setY] = useState("250");

  const { xOfY, increase, decrease, fraction } = useMemo(() => {
    const X = num(x), Y = num(y);
    if (X === null || Y === null) {
      return { xOfY: null, increase: null, decrease: null, fraction: null };
    }
    const xy = (X / 100) * Y;
    const inc = Y + xy;
    const dec = Y - xy;
    const frac = Y === 0 ? null : (X / Y) * 100;
    return { xOfY: xy, increase: inc, decrease: dec, fraction: frac };
  }, [x, y]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div>
          <Label>Value X (%)</Label>
          <Input value={x} onChange={(e) => setX(e.target.value)} type="number" />
        </div>
        <div>
          <Label>Benchmark Y</Label>
          <Input value={y} onChange={(e) => setY(e.target.value)} type="number" />
        </div>
      </div>
      <div className="space-y-3">
        <ResultCard
          label="X% of Y"
          value={xOfY === null ? DASH : xOfY.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        />
        <ResultCard
          label="Target +X% (Profit)"
          value={increase === null ? DASH : increase.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          tone="positive"
        />
        <ResultCard
          label="Target -X% (Stop Loss)"
          value={decrease === null ? DASH : decrease.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          tone="negative"
        />
        <ResultCard
          label="X as % of Y"
          value={fraction === null ? DASH : `${fraction.toFixed(2)}%`}
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
          <div className="mb-6 -mx-1 overflow-x-auto">
            <TabsList className="inline-flex w-max flex-nowrap h-auto">
              <TabsTrigger value="avg" className="whitespace-nowrap"><TrendingDown className="w-4 h-4 mr-2" />Average Down</TabsTrigger>
              <TabsTrigger value="sip" className="whitespace-nowrap"><PiggyBank className="w-4 h-4 mr-2" />Step-Up SIP</TabsTrigger>
              <TabsTrigger value="swp" className="whitespace-nowrap"><Wallet className="w-4 h-4 mr-2" />SWP</TabsTrigger>
              <TabsTrigger value="cagr" className="whitespace-nowrap"><LineChart className="w-4 h-4 mr-2" />CAGR</TabsTrigger>
              <TabsTrigger value="split" className="whitespace-nowrap"><Split className="w-4 h-4 mr-2" />Stock Split</TabsTrigger>
              <TabsTrigger value="r72" className="whitespace-nowrap"><Timer className="w-4 h-4 mr-2" />Rule of 72</TabsTrigger>
              <TabsTrigger value="pct" className="whitespace-nowrap"><Percent className="w-4 h-4 mr-2" />Percentage</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="avg"><AverageDownCalc /></TabsContent>
          <TabsContent value="sip"><SIPCalc /></TabsContent>
          <TabsContent value="swp"><SWPCalc /></TabsContent>
          <TabsContent value="cagr"><CAGRCalc /></TabsContent>
          <TabsContent value="split"><StockSplitCalc /></TabsContent>
          <TabsContent value="r72"><Rule72Calc /></TabsContent>
          <TabsContent value="pct"><PercentageCalc /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}