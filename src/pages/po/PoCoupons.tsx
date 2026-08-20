import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ticket, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { usePaymentsGateway } from "@/hooks/usePaymentsGateway";

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};

export default function PoCoupons() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["po-coupons"] });
  const gateway = usePaymentsGateway();

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ["po-coupons"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("po_list_coupons");
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
  });

  const [code, setCode] = useState("");
  const [desc, setDesc] = useState("");
  const [discount, setDiscount] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!code.trim()) return toast.error("Enter a coupon code");
    setBusy(true);
    const { error } = await supabase.rpc("po_create_coupon", {
      p_code: code,
      // po_create_coupon's `p_description`/`p_discount_percent` are genuinely
      // nullable columns and were made optional in the SQL by migration
      // 20260820130000 (BUG-055), but this checkout has no
      // SUPABASE_ACCESS_TOKEN to push it and regenerate types.ts against it,
      // so the generated Args type here is still the old, stricter shape.
      // TODO: drop these two casts once types.ts is regenerated post-deploy.
      p_description: (desc || undefined) as string,
      p_discount_percent: (discount ? Number(discount) : undefined) as number,
      p_expires_at: expires ? new Date(expires).toISOString() : undefined,
    });
    setBusy(false);
    if (error) return notifyError(error);
    toast.success("Coupon created");
    setCode(""); setDesc(""); setDiscount(""); setExpires("");
    refresh();
  };

  const toggle = async (c: Coupon) => {
    const { error } = await supabase.rpc("po_set_coupon_active", { p_id: c.id, p_active: !c.active });
    if (error) return notifyError(error);
    refresh();
  };

  const remove = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.code}"?`)) return;
    const { error } = await supabase.rpc("po_delete_coupon", { p_id: c.id });
    if (error) return notifyError(error);
    toast.success("Coupon deleted");
    refresh();
  };

  const isValid = (c: Coupon) => c.active && (!c.expires_at || new Date(c.expires_at) > new Date());

  // Stage 2.11 — a coupon is only real if something can redeem it. With no
  // payment gateway there is no checkout to apply a discount to, so creating
  // one here would produce a code that looks official and does nothing. The
  // table, the RPCs and this editor are all intact behind the gate: when a
  // gateway is configured and wired to discounts, delete this block and the
  // feature is back. See docs/PADDLE_SETUP.md and BUG-018.
  if (!gateway.ready && !gateway.loading) {
    return (
      <div className="p-6 space-y-5 max-w-3xl">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Ticket className="h-5 w-5 text-muted-foreground" /> Coupons
          </h1>
          <p className="text-sm text-muted-foreground">Unavailable — no payment gateway is configured.</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
          <p className="text-sm text-foreground">
            Discount codes need a checkout to apply to. Until a payment provider is set up, a coupon
            created here could be copied by a customer but never redeemed — so the editor is turned
            off rather than handing out codes that quietly fail.
          </p>
          <p className="text-sm text-muted-foreground">
            Upgrades currently run manually: assign a plan from{" "}
            <span className="font-medium text-foreground">Tenants</span>, which records the
            subscription as <code className="text-xs">provider=&apos;manual&apos;</code>. To discount a
            manual upgrade, set the plan price with the editor on{" "}
            <span className="font-medium text-foreground">Plans</span>.
          </p>
          <p className="text-xs text-muted-foreground">
            Existing coupon records are untouched. This page returns as soon as a provider client
            token is set <em>and</em> at least one plan carries a provider price id — right now
            every <code className="text-xs">plans.paddle_price_id</code> is empty, so nothing is
            purchasable and a discount would have nothing to discount.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary" /> Coupons
        </h1>
        <p className="text-sm text-muted-foreground">
          Codes customers can apply at checkout. Wire each one to a provider discount before
          publishing it.
        </p>
      </div>

      {/* Create */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_100px_150px_auto] gap-2 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Code</Label>
            <Input value={code} placeholder="WELCOME20" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input value={desc} placeholder="20% off your first Pro month" onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">% off</Label>
            <Input type="number" value={discount} placeholder="20" onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <DatePickerField
            label="Expires (optional)"
            value={expires}
            onChange={setExpires}
            presets="future"
            placeholder="No expiry"
          />
          <Button onClick={create} disabled={busy} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-muted-foreground text-xs">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Code</th>
              <th className="text-left font-medium px-4 py-2.5">Description</th>
              <th className="text-left font-medium px-4 py-2.5">Discount</th>
              <th className="text-left font-medium px-4 py-2.5">Expires</th>
              <th className="text-left font-medium px-4 py-2.5">Active</th>
              <th className="text-right font-medium px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-border/40">
                <td className="px-4 py-3">
                  <span className="font-mono font-semibold">{c.code}</span>
                  {isValid(c) && <Badge variant="outline" className="ml-2 text-xs border-emerald-500/40 text-emerald-500 bg-emerald-500/10">live</Badge>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.description ?? "—"}</td>
                <td className="px-4 py-3">{c.discount_percent ? `${c.discount_percent}%` : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "No expiry"}</td>
                <td className="px-4 py-3"><Switch checked={c.active} onCheckedChange={() => toggle(c)} /></td>
                <td className="px-4 py-3 text-right">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(c)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">{isLoading ? "Loading…" : "No coupons yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
