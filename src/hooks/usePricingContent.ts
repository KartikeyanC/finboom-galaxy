import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PRICING,
  PRICING_KEY,
  normalizePricing,
  resolvePricingCards,
  type PlanRow,
  type PricingContent,
  type ResolvedPricingCard,
} from "@/lib/pricing";

export {
  DEFAULT_PRICING,
  PRICING_KEY,
  type PricingCard,
  type PricingContent,
  type PlanRow,
  type ResolvedPricingCard,
} from "@/lib/pricing";

/** Public read of the PO-editable pricing copy (RLS allows anon for landing_* keys). */
export function usePricingContent() {
  return useQuery({
    queryKey: ["site-pricing"],
    staleTime: 60_000,
    queryFn: async (): Promise<PricingContent> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", PRICING_KEY)
        .maybeSingle();
      if (error || !data) return DEFAULT_PRICING;
      return normalizePricing(data.value);
    },
  });
}

/** The billing catalogue. Public read — `plans` is public catalog data. */
export function usePlansCatalogue() {
  return useQuery({
    queryKey: ["plans-catalogue"],
    staleTime: 60_000,
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("id,name,price_cents,currency,interval,is_active")
        .eq("is_active", true)
        .order("price_cents", { ascending: true });
      if (error || !data) return [];
      return data as PlanRow[];
    },
  });
}

/**
 * What the landing renders: PO copy with prices taken from `plans`.
 * While the catalogue is loading, cards keep their stored fallback strings.
 */
export function useResolvedPricing(): {
  eyebrow: string;
  title: string;
  cards: ResolvedPricingCard[];
} {
  const { data: content } = usePricingContent();
  const { data: plans } = usePlansCatalogue();
  const source = content ?? DEFAULT_PRICING;
  return {
    eyebrow: source.eyebrow,
    title: source.title,
    cards: resolvePricingCards(source, plans),
  };
}
