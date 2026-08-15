import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { paymentsConfigured } from "@/lib/payments";

/**
 * Stage 2.11 — "can a customer actually buy something right now?"
 *
 * Two conditions have to hold, and checking only one gives the wrong answer:
 *
 *  1. a provider client token exists, or checkout cannot be opened; and
 *  2. `upgradeable_plans()` returns at least one plan — that RPC only lists
 *     plans with a non-NULL `paddle_price_id`, so an empty result means no plan
 *     is mapped to anything purchasable.
 *
 * The token alone is a trap: this repo's `.env.development` carries a leftover
 * sandbox token from the original prototype while every `paddle_price_id` is
 * still NULL. Gating on the token would report "gateway live", render the
 * Paddle branch, find zero plans, and show the customer nothing at all — the
 * exact dead end 2.11 exists to remove.
 */
export function usePaymentsGateway() {
  const tokenPresent = paymentsConfigured();

  const { data, isLoading } = useQuery({
    queryKey: ["upgradeable-plans"],
    staleTime: 60_000,
    // No point asking when checkout could not open anyway.
    enabled: tokenPresent,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("upgradeable_plans");
      if (error || !Array.isArray(data)) return [];
      return data;
    },
  });

  const purchasablePlans = data ?? [];

  return {
    /** True only when a customer could complete a purchase unaided. */
    ready: tokenPresent && purchasablePlans.length > 0,
    /** Still resolving — render neither branch yet, to avoid a flash. */
    loading: tokenPresent && isLoading,
    tokenPresent,
    purchasablePlans,
  };
}
