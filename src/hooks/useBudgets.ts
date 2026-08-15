import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";

export interface Budget {
  id: string;
  user_id: string;
  tenant_id: string;
  bucket: string;
  allocated: number;
  spent: number;
  period: string;
  period_start: string;
  created_at: string;
  updated_at: string;
}

/** What a client may set. `spent` is absent on purpose — it is derived. */
export interface BudgetInput {
  bucket: string;
  allocated: number;
  period?: string;
  period_start?: string;
}

export function useBudgets() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  return useQuery({
    queryKey: ["budgets", user?.id, currentTenantId],
    enabled: !!user && !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("period_start", { ascending: false })
        .order("bucket", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Budget[];
    },
  });
}

/**
 * Set what a bucket is allocated for a period.
 *
 * Creating and editing are the same call: `budget_set_allocation` upserts on
 * (tenant, bucket, period_start), so two members setting the same bucket end up
 * with one row rather than two competing ones (BUG-040). The RPC also rejects a
 * negative allocation and never touches `spent` — that has been derived from
 * transactions since roadmap 2.4.
 */
export function useSetBudgetAllocation() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BudgetInput) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { data, error } = await supabase.rpc("budget_set_allocation", {
        p_tenant_id: currentTenantId,
        p_bucket: input.bucket,
        p_allocated: input.allocated,
        p_period: input.period ?? "monthly",
        p_period_start: input.period_start ?? null,
      });
      if (error) throw error;
      return data as unknown as Budget;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget saved");
    },
    onError: (e) => notifyError(e),
  });
}

export function useDeleteBudget() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget deleted");
    },
    onError: (e) => notifyError(e),
  });
}