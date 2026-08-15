import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { ledgerPeriodSince, type LedgerPeriod } from "@/lib/ledgerPeriod";

/**
 * `transfer` moves money between the user's own accounts. It is deliberately
 * excluded from income and spend aggregates — counting it as both inflates
 * earnings and spending and corrupts the savings rate.
 */
export type TxnType = "income" | "expense" | "transfer";

export interface Transaction {
  id: string;
  user_id: string;
  tenant_id: string;
  type: TxnType;
  amount: number;
  currency: string;
  category: string;
  description: string | null;
  occurred_at: string;
  /**
   * Stage 3.4. The account the money left or entered. For a transfer this is
   * the SOURCE. Replaces the old `[Mode|accountId]` description prefix.
   */
  account_id: string | null;
  /** Stage 3.4. UPI / Cash / Card / Net Banking / Wallet / Cheque. */
  payment_mode: string | null;
  /** Destination account; set only when type is "transfer". */
  transfer_to_account_id: string | null;
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
  /** Stage 3.4. Source account for a transfer, the paying account otherwise. */
  account_id?: string | null;
  /** Stage 3.4. NULL for transfers — "Transfer" is not a payment mode. */
  payment_mode?: string | null;
  /** Required when type is "transfer"; must be null otherwise (DB-enforced). */
  transfer_to_account_id?: string | null;
}

/**
 * Every transaction in the workspace, or only those inside a period.
 *
 * Stage 4.2: `period` is OPT-IN and defaults to "all", so no existing caller
 * silently starts receiving a subset. Views that genuinely need the whole
 * ledger — Export, global search — say nothing and keep it. The ledger views
 * pass a window; see `lib/ledgerPeriod.ts` for why that is a period selector
 * rather than infinite scroll.
 */
export function useTransactions(
  type?: TxnType,
  period: LedgerPeriod = "all",
  options?: { enabled?: boolean },
) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  // Resolved once per render rather than inside queryFn: it is part of the
  // cache key, and a key that drifts from the data it fetched is a stale-cache
  // bug waiting to happen. Day granularity is enough — the window only ever
  // starts at midnight — and it keeps the key stable within a day.
  const since = ledgerPeriodSince(period);
  const sinceKey = since ? since.slice(0, 10) : "all";

  return useQuery({
    // The tenant id is part of the key so switching workspaces cannot serve
    // another workspace's rows from cache.
    queryKey: ["transactions", type ?? "all", sinceKey, user?.id, currentTenantId],
    // `enabled` lets a component that is always mounted but rarely used — the
    // global search dialog — defer its fetch until it is actually opened.
    enabled: !!user && !!currentTenantId && (options?.enabled ?? true),
    queryFn: async () => {
      // RLS returns rows for EVERY workspace the user belongs to, so the
      // filter here is what actually scopes the result to the active one.
      let query = supabase
        .from("transactions")
        .select("*")
        .eq("tenant_id", currentTenantId as string)
        .order("occurred_at", { ascending: false });
      if (type) query = query.eq("type", type);
      // Bounded at the server, so a long history never reaches the browser.
      // Uses the Stage 4.4 index on (tenant_id, type, occurred_at DESC).
      if (since) query = query.gte("occurred_at", since);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

export function useCreateTransaction() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TransactionInput) => {
      if (!user) throw new Error("Not signed in");
      if (!currentTenantId) throw new Error("No workspace selected");
      // Set tenant_id explicitly rather than relying on the column default
      // (current_tenant_id() resolves to the user's FIRST membership, which is
      // the wrong workspace for anyone who belongs to more than one).
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...input, user_id: user.id, tenant_id: currentTenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction added");
    },
    onError: (e) => notifyError(e),
  });
}

export function useUpdateTransaction() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TransactionInput> & { id: string }) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { data, error } = await supabase
        .from("transactions")
        .update(patch)
        .eq("id", id)
        // Guard: an id from another workspace must not be editable from here.
        .eq("tenant_id", currentTenantId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction updated");
    },
    onError: (e) => notifyError(e),
  });
}

export function useDeleteTransaction() {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!currentTenantId) throw new Error("No workspace selected");
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("tenant_id", currentTenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction deleted");
    },
    onError: (e) => notifyError(e),
  });
}