import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notifyError } from "@/lib/errorMessages";
import type { DeletionRequest } from "@/lib/accountDeletion";

/**
 * The signed-in person's own deletion request (RLS shows only theirs), and
 * the two things they can do with it. Both go through SECURITY DEFINER
 * functions that also write audit_log; the table itself is read-only to
 * them.
 */
export function useAccountDeletion() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["account-deletion", user?.id];

  const query = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async (): Promise<DeletionRequest | null> => {
      const { data, error } = await supabase
        .from("account_deletion_requests")
        .select("requested_at, purge_after, cancelled_at, completed_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const request = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("request_account_deletion");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e) => notifyError(e),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("cancel_account_deletion");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e) => notifyError(e),
  });

  return { row: query.data ?? null, loading: query.isLoading, failed: query.isError, request, cancel };
}
