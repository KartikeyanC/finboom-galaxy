import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type RecurringType = "income" | "expense";
export type RecurringFrequency = "monthly" | "weekly" | "yearly" | "one-time";

export interface RecurringItem {
  id: string;
  user_id: string;
  type: RecurringType;
  name: string;
  category: string;
  subtype: string | null;
  amount: number;
  currency: string;
  fx_rate: number;
  frequency: RecurringFrequency;
  next_due_date: string;
  last_generated_at: string | null;
  icon: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecurringInput {
  type: RecurringType;
  name: string;
  category: string;
  subtype?: string | null;
  amount: number;
  currency: string;
  fx_rate: number;
  frequency: RecurringFrequency;
  next_due_date: string;
  icon?: string | null;
  notes?: string | null;
}

export function useRecurring(type?: RecurringType) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["recurring", type ?? "all", user?.id],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("recurring_items")
        .select("*")
        .order("next_due_date", { ascending: true });
      if (type) q = q.eq("type", type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RecurringItem[];
    },
  });
}

export function useCreateRecurring() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecurringInput) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("recurring_items")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Recurring item added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function bumpDate(iso: string, freq: RecurringFrequency): string {
  const d = new Date(iso);
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else if (freq === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Generate a transaction from a recurring item and advance next_due_date. */
export function useMarkRecurring() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: RecurringItem) => {
      if (!user) throw new Error("Not signed in");
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user.id,
        type: item.type,
        amount: item.amount,
        currency: item.currency,
        category: item.category,
        description: item.name + (item.notes ? ` — ${item.notes}` : ""),
        occurred_at: new Date(item.next_due_date).toISOString(),
        source_recurring_id: item.id,
      } as never);
      if (txErr) throw txErr;

      if (item.frequency === "one-time") {
        const { error } = await supabase
          .from("recurring_items")
          .update({ is_active: false, last_generated_at: new Date().toISOString() })
          .eq("id", item.id);
        if (error) throw error;
      } else {
        const next = bumpDate(item.next_due_date, item.frequency);
        const { error } = await supabase
          .from("recurring_items")
          .update({ next_due_date: next, last_generated_at: new Date().toISOString() })
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, item) => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(item.type === "income" ? "Marked received" : "Marked paid");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}