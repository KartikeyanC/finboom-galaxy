import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";

export type RecurringType = "income" | "expense";
export type RecurringFrequency = "monthly" | "weekly" | "yearly" | "one-time";

export interface RecurringItem {
  id: string;
  user_id: string;
  tenant_id: string;
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
  const { currentTenantId } = useTenant();
  return useQuery({
    queryKey: ["recurring", type ?? "all", user?.id, currentTenantId],
    enabled: !!user && !!currentTenantId,
    queryFn: async () => {
      let q = supabase
        .from("recurring_items")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
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
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecurringInput) => {
      if (!user) throw new Error("Not signed in");
      if (!currentTenantId) throw new Error("No workspace selected");
      const { data, error } = await supabase
        .from("recurring_items")
        .insert({ ...input, user_id: user.id, tenant_id: currentTenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Recurring item added");
    },
    onError: (e) => notifyError(e),
  });
}

export function useDeleteRecurring() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase
        .from("recurring_items")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Removed");
    },
    onError: (e) => notifyError(e),
  });
}

/**
 * Advance a YYYY-MM-DD date by one period.
 *
 * All arithmetic is done on the date parts in UTC so the result never depends
 * on the viewer's timezone, and month/year steps clamp to the last valid day
 * instead of overflowing: Jan 31 + 1 month is Feb 28 (or 29), not Mar 3.
 */
export function bumpDate(iso: string, freq: RecurringFrequency): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);

  if (freq === "weekly") {
    return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  }

  let targetY = y;
  let targetM = m;
  if (freq === "yearly") {
    targetY = y + 1;
  } else if (freq === "monthly") {
    targetM = m === 12 ? 1 : m + 1;
    targetY = m === 12 ? y + 1 : y;
  }

  // Day 0 of the following month === last day of the target month.
  const lastDay = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
  const day = Math.min(d, lastDay);

  return `${targetY}-${String(targetM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Generate a transaction from a recurring item and advance next_due_date. */
export function useMarkRecurring() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: RecurringItem) => {
      if (!user) throw new Error("Not signed in");
      if (!currentTenantId) throw new Error("No workspace selected");
      // The generated transaction belongs to the same workspace as its source
      // item, not to whichever workspace the column default would pick.
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user.id,
        tenant_id: item.tenant_id ?? currentTenantId,
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
          .eq("id", item.id)
          .eq("tenant_id", currentTenantId);
        if (error) throw error;
      } else {
        const next = bumpDate(item.next_due_date, item.frequency);
        const { error } = await supabase
          .from("recurring_items")
          .update({ next_due_date: next, last_generated_at: new Date().toISOString() })
          .eq("id", item.id)
          .eq("tenant_id", currentTenantId);
        if (error) throw error;
      }
    },
    onSuccess: (_d, item) => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(item.type === "income" ? "Marked received" : "Marked paid");
    },
    onError: (e) => notifyError(e),
  });
}