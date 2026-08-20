import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Check, IndianRupee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { ACCESS_MENUS, ALL_MENU_IDS } from "@/lib/accessMenus";
import { CURRENCIES } from "@/lib/finance";
import { formatPlanPrice } from "@/lib/pricing";

type Plan = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  menu_set: string[] | null;
  is_active: boolean;
  paddle_price_id: string | null;
};

/** A plan card whose menu toggles are locally editable, then saved. */
function PlanCard({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const hasWildcard = Array.isArray(plan.menu_set) && plan.menu_set.includes("*");
  const [allMenus, setAllMenus] = useState(hasWildcard);
  const [selected, setSelected] = useState<string[]>(
    hasWildcard ? [...ALL_MENU_IDS] : (plan.menu_set ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [priceMajor, setPriceMajor] = useState(String(plan.price_cents / 100));
  const [currency, setCurrency] = useState(plan.currency);
  const [interval, setInterval] = useState(plan.interval);
  const [savingPrice, setSavingPrice] = useState(false);
  const [paddlePriceId, setPaddlePriceId] = useState(plan.paddle_price_id ?? "");
  const [savingPaddleId, setSavingPaddleId] = useState(false);

  const priceDirty =
    Math.round(Number(priceMajor) * 100) !== plan.price_cents ||
    currency !== plan.currency ||
    interval !== plan.interval;
  const paddleIdDirty = paddlePriceId.trim() !== (plan.paddle_price_id ?? "");

  // Reset local state if the plan reloads.
  useEffect(() => {
    const wc = Array.isArray(plan.menu_set) && plan.menu_set.includes("*");
    setAllMenus(wc);
    setSelected(wc ? [...ALL_MENU_IDS] : (plan.menu_set ?? []));
    setPriceMajor(String(plan.price_cents / 100));
    setCurrency(plan.currency);
    setInterval(plan.interval);
    setPaddlePriceId(plan.paddle_price_id ?? "");
  }, [plan]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((m) => m !== id) : [...s, id]));

  const save = async () => {
    setSaving(true);
    const payload = allMenus ? ["*"] : selected;
    const { error } = await supabase.rpc("po_set_plan_menus", {
      p_plan_id: plan.id,
      p_menus: payload,
    });
    setSaving(false);
    if (error) return notifyError(error);
    toast.success(`${plan.name} menus updated`);
    onSaved();
  };

  // What the landing page will show for this plan — same formatter, so the
  // PO sees the public price, not an internal cent count.
  const derived = formatPlanPrice(plan);

  const savePrice = async () => {
    const major = Number(priceMajor);
    if (!Number.isFinite(major) || major < 0) return toast.error("Enter a price of zero or more");
    setSavingPrice(true);
    const { error } = await supabase.rpc("po_set_plan_price", {
      p_plan_id: plan.id,
      p_price_cents: Math.round(major * 100),
      p_currency: currency,
      p_interval: interval,
    });
    setSavingPrice(false);
    if (error) return notifyError(error);
    toast.success(`${plan.name} price updated`);
    onSaved();
  };

  const savePaddleId = async () => {
    setSavingPaddleId(true);
    const { error } = await supabase.rpc("po_set_plan_paddle_price_id", {
      p_plan_id: plan.id,
      // The RPC itself treats an empty string as "clear" (NULLIF inside
      // po_set_plan_paddle_price_id) — it takes a plain text, not null.
      p_paddle_price_id: paddlePriceId.trim(),
    });
    setSavingPaddleId(false);
    if (error) return notifyError(error);
    toast.success(`${plan.name} Paddle price id updated`);
    onSaved();
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg font-semibold flex items-center gap-2">
            {plan.name}
            {!plan.is_active && <Badge variant="outline" className="text-xs">inactive</Badge>}
          </div>
          <div className="text-sm text-muted-foreground">{derived.price}{derived.period}</div>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Price — the landing pricing section reads this, so it lives here. */}
      <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <IndianRupee className="h-3.5 w-3.5" /> Price
        </div>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
          <Input
            value={priceMajor}
            onChange={(e) => setPriceMajor(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            aria-label={`${plan.name} price`}
          />
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-[92px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={interval} onValueChange={setInterval}>
            <SelectTrigger className="w-[108px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">monthly</SelectItem>
              <SelectItem value="year">yearly</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={savePrice} disabled={savingPrice || !priceDirty}>
            {savingPrice ? "Saving…" : "Update"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Shown on the landing page as <span className="text-foreground font-medium">{derived.price}{derived.period}</span>.
          Zero is shown as “Free”. Existing Paddle subscriptions keep the price they were sold at.
        </p>
      </div>

      {/* Paddle price id — until at least one plan has one, checkout and
          coupons stay disabled (usePaymentsGateway.ts, PoCoupons.tsx). */}
      <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Paddle price id
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            value={paddlePriceId}
            onChange={(e) => setPaddlePriceId(e.target.value)}
            placeholder="pri_…"
            aria-label={`${plan.name} Paddle price id`}
          />
          <Button size="sm" variant="outline" onClick={savePaddleId} disabled={savingPaddleId || !paddleIdDirty}>
            {savingPaddleId ? "Saving…" : "Update"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          From the Paddle dashboard (sandbox or live). Blank means this plan can't be checked out or
          upgraded to through Paddle — leave it blank for Roots.
        </p>
      </div>

      <label className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
        <div>
          <div className="text-sm font-medium flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-primary" /> All menus (incl. future)
          </div>
          <div className="text-xs text-muted-foreground">Grants every current and future feature menu.</div>
        </div>
        <Switch checked={allMenus} onCheckedChange={setAllMenus} />
      </label>

      <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-1.5", allMenus && "opacity-40 pointer-events-none")}>
        {ACCESS_MENUS.map((m) => {
          const checked = allMenus || selected.includes(m.id);
          return (
            <label
              key={m.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
                checked
                  ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                  : "border-border/60 bg-slate-500/5 text-muted-foreground hover:border-border",
              )}
            >
              <span className="truncate">{m.label}</span>
              <Switch
                checked={checked}
                onCheckedChange={() => toggle(m.id)}
                disabled={allMenus}
                className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-600"
              />
            </label>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground">
        {allMenus ? "All menus" : `${selected.length} of ${ALL_MENU_IDS.length} menus enabled`}
      </div>
    </div>
  );
}

export default function PoPlans() {
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["po-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, price_cents, currency, interval, menu_set, is_active, paddle_price_id")
        .order("price_cents", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" /> Plans &amp; Menu Visibility
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose which feature menus each plan exposes. Changes apply to every tenant on that plan.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading plans…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(data ?? []).map((p) => (
            <PlanCard key={p.id} plan={p} onSaved={() => refetch()} />
          ))}
        </div>
      )}
    </div>
  );
}
