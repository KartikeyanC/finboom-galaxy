import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, BadgeIndianRupee, Eye, Link2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { usePlansCatalogue } from "@/hooks/usePricingContent";
import {
  DEFAULT_PRICING,
  PRICING_KEY,
  formatPlanPrice,
  normalizePricing,
  pricingIssues,
  type PlanRow,
  type PricingCard,
  type PricingContent,
} from "@/lib/pricing";

const NO_PLAN = "__none__";

const blankCard = (): PricingCard => ({
  plan: "",
  name: "New plan",
  price: "₹0",
  period: "/mo",
  blurb: "",
  features: [],
  cta: "Get started",
  ctaHref: "/auth",
  highlight: false,
  badge: "",
});

const findPlan = (plans: PlanRow[], name?: string | null) =>
  plans.find((p) => p.name.trim().toLowerCase() === (name ?? "").trim().toLowerCase());

export default function PoPricing() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["po-pricing"],
    queryFn: async (): Promise<PricingContent> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", PRICING_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizePricing(data?.value ?? null);
    },
  });

  const { data: plans = [] } = usePlansCatalogue();
  const [content, setContent] = useState<PricingContent>(DEFAULT_PRICING);
  const [saving, setSaving] = useState(false);
  const issues = useMemo(
    () => pricingIssues(content, plans.length ? plans : undefined),
    [content, plans],
  );

  useEffect(() => {
    if (data) setContent(data);
  }, [data]);

  const patchCard = (i: number, patch: Partial<PricingCard>) =>
    setContent((c) => ({ ...c, cards: c.cards.map((card, idx) => (idx === i ? { ...card, ...patch } : card)) }));
  const addCard = () => setContent((c) => ({ ...c, cards: [...c.cards, blankCard()] }));
  const removeCard = (i: number) =>
    setContent((c) => ({ ...c, cards: c.cards.filter((_, idx) => idx !== i) }));
  const move = (i: number, dir: -1 | 1) =>
    setContent((c) => {
      const next = [...c.cards];
      const j = i + dir;
      if (j < 0 || j >= next.length) return c;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...c, cards: next };
    });

  const save = async () => {
    setSaving(true);
    // Strip empty feature lines, and refresh the stored price of every linked
    // card from its plan so the offline fallback can never go stale.
    const payload: PricingContent = {
      ...content,
      cards: content.cards.map((c) => {
        const plan = findPlan(plans, c.plan);
        const derived = plan ? formatPlanPrice(plan) : null;
        return {
          ...c,
          features: c.features.map((f) => f.trim()).filter(Boolean),
          price: derived ? derived.price : c.price,
          period: derived ? derived.period : c.period,
        };
      }),
    };
    const { error } = await supabase.rpc("po_set_site_setting", {
      p_key: PRICING_KEY,
      p_value: payload as unknown as Json,
    });
    setSaving(false);
    if (error) return notifyError(error);
    toast.success("Pricing page updated");
    refetch();
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <BadgeIndianRupee className="h-5 w-5 text-primary" /> Pricing Page
          </h1>
          <p className="text-sm text-muted-foreground">
            Edit the public pricing section on the landing page. Changes go live immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/#pricing" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Eye className="h-4 w-4" /> Preview
            </Button>
          </a>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Landing ⟷ catalogue drift */}
      {issues.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
            <AlertTriangle className="h-4 w-4" /> This page does not fully match the billing catalogue
          </div>
          <ul className="space-y-1 pl-6 text-sm text-muted-foreground">
            {issues.map((issue, idx) => (
              <li key={idx} className="list-disc">
                <span className={issue.level === "error" ? "text-coral" : undefined}>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section heading */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Section heading</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="eyebrow">Eyebrow</Label>
            <Input id="eyebrow" value={content.eyebrow} onChange={(e) => setContent((c) => ({ ...c, eyebrow: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={content.title} onChange={(e) => setContent((c) => ({ ...c, title: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Plan cards */}
      <div className="space-y-4">
        {content.cards.map((card, i) => (
          <div key={i} className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Card {i + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === content.cards.length - 1} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-coral hover:text-coral" onClick={() => removeCard(i)} aria-label="Delete card">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {(() => {
              const plan = findPlan(plans, card.plan);
              const derived = plan ? formatPlanPrice(plan) : null;
              return (
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input value={card.name} onChange={(e) => patchCard(i, { name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5" /> Plan
                    </Label>
                    <Select
                      value={card.plan ? card.plan : NO_PLAN}
                      onValueChange={(v) => patchCard(i, { plan: v === NO_PLAN ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Not linked" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PLAN}>Not linked</SelectItem>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.name}>
                            {p.name} — {formatPlanPrice(p).price}
                            {formatPlanPrice(p).period}
                          </SelectItem>
                        ))}
                        {card.plan && !plan && (
                          <SelectItem value={card.plan}>{card.plan} (missing)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Price</Label>
                    {derived ? (
                      <div className="flex h-10 items-center rounded-md border border-border/60 bg-muted/40 px-3 text-sm">
                        <span className="font-medium">{derived.price}</span>
                        <span className="text-muted-foreground">{derived.period}</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={card.price} onChange={(e) => patchCard(i, { price: e.target.value })} placeholder="Free / ₹299" />
                        <Input value={card.period ?? ""} onChange={(e) => patchCard(i, { period: e.target.value })} placeholder="/mo" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {findPlan(plans, card.plan) && (
              <p className="text-xs text-muted-foreground">
                Price comes from the <span className="font-medium">{card.plan}</span> plan. Change it
                in <a href="/po/plans" className="underline underline-offset-2">Plans</a>.
              </p>
            )}

            <div className="space-y-1.5">
              <Label>Tagline</Label>
              <Input value={card.blurb} onChange={(e) => patchCard(i, { blurb: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label>Features (one per line)</Label>
              <Textarea
                rows={4}
                value={card.features.join("\n")}
                onChange={(e) => patchCard(i, { features: e.target.value.split("\n") })}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Button label</Label>
                <Input value={card.cta} onChange={(e) => patchCard(i, { cta: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Button link</Label>
                <Input value={card.ctaHref ?? ""} onChange={(e) => patchCard(i, { ctaHref: e.target.value })} placeholder="/auth" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Badge (e.g. “Most chosen”)</Label>
                <Input value={card.badge ?? ""} onChange={(e) => patchCard(i, { badge: e.target.value })} placeholder="Leave blank for none" />
              </div>
              <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
                <span className="text-sm">Highlight this card</span>
                <Switch checked={!!card.highlight} onCheckedChange={(v) => patchCard(i, { highlight: v })} />
              </label>
            </div>
          </div>
        ))}

        <button
          onClick={addCard}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border/60 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-4 w-4" /> Add plan card
        </button>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
