import { useMemo, useState } from "react";
import { Plus, TrendingUp, TrendingDown, Trash2, ChevronDown } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Area, ComposedChart } from "recharts";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ASSET_GROUPS, LIABILITY_GROUPS, useNetWorth, type AssetGroup, type LiabilityGroup, type LedgerKind, type NetWorthEntry,
} from "@/lib/netWorthStore";
import { formatMoney, formatCompact } from "@/lib/finance";
import { cn } from "@/lib/utils";

function AddEntryDialog({ onAdd, defaultKind }: { onAdd: (e: Omit<NetWorthEntry, "id" | "createdAt">) => void; defaultKind?: LedgerKind }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LedgerKind>(defaultKind ?? "asset");
  const [group, setGroup] = useState<AssetGroup | LiabilityGroup>(defaultKind === "liability" ? "credit_card" : "bank");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);

  const groups = kind === "asset" ? ASSET_GROUPS : LIABILITY_GROUPS;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && defaultKind) { setKind(defaultKind); setGroup(defaultKind === "liability" ? "credit_card" : "bank"); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant={defaultKind ? "outline" : "default"} className="gap-1.5">
          <Plus className="w-4 h-4" /> {defaultKind === "liability" ? "Add Liability" : defaultKind === "asset" ? "Add Asset" : "Add Entry"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{defaultKind === "liability" ? "Add Liability" : defaultKind === "asset" ? "Add Asset" : "Add Balance Sheet Item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {!defaultKind && (
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => { setKind(v as LedgerKind); setGroup(v === "liability" ? "credit_card" : "bank"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Group</Label>
            <Select value={group} onValueChange={(v) => setGroup(v as AssetGroup | LiabilityGroup)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => (<SelectItem key={g.id} value={g.id}>{g.emoji} {g.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} placeholder="e.g. HDFC Savings" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name || amount <= 0} onClick={() => { onAdd({ kind, group, name, amount }); setOpen(false); setName(""); setAmount(0); }}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NetWorthTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { month: string; value: number; assets: number; liabilities: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur px-3 py-2.5 shadow-xl min-w-[180px]">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{d.month}</div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Assets</span>
          <span className="tabular-nums font-medium text-emerald-500">{formatMoney(d.assets)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-destructive" />Liabilities</span>
          <span className="tabular-nums font-medium text-destructive">{formatMoney(d.liabilities)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1.5 mt-1.5 border-t border-border/60">
          <span className="text-muted-foreground">Net Worth</span>
          <span className="tabular-nums font-bold text-foreground">{formatMoney(d.value)}</span>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ data, currentAssets, currentLiabilities, currentNet }: { data: { month: string; value: number }[]; currentAssets: number; currentLiabilities: number; currentNet: number }) {
  const enriched = useMemo(() => {
    const safeNet = currentNet || 1;
    return data.map((d, i) => {
      const isLast = i === data.length - 1;
      const ratio = d.value / safeNet;
      return {
        month: d.month,
        value: d.value,
        assets: Math.round(isLast ? currentAssets : currentAssets * ratio),
        liabilities: Math.round(isLast ? currentLiabilities : currentLiabilities * (0.92 + 0.08 * ratio)),
      };
    });
  }, [data, currentAssets, currentLiabilities, currentNet]);

  return (
    <div className="w-full h-44">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={enriched} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="nw-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis hide domain={["dataMin - 1000", "dataMax + 1000"]} />
          <Tooltip content={<NetWorthTooltip />} cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="value" stroke="none" fill="url(#nw-area)" />
          <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }} activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function LedgerGroup({
  label, emoji, items, tone, onRemove,
}: { label: string; emoji: string; items: NetWorthEntry[]; tone: "asset" | "liability"; onRemove: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  if (items.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/40 transition">
        <div className="flex items-center gap-2">
          <ChevronDown className={cn("w-4 h-4 transition-transform", !open && "-rotate-90")} />
          <span>{emoji}</span>
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-[11px] text-muted-foreground">({items.length})</span>
        </div>
        <span className={cn("text-sm font-bold tabular-nums", tone === "asset" ? "text-emerald-500" : "text-destructive")}>
          {formatMoney(total)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 pr-2 pt-1 pb-2 space-y-1">
        {items.map((i) => (
          <div key={i.id} className="group flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/40">
            <span className="text-foreground truncate">{i.name}</span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums font-medium">{formatMoney(i.amount)}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" onClick={() => onRemove(i.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

const NetWorth = () => {
  const { items, add, remove, totals, netWorth, history } = useNetWorth();

  const assetGroups = useMemo(() => ASSET_GROUPS.map((g) => ({ ...g, entries: items.filter((i) => i.kind === "asset" && i.group === g.id) })), [items]);
  const liabilityGroups = useMemo(() => LIABILITY_GROUPS.map((g) => ({ ...g, entries: items.filter((i) => i.kind === "liability" && i.group === g.id) })), [items]);

  const trendDelta = history.length > 1 ? history[history.length - 1].value - history[0].value : 0;
  const trendPct = history[0]?.value ? Math.round((trendDelta / history[0].value) * 100) : 0;

  return (
    <div className="px-6 sm:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Net Worth</span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-1">Net Worth Tracker</h1>
          <p className="text-muted-foreground mt-2 max-w-lg">A real-time balance sheet of every asset and liability you own.</p>
        </div>
        <AddEntryDialog onAdd={add} />
      </header>

      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-chart-2/5 p-8 text-center space-y-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Your Total Net Worth</div>
        <div className="font-display text-5xl sm:text-6xl font-bold text-gradient-primary tabular-nums">
          {formatMoney(netWorth)}
        </div>
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium", trendDelta >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive")}>
            {trendDelta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {trendDelta >= 0 ? "+" : ""}{formatCompact(trendDelta)} ({trendPct}%)
          </span>
          <span className="text-muted-foreground">vs Jan</span>
        </div>
        <div className="max-w-3xl mx-auto pt-2">
          <TrendChart data={history} currentAssets={totals.assets} currentLiabilities={totals.liabilities} currentNet={netWorth} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">Assets</div>
              <div className="text-2xl font-display font-bold mt-1 text-emerald-500 tabular-nums">{formatMoney(totals.assets)}</div>
            </div>
            <AddEntryDialog onAdd={add} defaultKind="asset" />
          </div>
          <div className="space-y-1">
            {assetGroups.map((g) => (
              <LedgerGroup key={g.id} label={g.label} emoji={g.emoji} items={g.entries} tone="asset" onRemove={remove} />
            ))}
            {totals.assets === 0 && <div className="text-sm text-muted-foreground text-center py-6">No assets yet.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-destructive font-semibold">Liabilities</div>
              <div className="text-2xl font-display font-bold mt-1 text-destructive tabular-nums">{formatMoney(totals.liabilities)}</div>
            </div>
            <AddEntryDialog onAdd={add} defaultKind="liability" />
          </div>
          <div className="space-y-1">
            {liabilityGroups.map((g) => (
              <LedgerGroup key={g.id} label={g.label} emoji={g.emoji} items={g.entries} tone="liability" onRemove={remove} />
            ))}
            {totals.liabilities === 0 && <div className="text-sm text-muted-foreground text-center py-6">No liabilities. Nice.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetWorth;