import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Plus,
  Receipt,
  RotateCcw,
  Scale,
  Sparkles,
  Split as SplitIcon,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CURRENCIES, EXPENSE_CATEGORIES, formatMoney } from "@/lib/finance";
import { useCreateTransaction } from "@/hooks/useTransactions";

import {
  KINDS,
  KIND_META,
  MODES,
  MODE_META,
  NEUTRAL,
  balanceLast,
  blankAllocs,
  convertAllocations,
  currencySymbol,
  curve,
  evenSplit,
  fieldFor,
  moneyOf,
  num,
  sumOf,
  summarize,
  uid,
  isBalanced,
  isOver,
  type Allocation,
  type Pt,
  type SplitMode,
} from "./smartSplitMath";
import { NodeShell, Stat } from "./smartSplitBits";

/* ------------------------------------------------------------------ *
 * Smart Split — a single bill flows through a splitter hub into
 * allocation "buckets" that reconcile back to the total. The portion
 * marked as yours posts to the ledger; reimbursable/shared portions are
 * tracked as money owed back to you.
 *
 * This file is the surface: form state, the SVG connector geometry and
 * the node markup. Every number it shows comes from ./smartSplitMath.
 * ------------------------------------------------------------------ */

export default function SmartSplit() {
  const create = useCreateTransaction();

  // Starts on an empty state; the editor opens only after "New Smart Split".
  const [started, setStarted] = useState(false);
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("Shopping");
  const [currency, setCurrency] = useState("INR");
  const [total, setTotal] = useState("");
  const [mode, setMode] = useState<SplitMode>("amount");
  const [allocations, setAllocations] = useState<Allocation[]>(blankAllocs);

  const totalNum = num(total);
  const sumPct = useMemo(() => sumOf(allocations, "pct"), [allocations]);
  const sumShares = useMemo(() => sumOf(allocations, "shares"), [allocations]);

  // resolve each bucket to a money value based on the active split method
  const valueOf = useCallback(
    (a: Allocation) => moneyOf(a, mode, totalNum, sumShares),
    [mode, totalNum, sumShares],
  );

  const sums = useMemo(
    () => summarize(allocations, mode, totalNum),
    [allocations, mode, totalNum],
  );

  const remaining = +(totalNum - sums.allocated).toFixed(2);
  const balanced = isBalanced(mode, { totalNum, sumPct, sumShares, remaining });
  const over = isOver(mode, { sumPct, remaining });
  const recoverable = sums.office + sums.shared;

  /* ----------------------------- mutations ----------------------------- */
  const patch = (id: string, p: Partial<Allocation>) =>
    setAllocations((xs) => xs.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const addAlloc = () =>
    setAllocations((xs) => [
      ...xs,
      { id: uid(), label: "New bucket", kind: "shared", amount: "", pct: "", shares: "" },
    ]);
  const removeAlloc = (id: string) =>
    setAllocations((xs) => (xs.length > 1 ? xs.filter((a) => a.id !== id) : xs));

  // field name edited in the current mode
  const field = fieldFor(mode);

  // switching method converts existing values so the actual split is preserved
  const changeMode = (m: SplitMode) => {
    if (m === mode) return;
    setAllocations((xs) => convertAllocations(xs, mode, m, totalNum));
    setMode(m);
  };

  const splitEvenly = () => setAllocations((xs) => evenSplit(xs, mode, totalNum));
  const balanceRemainder = () => setAllocations((xs) => balanceLast(xs, mode, totalNum));
  const blankFields = () => {
    setVendor("");
    setTotal("");
    setCategory("Shopping");
    setCurrency("INR");
    setAllocations(blankAllocs());
  };
  const startNew = () => {
    blankFields();
    setStarted(true);
  };
  const discard = () => {
    blankFields();
    setStarted(false);
  };
  const reset = () => blankFields();

  const save = async () => {
    if (sums.mine <= 0) return;
    const bits: string[] = [`you ${formatMoney(sums.mine, currency)}`];
    if (sums.office > 0) bits.push(`office ${formatMoney(sums.office, currency)} reimbursable`);
    if (sums.shared > 0) bits.push(`shared ${formatMoney(sums.shared, currency)} recoverable`);
    const name = vendor.trim() || "Split bill";
    const description = `${name} • bill ${formatMoney(totalNum, currency)} split → ${bits.join(" · ")}`;
    await create.mutateAsync({
      type: "expense",
      amount: sums.mine,
      currency,
      category,
      occurred_at: new Date().toISOString(),
      description,
    });
    // back to the empty state, ready for the next split
    discard();
  };

  /* --------------------------- connector geometry --------------------------- */
  const wrapRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const allocRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [paths, setPaths] = useState<
    { id: string; d: string; color: string; to: Pt; from: Pt; port: boolean }[]
  >([]);
  const [wide, setWide] = useState(false);

  const recompute = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const isWide = window.matchMedia("(min-width: 1024px)").matches;
    setWide(isWide);
    if (!isWide) {
      setPaths([]);
      return;
    }
    const wr = wrap.getBoundingClientRect();
    const rel = (el: HTMLElement | null, side: "l" | "r" | "c"): Pt | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = side === "r" ? r.right : side === "l" ? r.left : r.left + r.width / 2;
      return { x: x - wr.left, y: r.top - wr.top + r.height / 2 };
    };
    const next: {
      id: string;
      d: string;
      color: string;
      to: Pt;
      from: Pt;
      port: boolean;
    }[] = [];
    const srcR = rel(sourceRef.current, "r");
    const hubC = rel(hubRef.current, "c"); // every wire meets at the hub's centre
    if (srcR && hubC)
      next.push({ id: "src-hub", d: curve(srcR, hubC), color: NEUTRAL, from: srcR, to: hubC, port: false });
    if (hubC) {
      for (const a of allocations) {
        const dst = rel(allocRefs.current[a.id], "l");
        if (dst)
          next.push({
            id: a.id,
            d: curve(hubC, dst),
            color: KIND_META[a.kind].color,
            from: hubC,
            to: dst,
            port: true,
          });
      }
    }
    setPaths(next);
  }, [allocations]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, total, vendor]);

  useEffect(() => {
    const ro = new ResizeObserver(recompute);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", recompute);
    const t = setTimeout(recompute, 60); // after fonts/layout settle
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
      clearTimeout(t);
    };
  }, [recompute]);

  /* -------------------------------- render -------------------------------- */
  return (
    <div className="glass-card relative overflow-hidden p-0">
      {/* ambient holo-grid + glow wash */}
      <div className="fr-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      {!started ? (
        /* ---- EMPTY STATE ---- */
        <div className="relative flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="relative mb-5">
            <span className="fr-breathe absolute inset-0 rounded-2xl bg-primary/30 blur-xl" />
            <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/30">
              <SplitIcon className="h-7 w-7" />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-bold tracking-tight text-foreground">
              Smart Split
            </h3>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-primary">
              concept
            </span>
          </div>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Split one bill across people or cost-centres. Your share posts to the
            ledger; the rest is tracked as owed back to you.
          </p>
          <Button onClick={startNew} className="mt-6 h-10 px-5">
            <Plus className="mr-1.5 h-4 w-4" /> New Smart Split
          </Button>
        </div>
      ) : (
        <>
      {/* header */}
      <div className="relative flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
              <SplitIcon className="h-4 w-4" />
            </span>
            <h3 className="font-display text-base font-bold tracking-tight text-foreground">
              Smart Split
            </h3>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-primary">
              concept
            </span>
          </div>
          <p className="mt-1.5 max-w-md text-xs text-muted-foreground">
            One bill, many pockets. Route a single expense into buckets — your share
            posts to the ledger, the rest is tracked as owed back to you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={discard} className="h-8 text-xs text-muted-foreground">
            <X className="mr-1.5 h-3.5 w-3.5" /> Discard
          </Button>
          <Button variant="ghost" size="sm" onClick={reset} className="h-8 text-xs">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={addAlloc} className="h-8 text-xs">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add bucket
          </Button>
        </div>
      </div>

      {/* ---- SPLIT METHOD SELECTOR ---- */}
      <div className="relative flex items-center justify-center gap-2 px-5 pb-1 sm:px-6">
        <span
          id="smartsplit-mode-label"
          className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Split by
        </span>
        {/* Stage 4.8. `aria-pressed` rather than role="radiogroup": a real radio
            group has to implement arrow-key navigation and a roving tabindex,
            and declaring the role without them is worse than not declaring it —
            it promises keyboard behaviour that is not there. Pressed toggles
            keep native Tab order and still say which one is in effect. */}
        <div
          role="group"
          aria-labelledby="smartsplit-mode-label"
          className="inline-flex items-center gap-0.5 rounded-full bg-secondary/60 p-0.5 ring-1 ring-border/40"
        >
          {MODES.map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => changeMode(m)}
                className={cn(
                  "rounded-full px-3.5 py-1 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {MODE_META[m].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- FLOW CANVAS ---- */}
      <div ref={wrapRef} className="relative mx-auto max-w-4xl px-5 pb-2 sm:px-6">
        {/* connector layer — sits BEHIND the cards (z-0); cards are z-10 */}
        <svg
          className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <filter id="frGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {wide &&
            paths.map((p) => (
              <g key={p.id}>
                {/* faint base rail */}
                <path d={p.d} fill="none" stroke={p.color} strokeOpacity={0.16} strokeWidth={2} />
                {/* glowing animated trace */}
                <path
                  id={`frp-${p.id}`}
                  d={p.d}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  className="fr-flow"
                  filter="url(#frGlow)"
                />
                {/* energy packet travelling along the wire */}
                <circle r={2.2} fill={p.color} filter="url(#frGlow)">
                  <animateMotion dur="2.8s" repeatCount="indefinite">
                    <mpath href={`#frp-${p.id}`} />
                  </animateMotion>
                </circle>
                {/* single tidy port where the wire docks into a card */}
                {p.port && <circle cx={p.to.x} cy={p.to.y} r={3} fill={p.color} />}
              </g>
            ))}
        </svg>

        {/* 3-column flow: source · hub · buckets */}
        <div className="relative z-10 grid grid-cols-1 items-center gap-4 py-4 lg:grid-cols-[minmax(0,0.9fr)_56px_minmax(0,1.05fr)] lg:gap-x-1.5 lg:gap-y-2.5">
          {/* SOURCE */}
          <div ref={sourceRef}>
            <NodeShell accent="#9ca3af" glow>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Receipt className="h-3.5 w-3.5" /> Source bill
              </div>
              {/* A placeholder is not an accessible name: it vanishes the
                  moment the field has content, and some assistive tech ignores
                  it entirely. These two are the source bill, so an unnamed pair
                  meant "edit text, edit text" at the top of the flow. */}
              <Input
                value={vendor}
                aria-label="Vendor"
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Vendor (e.g. Blinkit)"
                className="mt-1.5 h-8 border-0 bg-transparent px-0 font-display text-base font-bold focus-visible:ring-0"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-foreground/70">
                  {currencySymbol(currency)}
                </span>
                <input
                  inputMode="decimal"
                  value={total}
                  aria-label="Total bill amount"
                  onChange={(e) => setTotal(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0"
                  className="w-full bg-transparent font-display text-2xl font-extrabold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
                />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 w-auto gap-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-8 w-[78px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </NodeShell>
          </div>

          {/* HUB */}
          <div className="flex justify-center lg:px-1">
            <div ref={hubRef} className="relative grid place-items-center">
              <span
                className={cn(
                  "fr-breathe absolute inset-0 -z-0 rounded-full blur-md",
                  over ? "bg-coral/40" : balanced ? "bg-primary/40" : "bg-amber-400/30",
                )}
              />
              <div
                className={cn(
                  "relative z-10 grid h-14 w-14 place-items-center rounded-full border-2 bg-background/80 backdrop-blur transition-colors",
                  over
                    ? "border-coral text-coral"
                    : balanced
                      ? "border-primary text-primary"
                      : "border-amber-400/70 text-amber-400",
                )}
              >
                <SplitIcon className="h-6 w-6" />
              </div>
            </div>
          </div>

          {/* BUCKETS */}
          <div className="space-y-3">
            <AnimatePresence initial={false} mode="popLayout">
              {allocations.map((a) => {
                const meta = KIND_META[a.kind];
                const Icon = meta.icon;
                const money = valueOf(a);
                const pct = totalNum > 0 ? Math.round((money / totalNum) * 100) : 0;
                const fieldVal = mode === "percent" ? a.pct : mode === "shares" ? a.shares : a.amount;
                return (
                  <motion.div
                    key={a.id}
                    layout
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.2 }}
                    ref={(el) => (allocRefs.current[a.id] = el)}
                  >
                    <NodeShell accent={meta.color}>
                      <div className="group/bk">
                        {/* top row: identity + amount */}
                        <div className="flex items-center gap-2.5">
                          <span
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1"
                            style={{ background: `${meta.color}1a`, color: meta.color, boxShadow: `inset 0 0 0 1px ${meta.color}33` }}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          {/* Both inputs below were entirely unnamed — a screen
                              reader announced "edit text" with nothing to say
                              which bucket, or whether it wanted a name or an
                              amount. */}
                          <input
                            value={a.label}
                            aria-label="Bucket name"
                            placeholder="Bucket name"
                            onChange={(e) => patch(a.id, { label: e.target.value })}
                            className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold text-foreground outline-none focus:text-primary"
                          />
                          <div className="flex shrink-0 items-baseline gap-1">
                            {mode === "amount" && (
                              <span className="text-sm font-semibold text-foreground/50">
                                {currencySymbol(currency)}
                              </span>
                            )}
                            <input
                              inputMode="decimal"
                              value={fieldVal}
                              // Names the unit too, since the same box means
                              // rupees, percent or shares depending on mode.
                              aria-label={`${MODE_META[mode].label} for ${a.label || "bucket"}`}
                              onChange={(e) =>
                                patch(a.id, { [field]: e.target.value.replace(/[^0-9.]/g, "") })
                              }
                              placeholder="0"
                              className="w-[3.5rem] bg-transparent text-right font-display text-lg font-bold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
                            />
                            {mode !== "amount" && (
                              <span className="text-sm font-semibold text-foreground/50">
                                {MODE_META[mode].unit}
                              </span>
                            )}
                            <span
                              className="ml-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums"
                              style={{ background: `${meta.color}1f`, color: meta.color }}
                              title={mode === "amount" ? "Share of bill" : "Resolved amount"}
                            >
                              {mode === "amount" ? `${pct}%` : formatMoney(money, currency)}
                            </span>
                          </div>
                        </div>

                        {/* bottom row: kind segmented control + hint + delete */}
                        <div className="mt-2 flex items-center justify-between gap-3 pl-10">
                          {/* The selected kind was signalled ONLY by the pill's
                              background colour — invisible to a screen reader
                              and to anyone who cannot separate these hues. */}
                          <div
                            role="group"
                            aria-label={`Bucket type for ${a.label || "bucket"}`}
                            className="inline-flex items-center gap-0.5 rounded-full bg-muted/40 p-0.5 ring-1 ring-border/40"
                          >
                            {KINDS.map((k) => {
                              const km = KIND_META[k];
                              const active = a.kind === k;
                              return (
                                <button
                                  key={k}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => patch(a.id, { kind: k })}
                                  className={cn(
                                    "rounded-full px-2.5 py-1 text-xs font-semibold leading-none transition-colors",
                                    active ? "text-background" : "text-muted-foreground hover:text-foreground",
                                  )}
                                  style={active ? { background: km.color } : undefined}
                                >
                                  {km.label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="hidden truncate text-xs text-muted-foreground lg:block">
                              {meta.sub}
                            </p>
                            <button
                              onClick={() => removeAlloc(a.id)}
                              disabled={allocations.length <= 1}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-coral/40 hover:bg-coral/10 hover:text-coral disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border/50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                              aria-label="Delete bucket"
                              title={allocations.length <= 1 ? "Keep at least one bucket" : "Delete bucket"}
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </NodeShell>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ---- RECONCILE BAR ---- */}
      <div className="relative mx-auto mb-5 mt-1 max-w-4xl rounded-xl border border-border/50 bg-background/40 p-3.5 backdrop-blur">
        {/* allocation meter */}
        <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
          <div className="flex h-full w-full">
            {allocations.map((a) => {
              const w = totalNum > 0 ? Math.min(100, (valueOf(a) / totalNum) * 100) : 0;
              return (
                <div
                  key={a.id}
                  style={{ width: `${w}%`, background: KIND_META[a.kind].color }}
                  className="h-full transition-all duration-300"
                />
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <Stat label="Bill" value={formatMoney(totalNum, currency)} />
            <Stat label="Allocated" value={formatMoney(sums.allocated, currency)} />
            <Stat
              label={over ? "Over by" : "Unallocated"}
              value={formatMoney(Math.abs(remaining), currency)}
              tone={balanced ? "ok" : over ? "bad" : "warn"}
            />
            {recoverable > 0 && (
              <Stat label="Recoverable" value={formatMoney(recoverable, currency)} tone="info" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={splitEvenly} className="h-8 text-xs">
              <Scale className="mr-1.5 h-3.5 w-3.5" /> Split evenly
            </Button>
            {mode !== "shares" && (
              <Button variant="outline" size="sm" onClick={balanceRemainder} className="h-8 text-xs">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Balance
              </Button>
            )}
          </div>
        </div>

        {/* status + commit */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              balanced && sums.mine > 0
                ? "text-primary"
                : over
                  ? "text-coral"
                  : "text-amber-400",
            )}
          >
            {balanced && sums.mine > 0 ? (
              <>
                <Check className="h-3.5 w-3.5" /> Balanced — {formatMoney(sums.mine, currency)} posts
                to your ledger
                {recoverable > 0 && <>, {formatMoney(recoverable, currency)} owed back</>}
              </>
            ) : balanced ? (
              <>
                <User className="h-3.5 w-3.5" /> Mark a bucket as “You” to post your share
              </>
            ) : over ? (
              <>Buckets exceed the bill by {formatMoney(-remaining, currency)}</>
            ) : (
              <>{formatMoney(remaining, currency)} still unallocated</>
            )}
          </p>
          <Button
            size="sm"
            disabled={!balanced || sums.mine <= 0 || create.isPending}
            onClick={save}
            className="h-9"
          >
            <Wallet className="mr-1.5 h-4 w-4" />
            {create.isPending
              ? "Saving…"
              : sums.mine > 0
                ? `Post ${formatMoney(sums.mine, currency)} to ledger`
                : "Post to ledger"}
          </Button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
