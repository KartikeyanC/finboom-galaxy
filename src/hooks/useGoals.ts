import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";

export interface Goal {
  id: string;
  user_id: string;
  tenant_id: string;
  title: string;
  category: string | null;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface GoalInput {
  title: string;
  category?: string | null;
  target_amount: number;
  current_amount?: number;
  currency?: string;
  target_date?: string | null;
  status?: string;
}

export function useGoals() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  return useQuery({
    queryKey: ["goals", user?.id, currentTenantId],
    enabled: !!user && !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });
}

export function useCreateGoal() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GoalInput) => {
      if (!user) throw new Error("Not signed in");
      if (!currentTenantId) throw new Error("No workspace selected");
      const { data, error } = await supabase
        .from("goals")
        .insert({ ...input, user_id: user.id, tenant_id: currentTenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal added");
    },
    onError: (e) => notifyError(e),
  });
}

export function useUpdateGoal() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<GoalInput> & { id: string }) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { data, error } = await supabase
        .from("goals")
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", currentTenantId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal updated");
    },
    onError: (e) => notifyError(e),
  });
}

export interface GoalContribution {
  goal_id: string;
  requested: number;
  applied: number;
  current_amount: number;
  target_amount: number;
  status: string;
  /** True when the amount was trimmed to fit the goal (overshoot or floor). */
  capped: boolean;
}

/**
 * Add (or, with a negative amount, take back) funds on a goal.
 *
 * Goes through `goal_contribute` rather than reading `current_amount` and
 * writing the sum back: the RPC locks the row, so two people contributing at
 * the same moment can no longer erase each other's deposit (BUG-040). It also
 * owns the invariants — never below zero, never past the target, and the
 * status flips itself.
 */
export function useContributeToGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goalId, amount }: { goalId: string; amount: number }) => {
      const { data, error } = await supabase.rpc("goal_contribute", {
        p_goal_id: goalId,
        p_amount: amount,
      });
      if (error) throw error;
      return data as unknown as GoalContribution;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      if (result.capped && result.status === "completed") {
        toast.success("Goal reached", {
          description: `Only ${result.applied} was needed, so that is what we added.`,
        });
      } else if (result.status === "completed") {
        toast.success("Goal reached 🎉");
      } else {
        toast.success("Funds added");
      }
    },
    onError: (e) => notifyError(e),
  });
}

export function useDeleteGoal() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase
        .from("goals")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal deleted");
    },
    onError: (e) => notifyError(e),
  });
}