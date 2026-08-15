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
  return allocations.map((a) => {
    const money = moneyOf(a, from, totalNum, sumShares);
    if (to === "amount") return { ...a, amount: money ? String(round2(money)) : "" };
    if (to === "percent")
      return { ...a, pct: totalNum > 0 && money ? String(round2((money / totalNum) * 100)) : "" };
    return { ...a, shares: money ? String(round2(money)) : "" };
  });
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
