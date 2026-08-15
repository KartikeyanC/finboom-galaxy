import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Notification = {
  id: string;
  tenant_id: string | null;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const items = query.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = useCallback(async () => {
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (!error) qc.invalidateQueries({ queryKey: ["notifications"] });
  }, [qc]);

  return { items, unread, loading: query.isLoading, markAllRead };
}
