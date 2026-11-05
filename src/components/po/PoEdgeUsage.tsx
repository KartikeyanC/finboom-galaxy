import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, BellRing } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notifyError } from "@/lib/errorMessages";
import {
  BUILT_IN_LIMIT,
  LIMITS_KEY,
  isNotApplied,
  summarise,
  type EdgeLimits,
  type UsageRow,
} from "@/lib/edgeUsage";
import { cn } from "@/lib/utils";

/**
 * Stage 5.9 — what the edge functions are being asked to do, against the
 * limits that page the platform admins. Counting and alerting happen in
 * Postgres the moment a limit is crossed (record_edge_call); this card is for
 * looking, and for setting the limits.
 */
export default function PoEdgeUsage() {
  const qc = useQueryClient();

  const usage = useQuery({
    queryKey: ["po-edge-usage"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 25 * 3_600_000).toISOString();
      const { data, error } = await supabase
        .from("edge_usage")
        .select("fn, hour, calls, errors")
        .gte("hour", since);
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
  });

  const alerts = useQuery({
    queryKey: ["po-edge-alerts"],
    enabled: usage.isSuccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edge_usage_alerts")
        .select("fn, period, kind, limit_value, observed, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const limits = useQuery({
    queryKey: ["po-edge-limits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", LIMITS_KEY)
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? null) as EdgeLimits | null;
    },
  });

  const [draft, setDraft] = useState({ hour: "", day: "", rate: "" });
  useEffect(() => {
    const d = limits.data?.default ?? {};
    setDraft({
      hour: String(d.hour ?? BUILT_IN_LIMIT.hour),
      day: String(d.day ?? BUILT_IN_LIMIT.day),
      rate: String(Math.round((d.error_rate ?? BUILT_IN_LIMIT.error_rate ?? 0) * 100)),
    });
  }, [limits.data]);

  const save = useMutation({
    mutationFn: async () => {
      const hour = Number(draft.hour);
      const day = Number(draft.day);
      const rate = Number(draft.rate);
      if (![hour, day].every((n) => Number.isInteger(n) && n > 0) || !(rate > 0 && rate <= 100)) {
        throw new Error("Limits must be whole numbers above zero, and the error rate 1–100%.");
      }
      const next = { ...(limits.data ?? {}), default: { hour, day, error_rate: rate / 100 } };
      const { error } = await supabase.rpc("po_set_site_setting", {
        p_key: LIMITS_KEY,
        p_value: next as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limits saved — they apply from the next call");
      qc.invalidateQueries({ queryKey: ["po-edge-limits"] });
    },
    onError: (e) => notifyError(e),
  });

  const notApplied = usage.isError && isNotApplied(usage.error);
  const rows = usage.data ? summarise(usage.data, limits.data) : [];
  const fmt = (n: number) => n.toLocaleString("en-IN");

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" /> Edge usage
        </h2>
        <p className="text-xs text-muted-foreground">
          Calls that reached each function, against its limits. Going over a limit, or more than the
          error rate failing in an hour, notifies every platform admin once for that hour or day.
        </p>
      </div>

      {notApplied ? (
        <p className="text-xs text-amber-500" role="status">
          Not switched on yet: migration <code>20261105120000_stage5_edge_usage.sql</code> has not been
          applied, and the functions need redeploying to start counting.
        </p>
      ) : usage.isError ? (
        <p className="text-xs text-destructive">Couldn't load edge usage.</p>
      ) : usage.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 font-medium">Function</th>
                <th className="py-1 font-medium text-right">This hour</th>
                <th className="py-1 font-medium text-right">Today</th>
                <th className="py-1 font-medium text-right">24 h errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((u) => (
                <tr key={u.fn} className={cn(u.over && "text-destructive")}>
                  <td className="py-1.5 pr-2">
                    <div className="font-medium">{u.fn}</div>
                    <div
                      className="mt-1 h-1 w-full max-w-[10rem] rounded bg-muted overflow-hidden"
                      role="meter"
                      aria-label={`${u.fn} use of its limit`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(Math.min(u.load, 1) * 100)}
                    >
                      <div
                        className={cn("h-full", u.over ? "bg-destructive" : u.load > 0.8 ? "bg-amber-500" : "bg-primary")}
                        style={{ width: `${Math.min(u.load, 1) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-1.5 text-right">
                    {fmt(u.lastHour)}
                    <span className="text-muted-foreground"> / {u.limit.hour ? fmt(u.limit.hour) : "∞"}</span>
                  </td>
                  <td className="py-1.5 text-right">
                    {fmt(u.today)}
                    <span className="text-muted-foreground"> / {u.limit.day ? fmt(u.limit.day) : "∞"}</span>
                  </td>
                  <td className={cn("py-1.5 text-right", u.failing && "text-destructive font-semibold")}>
                    {fmt(u.errors24)}
                    {u.failing && (
                      <span className="block text-[10px] font-normal">
                        {Math.round((u.errors24 / u.day24) * 100)}% failing
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(alerts.data?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-xs font-semibold mb-1 flex items-center gap-1.5">
            <BellRing className="h-3.5 w-3.5 text-amber-500" /> Recent alerts
          </h3>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {alerts.data!.map((a) => (
              <li key={`${a.fn}-${a.period}-${a.kind}-${a.created_at}`}>
                {new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                <span className="text-foreground">{a.fn}</span>{" "}
                {a.kind === "calls"
                  ? `passed ${fmt(Number(a.limit_value))} calls in an ${a.period === "hour" ? "hour" : "day"}`
                  : `failing ${Math.round(Number(a.observed) * 100)}% of calls in an hour`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {(
          [
            ["hour", "Calls / hour"],
            ["day", "Calls / day"],
            ["rate", "Error rate %"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="text-xs text-muted-foreground space-y-1">
            <span className="block">{label}</span>
            <Input
              inputMode="numeric"
              value={draft[k]}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              className="h-8 w-28 text-xs"
            />
          </label>
        ))}
        <Button type="submit" size="sm" disabled={save.isPending || limits.isLoading}>
          Save limits
        </Button>
        <p className="basis-full text-[11px] text-muted-foreground">
          These apply to every function. A single function can be given its own limits in{" "}
          <code>{LIMITS_KEY}</code> (see the migration).
        </p>
      </form>
    </div>
  );
}
