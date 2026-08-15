import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlanMenuCatalogue } from "@/hooks/useMenuLocks";
import {
  mergeWorkspaces,
  type ActivityMonthRow,
  type AnalyticsWorkspace,
  type EngagementRow,
  type TenantRow,
} from "@/lib/analytics";
import { type PlanCatalogueRow } from "@/lib/menuUpsell";

/**
 * Stage 5.8 — the only thing here that talks to the database.
 *
 * Three reads, and one of them is allowed to be missing. `po_list_tenants()`
 * and the plan catalogue exist today, so growth, conversion and the plan mix
 * render on a database where the 5.8 migration has not been applied. Activation
 * and retention need the new functions, and when those are absent this reports
 * `engagementMissing` rather than throwing — a console that cannot open is
 * worse than one that says which migration it is waiting for.
 */

/**
 * PostgREST's code for "no such function", plus the message it used to send —
 * kept even though `20260812120000_stage5_analytics.sql` is now applied, as a
 * defensive fallback rather than a required one: a database rolled back to an
 * older schema (a restore, a different environment) should still degrade to
 * `engagementMissing` instead of throwing.
 */
function isMissingFunction(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    /could not find the function|does not exist/i.test(error.message)
  );
}

/** How many months of history the page asks for. */
export const ANALYTICS_MONTHS = 12;

export interface PoAnalytics {
  workspaces: AnalyticsWorkspace[];
  activity: ActivityMonthRow[];
  plans: PlanCatalogueRow[];
  /** True when the 5.8 migration is not applied — activation and retention are blind. */
  engagementMissing: boolean;
  loading: boolean;
  error: Error | null;
}

export function usePoAnalytics(months: number = ANALYTICS_MONTHS): PoAnalytics {
  const tenantsQ = useQuery({
    queryKey: ["po-analytics-tenants"],
    queryFn: async (): Promise<TenantRow[]> => {
      const { data, error } = await supabase.rpc("po_list_tenants");
      if (error) throw error;
      return (data ?? []) as TenantRow[];
    },
  });

  const plansQ = usePlanMenuCatalogue();

  const engagementQ = useQuery({
    queryKey: ["po-analytics-engagement"],
    queryFn: async (): Promise<EngagementRow[] | null> => {
      const { data, error } = await supabase.rpc("po_tenant_engagement");
      // `null` means "the database cannot answer this yet", which is a state
      // the page renders. Any other error is a real failure and must surface.
      if (isMissingFunction(error)) return null;
      if (error) throw new Error(error.message);
      return (data ?? []) as EngagementRow[];
    },
  });

  const activityQ = useQuery({
    queryKey: ["po-analytics-activity", months],
    queryFn: async (): Promise<ActivityMonthRow[]> => {
      const { data, error } = await supabase.rpc("po_tenant_activity_months", { p_months: months });
      if (isMissingFunction(error)) return [];
      if (error) throw new Error(error.message);
      return (data ?? []) as ActivityMonthRow[];
    },
  });

  const workspaces = useMemo(
    () => mergeWorkspaces(tenantsQ.data ?? [], engagementQ.data ?? null),
    [tenantsQ.data, engagementQ.data],
  );

  return {
    workspaces,
    activity: activityQ.data ?? [],
    plans: plansQ.data ?? [],
    // Only claim the migration is missing once the query has actually settled;
    // `undefined` while loading must not paint the warning banner.
    engagementMissing: engagementQ.isSuccess && engagementQ.data === null,
    loading: tenantsQ.isLoading || plansQ.isLoading || engagementQ.isLoading || activityQ.isLoading,
    error: (tenantsQ.error as Error | null) ?? (engagementQ.error as Error | null) ?? null,
  };
}
