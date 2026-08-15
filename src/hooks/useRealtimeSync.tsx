import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "@/hooks/use-toast";

/**
 * Keeps the cache fresh when transactions, budgets or goals change.
 *
 * ---- Stage 4.10 / BUG-049 ----
 *
 * This used to toast "Dashboard updated" on every INSERT — while subscribed
 * with `filter: user_id=eq.<me>`. So every event it could possibly see was one
 * the user had just caused themselves, and the toast fired immediately after
 * the mutation's own "Transaction added": two notifications, every time, for
 * one action.
 *
 * The subscription is now scoped by **tenant** rather than user, which is both
 * the fix and a feature the old filter made impossible: a collaborator's edit
 * never reached anyone else's screen. A toast is worth showing for *their*
 * change, so the announcement is kept and gated on the actor.
 */
export function useRealtimeSync() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || !currentTenantId) return;

    const tables = ["transactions", "budgets", "goals"] as const;
    const channel = supabase.channel(`realtime:tenant:${currentTenantId}`);

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          // Workspace-scoped: everyone working in it sees each other's changes.
          filter: `tenant_id=eq.${currentTenantId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: [table] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });

          if (payload.eventType !== "INSERT") return;

          // Only announce someone ELSE's work. Our own inserts already showed a
          // confirmation from the mutation that caused them.
          const actor = (payload.new as { user_id?: string } | null)?.user_id;
          if (!actor || actor === user.id) return;

          toast({
            title: "Workspace updated",
            description: `A teammate added a ${table.slice(0, -1)}.`,
          });
        },
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentTenantId, queryClient]);
}
