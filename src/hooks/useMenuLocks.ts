import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/contexts/AccessContext";
import { useTenant } from "@/contexts/TenantContext";
import { useSubscription } from "@/hooks/useSubscription";
import {
  menuLock,
  resolveCurrentPlan,
  type MenuLock,
  type PlanCatalogueRow,
} from "@/lib/menuUpsell";

/**
 * Stage 5.5 — the plan catalogue, including each plan's `menu_set`.
 *
 * `plans` is public read-only catalogue data (the landing page already reads
 * it for prices), so this needs no new RPC and no migration. It is fetched
 * once and cached for the session: a price list does not change while somebody
 * is looking at a dashboard.
 */
export function usePlanMenuCatalogue() {
  return useQuery({
    queryKey: ["plans-menu-catalogue"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<PlanCatalogueRow[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("id,name,price_cents,currency,interval,is_active,menu_set,is_default,created_at")
        .eq("is_active", true)
        .order("price_cents", { ascending: true });
      if (error || !data) return [];
      return (data as unknown as (Omit<PlanCatalogueRow, "menu_set"> & { menu_set: unknown })[]).map(
        (p) => ({
          ...p,
          // `menu_set` is jsonb: an array of menu ids, or ["*"].
          menu_set: Array.isArray(p.menu_set) ? (p.menu_set as string[]) : [],
        }),
      );
    },
  });
}

export interface MenuLocks {
  /** Why this menu is unavailable — "none" when it is available. */
  lockOf: (menuId: string) => MenuLock;
  /** The plan actually in force (an expired subscription resolves to default). */
  currentPlan: PlanCatalogueRow | null;
  plans: PlanCatalogueRow[];
  /** Only a workspace owner can act on an upgrade; everyone else must ask. */
  canUpgrade: boolean;
  /** True until every input has resolved. Render no paywall while true. */
  loading: boolean;
}

export function useMenuLocks(): MenuLocks {
  const { allowedMenus, canAccess, accessLoading } = useAccess();
  const { role } = useTenant();
  const { data: plans, isLoading: plansLoading } = usePlanMenuCatalogue();
  const { data: sub, isLoading: subLoading } = useSubscription();

  const currentPlan = useMemo(
    () => resolveCurrentPlan(plans ?? [], sub ?? null),
    [plans, sub],
  );

  const loading = accessLoading || plansLoading || subLoading;

  const lockOf = useCallback(
    (menuId: string): MenuLock => {
      // ALWAYS_ALLOWED menus (settings, profile, …) never appear in the
      // effective list, so ask the context rather than the raw array — it is
      // the one place that rule lives.
      if (canAccess(menuId)) return { kind: "none" };
      if (loading) return { kind: "unknown" };
      return menuLock({ menuId, allowedMenus, plans, currentPlan });
    },
    [canAccess, loading, allowedMenus, plans, currentPlan],
  );

  return {
    lockOf,
    currentPlan,
    plans: plans ?? [],
    canUpgrade: role === "owner",
    loading,
  };
}
