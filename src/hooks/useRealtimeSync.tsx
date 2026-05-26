import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

/**
 * Subscribes to realtime changes on transactions, budgets, and goals for the
 * current user. Any INSERT/UPDATE/DELETE invalidates the matching react-query
 * cache key so dashboard metrics recompute instantly.
 */
export function useRealtimeSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const tables = ["transactions", "budgets", "goals"] as const;

    const channel = supabase.channel(`realtime:user:${user.id}`);

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: [table] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });

          if (payload.eventType === "INSERT") {
            toast({
              title: "Dashboard updated",
              description: `New ${table.slice(0, -1)} synced in realtime.`,
            });
          }
        },
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
}