import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Budget {
  id: string;
  user_id: string;
  bucket: string;
  allocated: number;
  spent: number;
  period: string;
  period_start: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetInput {
  bucket: string;
  allocated: number;
  spent?: number;
  period?: string;
  period_start?: string;
}

export function useBudgets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["budgets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .order("period_start", { ascending: false })
        .order("bucket", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Budget[];
    },
  });
}

export function useCreateBudget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BudgetInput) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("budgets")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<BudgetInput> & { id: string }) => {
      const { data, error } = await supabase
        .from("budgets")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}