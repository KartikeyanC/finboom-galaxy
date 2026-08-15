import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion, AnimatePresence, useReducedMotion,
  useMotionValue, useSpring, type Variants,
} from "framer-motion";
import {
  ArrowUpRight, ArrowDownRight, Check,
  Target, TrendingUp, Wallet, Sparkles, Search,
  Receipt, ScanLine, Bell, Layers,
} from "lucide-react";

import { CountUp } from "./primitives";

/**
 * The hero's fake product preview — split out of Landing.tsx in Stage 4.13.
 *
 * Eight invented screens (overview, income, expenses, scanner, reminders,
 * investments, budget, goals) that auto-advance behind a tilting glass card.
 * It was ~480 lines — by far the largest thing in Landing.tsx — and none of it
 * is content: the whole subtree is `aria-hidden` at the call site precisely
 * because the balances and holdings here are invented (Stage 4.7 / BUG-053).
 *
 * Everything it needs is local. The numbers below are marketing props, NOT
 * fixtures — nothing here should ever be imported by real product code.
 */

/* ── 3b. Glass analytics dashboard (hero product preview) ───────── */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  const d = [`M ${pts[0][0]},${pts[0][1]}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d.push(`C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`);
  }
  return d.join(" ");
}

const DASH_KPIS = [
  { icon: Wallet, label: "Net worth", value: "₹42.18L", delta: "+12.4%", tint: "#19B886" },
  { icon: TrendingUp, label: "Invested", value: "₹18.6L", delta: "+4.2%", tint: "#2DD4BF" },
  { icon: Target, label: "Saved · Jun", value: "₹64k", delta: "+8.0%", tint: "#C9A84C" },
];
const DASH_ALLOC = [
  { n: "Essentials", p: 42, c: "#19B886" },
  { n: "Investments", p: 22, c: "#5DCAA5" },
  { n: "Wants", p: 19, c: "#C9A84C" },
  { n: "Giving", p: 17, c: "#2D7DD2" },
];

/* ── screen flow data ───────────────────────────────────────────── */
const SCR_INCOME = {
  total: "₹1,24,500", delta: "+6.2%",
  sources: [
    { n: "Salary", a: "₹98,000", p: 79, c: "#19B886" },
    { n: "Freelance", a: "₹16,500", p: 13, c: "#2DD4BF" },
    { n: "Dividends", a: "₹6,200", p: 5, c: "#C9A84C" },
    { n: "Rent", a: "₹3,800", p: 3, c: "#2D7DD2" },
  ],
  spark: [12, 14, 13, 16, 15, 18, 17, 20, 19, 22, 21, 24],
};
const SCR_EXPENSE = {
  spent: "₹86,200", of: "₹1,10,000", pct: 78,
  cats: [
    { n: "Essentials", a: "₹38,400", p: 64, c: "#19B886" },
    { n: "Food & Dining", a: "₹16,900", p: 40, c: "#2DD4BF" },
    { n: "Transport", a: "₹9,200", p: 24, c: "#C9A84C" },
    { n: "Shopping", a: "₹12,300", p: 31, c: "#e8896b" },
  ],
};
const SCR_SCAN = { merchant: "Big Bazaar", amount: "₹2,340", date: "24 Jun 2026", category: "Groceries" };
const SCR_REMIND = [
  { n: "Rent · Landlord", due: "Due in 2d", a: "₹25,000", tag: "Due", c: "#e8896b" },
  { n: "SIP · Index Fund", due: "5 Jul", a: "₹10,000", tag: "Auto", c: "#19B886" },
  { n: "Credit card bill", due: "12 Jul", a: "₹18,400", tag: "Soon", c: "#C9A84C" },
  { n: "Insurance premium", due: "18 Jul", a: "₹7,800", tag: "Soon", c: "#2D7DD2" },
];
const SCR_HOLDINGS = [
  { n: "Reliance Ind.", t: "NSE", v: "₹4.2L", ch: "+1.8%", up: true },
  { n: "Nifty 50 ETF", t: "ETF", v: "₹6.8L", ch: "+0.9%", up: true },
  { n: "Gold · SGB", t: "Bond", v: "₹3.1L", ch: "-0.4%", up: false },
  { n: "Index Fund", t: "MF", v: "₹4.5L", ch: "+2.3%", up: true },
];
const SCR_BUCKETS = [
  { n: "Essentials", a: "₹46,200", p: 42, c: "#19B886" },
  { n: "Investments", a: "₹24,200", p: 22, c: "#5DCAA5" },
  { n: "Wants", a: "₹20,900", p: 19, c: "#C9A84C" },
  { n: "Insurance", a: "₹7,700", p: 7, c: "#2D7DD2" },
  { n: "Short-term", a: "₹5,500", p: 5, c: "#2DD4BF" },
  { n: "Long-term", a: "₹3,300", p: 3, c: "#a78bfa" },
  { n: "Charity", a: "₹2,200", p: 2, c: "#e8896b" },
];
const SCR_GOALS = [
  { n: "Emergency Fund", cur: "₹4.1L", tgt: "₹5.0L", p: 82, c: "#19B886" },
  { n: "Goa Vacation", cur: "₹47k", tgt: "₹1.0L", p: 47, c: "#2DD4BF" },
  { n: "New Car", cur: "₹3.1L", tgt: "₹10L", p: 31, c: "#C9A84C" },
];

/* ── screen motion atoms ────────────────────────────────────────── */
const screenStagger: Variants = {
  hidden: (d: number) => ({ opacity: 0, x: d * 36 }),
  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.07, delayChildren: 0.05 } },
  exit: (d: number) => ({ opacity: 0, x: d * -36, transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }),
};
const screenItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};
function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <motion.div variants={screenItem} className={className}>{children}</motion.div>;
}
function MiniBar({ pct, color = "#19B886" }: { pct: number; color?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
      <motion.div className="h-full rounded-full" style={{ background: color }}
        initial={reduce ? false : { width: 0 }} animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : { duration: 0.85, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}
function Sparkline({ data, color = "#19B886" }: { data: number[]; color?: string }) {
  const w = 240, h = 48;
  const lo = Math.min(...data), hi = Math.max(...data);
  const pts = data.map((v, i) => [(i * w) / (data.length - 1), h - ((v - lo) / (hi - lo || 1)) * (h - 6) - 3] as [number, number]);
  const d = smoothPath(pts);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" preserveAspectRatio="none" aria-hidden>
      <motion.path d={`${d} L ${w},${h} L 0,${h} Z`} fill={color} initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ duration: 0.7, delay: 0.3 }} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
    </svg>
  );
}
const panel = "rounded-xl border border-white/[0.08] bg-white/[0.03]";

/* ── individual screens ─────────────────────────────────────────── */
function ScreenOverview() {
  const reduce = useReducedMotion();
  const W = 520, H = 150, padL = 26, padR = 12, padT = 12, padB = 22;
  const NET = [22, 24, 23, 27, 30, 29, 33, 36, 34, 39, 42, 46];
  const PREV = [18, 19, 20, 21, 23, 24, 25, 27, 28, 30, 31, 33];
  const all = [...NET, ...PREV]; const lo = Math.min(...all), hi = Math.max(...all);
  const X = (i: number) => padL + (i * (W - padL - padR)) / (NET.length - 1);
  const Y = (v: number) => (H - padB) - ((v - lo) / (hi - lo)) * (H - padT - padB);
  const netPath = smoothPath(NET.map((v, i) => [X(i), Y(v)]));
  const prevPath = smoothPath(PREV.map((v, i) => [X(i), Y(v)]));
  const areaPath = `${netPath} L ${X(11)},${H - padB} L ${X(0)},${H - padB} Z`;
  return (
    <div className="space-y-2.5">
      <Row>
        <div className="grid grid-cols-3 gap-2.5">
          {DASH_KPIS.map((k) => (
            <div key={k.label} className={`${panel} p-2.5`}>
              <div className="flex items-center justify-between mb-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${k.tint}22`, border: `1px solid ${k.tint}44` }}>
                  <k.icon className="w-3.5 h-3.5" style={{ color: k.tint }} />
                </div>
                <span className="text-[9px] font-medium" style={{ color: k.tint }}>{k.delta}</span>
              </div>
              <div className="text-base font-semibold text-white leading-none"><CountUp value={k.value} /></div>
              <div className="text-[10px] text-[#7c857f] mt-1">{k.label}</div>
            </div>
          ))}
        </div>
      </Row>
      <Row>
        <div className="grid grid-cols-5 gap-2.5">
          <div className={`col-span-3 ${panel} p-3`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[#c9cfcc]">Net worth · 12 mo</span>
              <div className="flex items-center gap-2.5 text-[8px] text-[#7c857f]">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-[#19B886]" />2026</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-[#C9A84C]" />2025</span>
              </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Net worth trend">
              <defs><linearGradient id="fr-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#19B886" stopOpacity="0.32" /><stop offset="100%" stopColor="#19B886" stopOpacity="0" /></linearGradient></defs>
              {[0, 0.5, 1].map((g) => { const y = padT + g * (H - padT - padB); return <line key={g} x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.06)" />; })}
              <motion.path d={areaPath} fill="url(#fr-area)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }} />
              <motion.path d={prevPath} fill="none" stroke="#C9A84C" strokeWidth="2" strokeDasharray="3 3" opacity="0.7" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }} />
              <motion.path d={netPath} fill="none" stroke="#19B886" strokeWidth="2.5" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }} />
              <motion.circle cx={X(11)} cy={Y(46)} r="3.5" fill="#19B886" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.3, type: "spring", stiffness: 300 }} />
            </svg>
          </div>
          <div className={`col-span-2 ${panel} p-3`}>
            <span className="text-[11px] font-medium text-[#c9cfcc]">7-bucket split</span>
            <div className="flex items-center gap-3 mt-2">
              <div className="relative w-16 h-16 shrink-0">
                <motion.div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(#19B886 0deg 151deg,#5DCAA5 151deg 230deg,#C9A84C 230deg 298deg,#2D7DD2 298deg 360deg)" }} initial={reduce ? false : { rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.8 }} />
                <div className="absolute inset-[28%] rounded-full bg-[#0b1310] flex items-center justify-center"><span className="text-[9px] font-semibold text-white">100%</span></div>
              </div>
              <div className="flex-1 space-y-1">
                {DASH_ALLOC.map((a) => (
                  <div key={a.n} className="flex items-center justify-between text-[9.5px]">
                    <span className="inline-flex items-center gap-1.5 text-[#9aa3a0]"><span className="w-1.5 h-1.5 rounded-full" style={{ background: a.c }} />{a.n}</span>
                    <span className="text-[#c9cfcc] font-medium">{a.p}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Row>
    </div>
  );
}
function ScreenIncome() {
  return (
    <div className="space-y-3">
      <Row>
        <div className={`${panel} p-3 flex items-end justify-between`}>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#7c857f]">Income · June</div>
            <div className="text-2xl font-semibold text-white tracking-tight"><CountUp value={SCR_INCOME.total} /></div>
            <div className="text-[10px] text-[#19B886]">▲ {SCR_INCOME.delta} vs last month</div>
          </div>
          <div className="w-32"><Sparkline data={SCR_INCOME.spark} /></div>
        </div>
      </Row>
      <Row><div className="text-[10px] uppercase tracking-wider text-[#7c857f]">Sources</div></Row>
      {SCR_INCOME.sources.map((s) => (
        <Row key={s.n}>
          <div className="flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.c }} />
            <span className="text-[11px] text-[#c9cfcc] w-20 shrink-0">{s.n}</span>
            <div className="flex-1"><MiniBar pct={s.p} color={s.c} /></div>
            <span className="text-[11px] text-white font-medium w-16 text-right">{s.a}</span>
          </div>
        </Row>
      ))}
    </div>
  );
}
function ScreenExpense() {
  return (
    <div className="space-y-3">
      <Row>
        <div className={`${panel} p-3`}>
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#7c857f]">Spent this month</div>
              <div className="text-2xl font-semibold text-white tracking-tight"><CountUp value={SCR_EXPENSE.spent} /></div>
            </div>
            <div className="text-[10px] text-[#7c857f]">of {SCR_EXPENSE.of}</div>
          </div>
          <MiniBar pct={SCR_EXPENSE.pct} color="#e8896b" />
        </div>
      </Row>
      <Row><div className="text-[10px] uppercase tracking-wider text-[#7c857f]">Top categories</div></Row>
      {SCR_EXPENSE.cats.map((c) => (
        <Row key={c.n}>
          <div className="flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.c }} />
            <span className="text-[11px] text-[#c9cfcc] w-24 shrink-0">{c.n}</span>
            <div className="flex-1"><MiniBar pct={c.p} color={c.c} /></div>
            <span className="text-[11px] text-white font-medium w-16 text-right">{c.a}</span>
          </div>
        </Row>
      ))}
    </div>
  );
}
function ScreenScanner() {
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-5 gap-2.5 h-full">
      <Row className="col-span-2">
        <div className={`relative ${panel} p-3 h-full min-h-[230px] overflow-hidden`}>
          <div className="text-[9px] uppercase tracking-wider text-[#7c857f] mb-2">Receipt</div>
          <div className="space-y-1.5">
            {[88, 64, 92, 52, 74, 44, 80, 58].map((w, idx) => (<div key={idx} className="h-1.5 rounded bg-white/10" style={{ width: `${w}%` }} />))}
          </div>
          {!reduce && (
            <>
              <motion.div className="absolute inset-x-2 h-8 rounded bg-gradient-to-b from-transparent via-[#19B886]/25 to-transparent" animate={{ y: [6, 196, 6] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }} />
              <motion.div className="absolute inset-x-2 h-0.5 bg-[#19B886] shadow-[0_0_14px_#19B886]" animate={{ y: [10, 200, 10] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }} />
            </>
          )}
        </div>
      </Row>
      <Row className="col-span-3">
        <div className={`${panel} p-3 h-full`}>
          <div className="flex items-center gap-1.5 text-[10px] text-[#19B886] mb-2"><ScanLine className="w-3 h-3" /> Extracted · AI</div>
          {([["Merchant", SCR_SCAN.merchant], ["Amount", SCR_SCAN.amount], ["Date", SCR_SCAN.date], ["Category", SCR_SCAN.category]] as const).map(([k, v], idx) => (
            <motion.div key={k} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
              initial={reduce ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + idx * 0.2, duration: 0.4 }}>
              <span className="text-[10px] text-[#7c857f]">{k}</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-white font-medium">{v}<Check className="w-3 h-3 text-[#19B886]" /></span>
            </motion.div>
          ))}
        </div>
      </Row>
    </div>
  );
}
function ScreenReminder() {
  return (
    <div className="space-y-2.5">
      <Row><div className="text-[10px] uppercase tracking-wider text-[#7c857f]">Next 7 days · 4 reminders</div></Row>
      {SCR_REMIND.map((r) => (
        <Row key={r.n}>
          <div className={`${panel} p-2.5 flex items-center gap-3`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${r.c}22`, border: `1px solid ${r.c}44` }}>
              <Bell className="w-3.5 h-3.5" style={{ color: r.c }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-white font-medium truncate">{r.n}</div>
              <div className="text-[9.5px] text-[#7c857f]">{r.due}</div>
            </div>
            <span className="text-[11px] text-white font-medium">{r.a}</span>
            <span className="text-[8px] uppercase tracking-wider rounded px-1.5 py-0.5" style={{ color: r.c, background: `${r.c}1f`, border: `1px solid ${r.c}40` }}>{r.tag}</span>
          </div>
        </Row>
      ))}
    </div>
  );
}
function ScreenInvestment() {
  return (
    <div className="space-y-2.5">
      <Row>
        <div className={`${panel} p-3 flex items-end justify-between`}>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#7c857f]">Portfolio value</div>
            <div className="text-2xl font-semibold text-white tracking-tight"><CountUp value="₹18.6L" /></div>
            <div className="text-[10px] text-[#19B886]">▲ +4.2% today · ₹74k</div>
          </div>
          <div className="w-28"><Sparkline data={[20, 19, 21, 22, 21, 23, 24, 23, 25, 26, 25, 27]} /></div>
        </div>
      </Row>
      <Row><div className="text-[10px] uppercase tracking-wider text-[#7c857f]">Holdings</div></Row>
      {SCR_HOLDINGS.map((h) => (
        <Row key={h.n}>
          <div className={`${panel} p-2.5 flex items-center gap-3`}>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-white font-medium truncate">{h.n}</div>
              <div className="text-[9px] uppercase tracking-wider text-[#7c857f]">{h.t}</div>
            </div>
            <span className="text-[11px] text-white font-medium">{h.v}</span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium w-14 justify-end" style={{ color: h.up ? "#19B886" : "#e8896b" }}>
              {h.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{h.ch}
            </span>
          </div>
        </Row>
      ))}
    </div>
  );
}
function ScreenBudget() {
  return (
    <div className="space-y-2">
      <Row>
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-[#7c857f]">7-bucket allocation</div>
          <div className="text-[10px] text-[#19B886]">₹1,10,000 / mo</div>
        </div>
      </Row>
      {SCR_BUCKETS.map((b) => (
        <Row key={b.n}>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#c9cfcc] w-20 shrink-0">{b.n}</span>
            <div className="flex-1"><MiniBar pct={b.p} color={b.c} /></div>
            <span className="text-[10px] text-[#7c857f] w-8 text-right">{b.p}%</span>
            <span className="text-[11px] text-white font-medium w-16 text-right">{b.a}</span>
          </div>
        </Row>
      ))}
    </div>
  );
}
function ScreenGoal() {
  const reduce = useReducedMotion();
  return (
    <div className="space-y-3">
      <Row><div className="text-[10px] uppercase tracking-wider text-[#7c857f]">Active goals · 3</div></Row>
      {SCR_GOALS.map((g) => (
        <Row key={g.n}>
          <div className={`${panel} p-3 flex items-center gap-3`}>
            <div className="relative w-12 h-12 shrink-0">
              <motion.div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${g.c} ${g.p * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }} initial={reduce ? false : { rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.7 }} />
              <div className="absolute inset-[22%] rounded-full bg-[#0b1310] flex items-center justify-center"><span className="text-[9px] font-semibold text-white">{g.p}%</span></div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-white font-medium truncate">{g.n}</div>
              <div className="text-[10px] text-[#7c857f]">{g.cur} <span className="text-[#8b9a94]">of {g.tgt}</span></div>
              <div className="mt-1.5"><MiniBar pct={g.p} color={g.c} /></div>
            </div>
          </div>
        </Row>
      ))}
    </div>
  );
}

const SCREENS = [
  { id: "overview", label: "Wealth Overview", icon: Sparkles, Comp: ScreenOverview },
  { id: "income", label: "Income", icon: Wallet, Comp: ScreenIncome },
  { id: "expense", label: "Expenses", icon: Receipt, Comp: ScreenExpense },
  { id: "scanner", label: "Bill Scanner", icon: ScanLine, Comp: ScreenScanner },
  { id: "reminder", label: "Reminders", icon: Bell, Comp: ScreenReminder },
  { id: "investment", label: "Investments", icon: TrendingUp, Comp: ScreenInvestment },
  { id: "budget", label: "Budget Allocation", icon: Layers, Comp: ScreenBudget },
  { id: "goal", label: "Goals", icon: Target, Comp: ScreenGoal },
];
const SCREEN_INTERVAL = 4600;

export default function GlassDashboard() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);

  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 140, damping: 16 });
  const sry = useSpring(ry, { stiffness: 140, damping: 16 });

  useEffect(() => {
    if (reduce || paused) return;
    const t = setInterval(() => { setDir(1); setI((p) => (p + 1) % SCREENS.length); }, SCREEN_INTERVAL);
    return () => clearInterval(t);
  }, [reduce, paused]);

  const goTo = (n: number) => { setDir(n > i ? 1 : -1); setI(n); };
  const active = SCREENS[i];
  const Comp = active.Comp;

  return (
    <div
      ref={ref}
      style={{ perspective: 1200 }}
      onMouseEnter={() => setPaused(true)}
      onMouseMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        ry.set(((e.clientX - (r.left + r.width / 2)) / r.width) * 8);
        rx.set((-(e.clientY - (r.top + r.height / 2)) / r.height) * 8);
      }}
      onMouseLeave={() => { setPaused(false); rx.set(0); ry.set(0); }}
    >
      <motion.div
        style={{ rotateX: reduce ? 0 : srx, rotateY: reduce ? 0 : sry, transformStyle: "preserve-3d" }}
        className="relative rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.07] to-white/[0.02] backdrop-blur-xl p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

        {/* header — title swaps per screen */}
        <div className="flex items-center justify-between mb-2.5">
          <motion.div key={active.id} className="flex items-center gap-2"
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <active.icon className="w-4 h-4 text-[#19B886]" />
            <span className="text-sm font-semibold text-white">{active.label}</span>
          </motion.div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-[#7c857f]">
              <Search className="w-3 h-3" /> Search…
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#19B886]/30 bg-[#19B886]/10 px-2 py-1 text-[9px] uppercase tracking-wider text-[#19B886]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#19B886] animate-pulse" /> Live
            </span>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#19B886] to-[#0d6b4f] flex items-center justify-center text-[11px] font-semibold text-[#04130d]">A</div>
          </div>
        </div>

        {/* auto-advance progress */}
        <div className="relative h-0.5 rounded bg-white/5 overflow-hidden mb-3">
          {!reduce && !paused && (
            <motion.div key={i} className="absolute inset-y-0 left-0 bg-[#19B886]/70 rounded" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: SCREEN_INTERVAL / 1000, ease: "linear" }} />
          )}
        </div>

        {/* screen body — clip so slide transitions stay inside the card */}
        <div className="relative min-h-[296px] overflow-hidden">
          {reduce ? (
            <Comp />
          ) : (
            <AnimatePresence custom={dir} initial={false}>
              <motion.div key={active.id} custom={dir} variants={screenStagger} initial="hidden" animate="show" exit="exit" className="absolute inset-0">
                <Comp />
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* screen switcher chips.

            BUG-097 — `tabIndex={-1}` because the whole GlassDashboard is
            wrapped in `aria-hidden="true"` at the call site (Landing.tsx): it
            is a decorative mock, not the visitor's data. A focusable control
            inside an aria-hidden subtree is the worst of both worlds — Tab
            lands on it and the screen reader announces nothing at all. These
            stay clickable; they just leave the tab order, which is where a
            piece of scenery belongs. */}
        <div className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-white/5">
          {SCREENS.map((s, idx) => (
            <button key={s.id} onClick={() => goTo(idx)} tabIndex={-1} data-cursor aria-label={s.label}
              className={`grid place-items-center rounded-lg transition-all duration-300 ${idx === i ? "w-7 h-7 bg-[#19B886] text-[#04130d]" : "w-6 h-6 bg-white/[0.05] text-[#7c857f] hover:text-white hover:bg-white/10"}`}>
              <s.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
