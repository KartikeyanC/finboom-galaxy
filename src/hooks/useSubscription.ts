import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export type SubscriptionStatus = {
  plan_name: string | null;
  status: string | null;
  current_period_end: string | null;
  provider: string | null;
};

/** Date-aware subscription status for the current tenant (Phase 4). */
export function useSubscription() {
  const { currentTenantId } = useTenant();
  return useQuery({
    queryKey: ["subscription-status", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tenant_subscription_status", {
        p_tenant_id: currentTenantId as string,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as SubscriptionStatus | null;
    },
  });
}
