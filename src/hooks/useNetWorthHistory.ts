import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface NetWorthPoint {
  /** Short label for the x-axis, e.g. "Mar" or "Mar 12". */
  month: string;
  value: number;
  capturedOn: string;
  assets: number;
  liabilities: number;
}

interface SnapshotRow {
  captured_on: string;
  assets: number | string;
  liabilities: number | string;
  net_worth: number | string;
}

/** "2026-03-12" -> "Mar 12" (no Date parsing, so no timezone drift). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function label(capturedOn: string): string {
  const [, m, d] = capturedOn.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/**
 * Real net-worth history, read from `net_worth_snapshots`.
 *
 * Also records today's figures once per mount (upserting on the
 * `(tenant_id, captured_on)` unique key) so history accumulates simply by using
 * the app — no scheduled job required. A pg_cron job can be added later and
 * will collide harmlessly on the same key.
 *
 * Returns an empty array until real data exists. That is deliberate: the
 * previous implementation invented a six-month trend, and an honest empty state
 * is better than a convincing fake one.
 */
export function useNetWorthHistory(current?: { assets: number; liabilities: number }) {
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const queryKey = useMemo(
    () => ["net_worth_snapshots", currentTenantId] as const,
    [currentTenantId],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("net_worth_snapshots")
        .select("captured_on, assets, liabilities, net_worth")
        .eq("tenant_id", currentTenantId as string)
        .order("captured_on", { ascending: true });
      if (error) throw error;

      return ((data ?? []) as SnapshotRow[]).map<NetWorthPoint>((r) => ({
        month: label(r.captured_on),
        value: Number(r.net_worth) || 0,
        capturedOn: r.captured_on,
        assets: Number(r.assets) || 0,
        liabilities: Number(r.liabilities) || 0,
      }));
    },
  });

  // Record today's value once per mount, and only when there is something to
  // record — an all-zero workspace should not start logging empty snapshots.
  const recordedRef = useRef(false);
  useEffect(() => {
    if (!currentTenantId || isLoading || recordedRef.current || !current) return;
    const { assets, liabilities } = current;
    if (assets === 0 && liabilities === 0) return;

    recordedRef.current = true;
    void (async () => {
      const today = new Date();
      const capturedOn = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");

      const { error } = await supabase.from("net_worth_snapshots").upsert(
        {
          tenant_id: currentTenantId,
          captured_on: capturedOn,
          assets,
          liabilities,
          net_worth: assets - liabilities,
        },
        { onConflict: "tenant_id,captured_on" },
      );
      // Silent on failure: recording history must never interrupt the page.
      if (!error) qc.invalidateQueries({ queryKey: ["net_worth_snapshots"] });
    })();
  }, [currentTenantId, isLoading, current, qc]);

  return { history: data ?? [], isLoading };
}
