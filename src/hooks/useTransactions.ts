import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type TxnType = "income" | "expense";

export interface Transaction {
  id: string;
  user_id: string;
  type: TxnType;
  amount: number;
  currency: string;
  category: string;
  description: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionInput {
  type: TxnType;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
  occurred_at: string;
}

export function useTransactions(type?: TxnType) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["transactions", type ?? "all", user?.id],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false });
      if (type) query = query.eq("type", type);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

export function useCreateTransaction() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TransactionInput) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TransactionInput> & { id: string }) => {
      const { data, error } = await supabase
        .from("transactions")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}