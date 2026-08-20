import { Building2, User, Users } from "lucide-react";

/**
 * Smart Split's model and arithmetic — split out of SmartSplit.tsx in
 * Stage 4.13.
 *
 * This is the part of the feature that decides money: how much of a bill posts
 * to the user's own ledger, and how much is recorded as owed back to them. It
 * was interleaved with 700 lines of SVG connector geometry and node markup,
 * where no test could reach it. Everything here is pure — allocations in,
 * allocations (or totals) out — and it is tested in smartSplitMath.test.ts.
 *
 * The one rule the whole module turns on: an allocation carries a value for
 * EVERY split method (`amount`, `pct`, `shares`) and the active mode decides
 * which one is the source of truth. Switching modes converts, it does not
 * reinterpret — see `convertAllocations`.
 */

export type Kind = "mine" | "office" | "shared";
export type SplitMode = "amount" | "percent" | "shares";

export interface Allocation {
  id: string;
  label: string;
  kind: Kind;
  // one field per split method; the active mode decides which is the source of truth
  amount: string;
  pct: string;
  shares: string;
}

export const MODE_META: Record<SplitMode, { label: string; unit: string }> = {
  amount: { label: "Amount", unit: "" },
  percent: { label: "Percent", unit: "%" },
  shares: { label: "Shares", unit: "×" },
};
export const MODES = Object.keys(MODE_META) as SplitMode[];

export const KIND_META: Record<
  Kind,
  { label: string; sub: string; color: string; icon: typeof User }
> = {
  mine: { label: "You", sub: "Personal — posts to your books", color: "#2FD8A4", icon: User },
  office: { label: "Office", sub: "Reimbursable — owed back to you", color: "#4CA8FF", icon: Building2 },
  shared: { label: "Shared", sub: "Fronted for others — recoverable", color: "#B388FF", icon: Users },
};
export const NEUTRAL = "#7C8A99"; // source → hub link
export const KINDS = Object.keys(KIND_META) as Kind[];

export const uid = () => Math.random().toString(36).slice(2, 9);

/** A blank or half-typed input is 0, never NaN — NaN poisons every total it reaches. */
export const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (n: number) => +n.toFixed(2);

export type Pt = { x: number; y: number };
export function curve(a: Pt, b: Pt) {
  const dx = Math.max(36, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export const blankAllocs = (): Allocation[] => [
  { id: uid(), label: "Your amount", kind: "mine", amount: "", pct: "", shares: "" },
  { id: uid(), label: "Office amount", kind: "office", amount: "", pct: "", shares: "" },
];

/** The allocation field the active mode edits. */
export const fieldFor = (mode: SplitMode): "amount" | "pct" | "shares" =>
  mode === "percent" ? "pct" : mode === "shares" ? "shares" : "amount";

export const sumOf = (allocations: Allocation[], field: "amount" | "pct" | "shares") =>
  allocations.reduce((s, a) => s + num(a[field]), 0);

/** Resolve one bucket to money under the active split method. */
export function moneyOf(
  a: Allocation,
  mode: SplitMode,
  totalNum: number,
  sumShares: number,
) {
  if (mode === "percent") return (totalNum * num(a.pct)) / 100;
  if (mode === "shares") return sumShares > 0 ? (totalNum * num(a.shares)) / sumShares : 0;
  return num(a.amount);
}

export type SplitTotals = {
  allocated: number;
  mine: number;
  office: number;
  shared: number;
};

export function summarize(
  allocations: Allocation[],
  mode: SplitMode,
  totalNum: number,
): SplitTotals {
  const sumShares = sumOf(allocations, "shares");
  let allocated = 0,
    mine = 0,
    office = 0,
    shared = 0;
  for (const a of allocations) {
    const v = moneyOf(a, mode, totalNum, sumShares);
    allocated += v;
    if (a.kind === "mine") mine += v;
    else if (a.kind === "office") office += v;
    else shared += v;
  }
  return { allocated, mine, office, shared };
}

/**
 * Is the split complete? The test differs per mode because the modes mean
 * different things: percentages must reach 100, shares only need to exist
 * (they are a ratio, so any positive set divides the bill exactly), and
 * amounts must land on the total within half a paisa.
 */
export function isBalanced(
  mode: SplitMode,
  { totalNum, sumPct, sumShares, remaining }:
    { totalNum: number; sumPct: number; sumShares: number; remaining: number },
) {
  if (totalNum <= 0) return false;
  if (mode === "percent") return Math.abs(sumPct - 100) < 0.05;
  if (mode === "shares") return sumShares > 0;
  return Math.abs(remaining) < 0.005;
}

/** Over-allocated. Shares can never overshoot — they are normalised by their own sum. */
export function isOver(
  mode: SplitMode,
  { sumPct, remaining }: { sumPct: number; remaining: number },
) {
  if (mode === "percent") return sumPct > 100.05;
  if (mode === "shares") return false;
  return remaining < -0.005;
}

/**
 * BUG-080 — rounding each bucket's converted value to 2dp independently
 * loses whatever didn't divide evenly, and nothing put it back: five buckets
 * of a ₹128 bill, taken through percent and back, could land on ₹127.98.
 * Each individual conversion was correctly rounded; the *set* of them just
 * stopped summing to the total, because 2dp rounding isn't linear.
 *
 * Same fix `evenSplit`/`balanceLast` already use elsewhere in this file:
 * the shortfall (or excess) goes to one bucket rather than being silently
 * dropped. The largest bucket absorbs it, not the first/last — nudging the
 * biggest number by a cent is imperceptible; nudging a small one can double
 * it, and a bucket that's already empty ("") should never be the one that
 * grows a cent out of nowhere.
 */
function reconcileRounding(values: number[], target: number): number[] {
  const out = values.slice();
  const diff = round2(target - out.reduce((s, v) => s + v, 0));
  if (diff === 0 || out.length === 0) return out;
  let biggest = 0;
  for (let i = 1; i < out.length; i++) if (out[i] > out[biggest]) biggest = i;
  out[biggest] = round2(out[biggest] + diff);
  return out;
}

/**
 * Switch split method, preserving the actual division of the bill: each bucket
 * is resolved to money under the OLD mode and re-expressed in the new one. A
 * bucket worth nothing converts to an empty field rather than "0", so the
 * input reads as untouched instead of deliberately zeroed.
 */
export function convertAllocations(
  allocations: Allocation[],
  from: SplitMode,
  to: SplitMode,
  totalNum: number,
): Allocation[] {
  if (to === from) return allocations;
  const sumShares = sumOf(allocations, "shares");
  const moneys = allocations.map((a) => moneyOf(a, from, totalNum, sumShares));

  // Reconcile against what the source actually added up to, not the total the
  // bill needs — an incomplete split (sumPct 90%, say) must stay incomplete
  // after switching modes, not get silently topped up to look finished.
  if (to === "amount") {
    const rounded = reconcileRounding(
      moneys.map((m) => round2(m)),
      round2(moneys.reduce((s, m) => s + m, 0)),
    );
    return allocations.map((a, i) => ({ ...a, amount: moneys[i] ? String(rounded[i]) : "" }));
  }
  if (to === "percent") {
    if (totalNum <= 0) return allocations.map((a) => ({ ...a, pct: "" }));
    const pcts = moneys.map((m) => (m / totalNum) * 100);
    const rounded = reconcileRounding(
      pcts.map((p) => round2(p)),
      round2(pcts.reduce((s, p) => s + p, 0)),
    );
    return allocations.map((a, i) => ({ ...a, pct: moneys[i] ? String(rounded[i]) : "" }));
  }
  return allocations.map((a, i) => ({ ...a, shares: moneys[i] ? String(round2(moneys[i])) : "" }));
}

/**
 * Divide equally. The remainder from rounding down goes to the FIRST bucket,
 * so the parts still add up to the whole — three ways of ₹100 is 33.34 + 33.33
 * + 33.33, never 99.99.
 */
export function evenSplit(
  allocations: Allocation[],
  mode: SplitMode,
  totalNum: number,
): Allocation[] {
  const n = allocations.length;
  if (n === 0) return allocations;
  return allocations.map((a, i) => {
    if (mode === "shares") return { ...a, shares: "1" };
    if (mode === "percent") {
      const each = Math.floor((100 / n) * 100) / 100;
      const val = i === 0 ? +(100 - each * (n - 1)).toFixed(2) : each;
      return { ...a, pct: String(val) };
    }
    if (!totalNum) return a;
    const each = Math.floor((totalNum / n) * 100) / 100;
    const val = i === 0 ? +(totalNum - each * (n - 1)).toFixed(2) : each;
    return { ...a, amount: String(val) };
  });
}

/**
 * Put whatever is unallocated into the last bucket. Never negative: if the
 * earlier buckets already overshoot, the last one goes to 0 and the split
 * stays visibly over rather than inventing a negative share.
 */
export function balanceLast(
  allocations: Allocation[],
  mode: SplitMode,
  totalNum: number,
): Allocation[] {
  const n = allocations.length;
  if (n === 0 || mode === "shares") return allocations;
  const field = fieldFor(mode);
  const cap = mode === "percent" ? 100 : totalNum;
  const head = allocations.slice(0, -1).reduce((s, a) => s + num(a[field]), 0);
  const last = Math.max(0, +(cap - head).toFixed(2));
  return allocations.map((a, i) => (i === n - 1 ? { ...a, [field]: String(last) } : a));
}

export function currencySymbol(c: string) {
  const map: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "د.إ" };
  return map[c] ?? "";
}
