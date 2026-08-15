import { useQuery } from "@tanstack/react-query";
import { Building2, Users, CreditCard, AlertTriangle, UserPlus, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Stats = {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  total_users: number;
  total_collaborators: number;
  active_subscriptions: number;
  expired_subscriptions: number;
  plan_breakdown: Record<string, number>;
  new_tenants_30d: number;
  finance_totals: { income: number; expense: number };
};

type Activity = {
  id: string;
  actor_email: string | null;
  tenant_name: string | null;
  action: string;
  entity: string | null;
  created_at: string;
};

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Building2; label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className={`h-4 w-4 ${tone ?? "text-primary"}`} /> {label}
      </div>
      <div className="mt-2 text-2xl font-display font-semibold">{value}</div>
    </div>
  );
}

export default function PoDashboard() {
  const statsQ = useQuery({
    queryKey: ["po-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("po_dashboard_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const actQ = useQuery({
    queryKey: ["po-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("po_recent_activity", { p_limit: 20 });
      if (error) throw error;
      return (data ?? []) as Activity[];
    },
  });

  const s = statsQ.data;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">System-wide health and activity.</p>
      </div>

      {statsQ.isLoading || !s ? (
        <div className="text-muted-foreground text-sm">Loading stats…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <Stat icon={Building2} label="Total Tenants" value={s.total_tenants} />
            <Stat icon={Building2} label="Active Tenants" value={s.active_tenants} tone="text-emerald-500" />
            <Stat icon={AlertTriangle} label="Suspended" value={s.suspended_tenants} tone="text-amber-500" />
            <Stat icon={Users} label="Total Users" value={s.total_users} />
            <Stat icon={UserPlus} label="Collaborators" value={s.total_collaborators} />
            <Stat icon={CreditCard} label="Active Subs" value={s.active_subscriptions} tone="text-emerald-500" />
            <Stat icon={AlertTriangle} label="Expired Subs" value={s.expired_subscriptions} tone="text-destructive" />
            <Stat icon={UserPlus} label="New (30d)" value={s.new_tenants_30d} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <h2 className="text-sm font-semibold mb-3">Plan Breakdown</h2>
              <div className="space-y-2">
                {Object.entries(s.plan_breakdown ?? {}).map(([plan, count]) => (
                  <div key={plan} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{plan}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
                {Object.keys(s.plan_breakdown ?? {}).length === 0 && (
                  <div className="text-xs text-muted-foreground">No subscriptions yet.</div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <h2 className="text-sm font-semibold mb-3">Financial Summary (all tenants)</h2>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Income</span>
                <span className="font-medium text-emerald-500">₹{Math.round(s.finance_totals?.income ?? 0).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-muted-foreground">Expense</span>
                <span className="font-medium text-destructive">₹{Math.round(s.finance_totals?.expense ?? 0).toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="rounded-xl border border-border/60 bg-card/60 p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Recent Activity
        </h2>
        <div className="space-y-1.5">
          {(actQ.data ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-border/30 last:border-0">
              <span className="font-medium">{a.action}</span>
              <span className="text-muted-foreground truncate flex-1 text-center">{a.tenant_name ?? "—"}</span>
              <span className="text-muted-foreground truncate">{a.actor_email ?? "system"}</span>
              <span className="text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</span>
            </div>
          ))}
          {(actQ.data?.length ?? 0) === 0 && (
            <div className="text-xs text-muted-foreground">No activity recorded yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
