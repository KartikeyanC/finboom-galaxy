import { useMemo, useState } from "react";
import { Calculator as CalcIcon, Landmark, PiggyBank, LineChart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-secondary/30 p-4">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-display">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function FDCalc() {
  const [p, setP] = useState("100000");
  const [r, setR] = useState("7.1");
  const [y, setY] = useState("5");
  const { maturity, interest } = useMemo(() => {
    const P = Number(p) || 0, R = Number(r) / 100, Y = Number(y) || 0;
    const M = P * Math.pow(1 + R / 4, 4 * Y);
    return { maturity: M, interest: M - P };
  }, [p, r, y]);
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div><Label>Principal (₹)</Label><Input value={p} onChange={(e) => setP(e.target.value)} type="number" /></div>
        <div><Label>Interest rate (% p.a.)</Label><Input value={r} onChange={(e) => setR(e.target.value)} type="number" step="0.1" /></div>
        <div><Label>Tenure (years)</Label><Input value={y} onChange={(e) => setY(e.target.value)} type="number" /></div>
      </div>
      <div className="space-y-3">
        <ResultCard label="Maturity Value" value={inr(maturity)} />
        <ResultCard label="Interest Earned" value={inr(interest)} />
      </div>
    </div>
  );
}

function BondCalc() {
  const [face, setFace] = useState("1000");
  const [coupon, setCoupon] = useState("8");
  const [years, setYears] = useState("10");
  const [ytm, setYtm] = useState("7");
  const { price, annual } = useMemo(() => {
    const F = Number(face) || 0, C = (Number(coupon) / 100) * F, Y = Number(ytm) / 100, n = Number(years) || 0;
    if (Y === 0) return { price: F + C * n, annual: C };
    const pv = C * (1 - Math.pow(1 + Y, -n)) / Y + F / Math.pow(1 + Y, n);
    return { price: pv, annual: C };
  }, [face, coupon, years, ytm]);
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div><Label>Face value (₹)</Label><Input value={face} onChange={(e) => setFace(e.target.value)} type="number" /></div>
        <div><Label>Coupon (% p.a.)</Label><Input value={coupon} onChange={(e) => setCoupon(e.target.value)} type="number" step="0.1" /></div>
        <div><Label>Years to maturity</Label><Input value={years} onChange={(e) => setYears(e.target.value)} type="number" /></div>
        <div><Label>YTM (%)</Label><Input value={ytm} onChange={(e) => setYtm(e.target.value)} type="number" step="0.1" /></div>
      </div>
      <div className="space-y-3">
        <ResultCard label="Fair Price" value={inr(price)} />
        <ResultCard label="Annual Coupon" value={inr(annual)} />
      </div>
    </div>
  );
}

function MFCalc() {
  const [sip, setSip] = useState("10000");
  const [r, setR] = useState("12");
  const [y, setY] = useState("10");
  const { future, invested, gain } = useMemo(() => {
    const P = Number(sip) || 0, i = Number(r) / 100 / 12, n = (Number(y) || 0) * 12;
    const F = i === 0 ? P * n : P * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
    const inv = P * n;
    return { future: F, invested: inv, gain: F - inv };
  }, [sip, r, y]);
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div><Label>Monthly SIP (₹)</Label><Input value={sip} onChange={(e) => setSip(e.target.value)} type="number" /></div>
        <div><Label>Expected return (% p.a.)</Label><Input value={r} onChange={(e) => setR(e.target.value)} type="number" step="0.1" /></div>
        <div><Label>Duration (years)</Label><Input value={y} onChange={(e) => setY(e.target.value)} type="number" /></div>
      </div>
      <div className="space-y-3">
        <ResultCard label="Future Value" value={inr(future)} />
        <ResultCard label="Total Invested" value={inr(invested)} />
        <ResultCard label="Estimated Gain" value={inr(gain)} />
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1100px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Tools</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
          <CalcIcon className="w-7 h-7" /> Investment Calculators
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Quick estimates for fixed deposits, bonds, and mutual fund SIPs.
        </p>
      </header>
      <div className="glass-card p-6">
        <Tabs defaultValue="fd">
          <TabsList className="mb-6">
            <TabsTrigger value="fd"><Landmark className="w-4 h-4 mr-2" />FD</TabsTrigger>
            <TabsTrigger value="bond"><LineChart className="w-4 h-4 mr-2" />Bond</TabsTrigger>
            <TabsTrigger value="mf"><PiggyBank className="w-4 h-4 mr-2" />Mutual Fund</TabsTrigger>
          </TabsList>
          <TabsContent value="fd"><FDCalc /></TabsContent>
          <TabsContent value="bond"><BondCalc /></TabsContent>
          <TabsContent value="mf"><MFCalc /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}