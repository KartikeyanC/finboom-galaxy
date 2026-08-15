import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type AuditRow = {
  id: string;
  actor_email: string | null;
  tenant_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export default function PoAudit() {
  const q = useQuery({
    queryKey: ["po-audit"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("po_audit_log", { p_limit: 200 });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
  const rows = q.data ?? [];

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Every critical operation across the platform.</p>
      </div>
      <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-muted-foreground text-xs">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">When</th>
              <th className="text-left font-medium px-4 py-2.5">Action</th>
              <th className="text-left font-medium px-4 py-2.5">Tenant</th>
              <th className="text-left font-medium px-4 py-2.5">Actor</th>
              <th className="text-left font-medium px-4 py-2.5">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-border/40 align-top">
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{new Date(a.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 font-medium">{a.action}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{a.tenant_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[180px]">{a.actor_email ?? "system"}</td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">
                  {a.metadata ? JSON.stringify(a.metadata) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {q.isLoading ? "Loading…" : "No audit entries yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
