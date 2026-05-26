import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Goal {
  id: string;
  user_id: string;
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
  return useQuery({
    queryKey: ["goals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });
}

export function useCreateGoal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GoalInput) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("goals")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<GoalInput> & { id: string }) => {
      const { data, error } = await supabase
        .from("goals")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}