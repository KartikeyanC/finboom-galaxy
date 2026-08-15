import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { ALL_MENU_IDS } from "@/lib/accessMenus";

import AddTenantDialog from "./tenants/AddTenantDialog";
import TenantRow from "./tenants/TenantRow";
import type { Plan, PoTenant } from "./tenants/types";

/* ─────────────────────────── PoTenants (main page) ─────────────────────────── */

export default function PoTenants() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["po-tenants"] });

  const tenantsQ = useQuery({
    queryKey: ["po-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("po_list_tenants");
      if (error) throw error;
      return (data ?? []) as PoTenant[];
    },
  });

  // Stage 3.5: workspaces inside the 30-day restore window.
  const deletedQ = useQuery({
    queryKey: ["po-deleted-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("po_list_deleted_tenants");
      if (error) throw error;
      return (data ?? []) as {
        id: string; name: string; deleted_at: string;
        purge_after: string; days_left: number;
      }[];
    },
  });

  const restoreTenant = async (id: string, name: string) => {
    const { error } = await supabase.rpc("po_restore_tenant", { p_tenant_id: id });
    if (error) return notifyError(error, { title: "Could not restore that workspace" });
    toast.success(`"${name}" restored`);
    refresh();
    qc.invalidateQueries({ queryKey: ["po-deleted-tenants"] });
  };

  const purgeTenant = async (id: string, name: string) => {
    // The point of the window is that destruction is deliberate. Typing the name
    // is the only irreversible confirmation in the console, and it should be.
    const typed = prompt(
      `Permanently purge "${name}"? This cannot be undone.\n\nType the workspace name to confirm:`,
    );
    if (typed !== name) {
      if (typed !== null) toast.error("Name did not match — nothing was purged");
      return;
    }
    const { error } = await supabase.rpc("po_purge_tenant", { p_tenant_id: id });
    if (error) return notifyError(error, { title: "Could not purge that workspace" });
    toast.success(`"${name}" permanently purged`);
    refresh();
    qc.invalidateQueries({ queryKey: ["po-deleted-tenants"] });
  };

  // Separately fetch tenant menu overrides so we can display per-row module counts
  const menuOverridesQ = useQuery({
    queryKey: ["po-tenant-menus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, menu_overrides");
      if (error) return {} as Record<string, string[]>;
      const map: Record<string, string[]> = {};
      for (const row of data ?? []) {
        const overrides = row.menu_overrides as { allow?: string[] } | null;
        if (overrides?.allow) map[row.id as string] = overrides.allow;
      }
      return map;
    },
  });

  const plansQ = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans").select("id, name, menu_set, is_default").eq("is_active", true);
      if (error) throw error;
      return (data ?? []).map((p) => {
        const set = p.menu_set as unknown;
        const ids = Array.isArray(set) ? (set as string[]) : [];
        return {
          id: p.id as string,
          name: p.name as string,
          is_default: p.is_default as boolean,
          menu_set: ids.includes("*") ? [...ALL_MENU_IDS] : ids,
        };
      }) as Plan[];
    },
  });

  // A tenant with no menu_overrides falls back to what its plan actually
  // grants (BUG-110) — not the full 14-item ceiling, which only "*" plans get.
  // No active subscription resolves to the default plan, matching
  // plan_menus()/default_plan() in SQL — never a hardcoded plan name, which
  // is exactly what broke here once "Free" was renamed to "Roots".
  const planMenus = (planName: string | null): string[] => {
    const plans = plansQ.data ?? [];
    const match = plans.find((p) => p.name === planName) ?? plans.find((p) => p.is_default);
    return match?.menu_set ?? [...ALL_MENU_IDS];
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.rpc("po_set_tenant_status", {
      p_tenant_id: id, p_status: status,
    });
    if (error) return notifyError(error);
    toast.success(`Tenant ${status}`);
    refresh();
  };

  const assignPlan = async (id: string, planId: string) => {
    const { error } = await supabase.rpc("po_assign_plan", {
      p_tenant_id: id, p_plan_id: planId,
    });
    if (error) return notifyError(error);
    toast.success("Plan updated");
    refresh();
  };

  // Stage 3.5: deletion is now reversible for 30 days, so the warning says what
  // actually happens rather than the old "this removes all of its data".
  const remove = async (id: string, name: string) => {
    if (
      !confirm(
        `Delete "${name}"?\n\nIt becomes inaccessible immediately, but can be restored ` +
          `for 30 days. After that it is permanently purged.`,
      )
    )
      return;
    const { error } = await supabase.rpc("po_delete_tenant", { p_tenant_id: id });
    if (error) return notifyError(error);
    toast.success(`"${name}" deleted — restorable for 30 days`);
    refresh();
    qc.invalidateQueries({ queryKey: ["po-deleted-tenants"] });
  };

  const handleModulesSaved = () => {
    qc.invalidateQueries({ queryKey: ["po-tenant-menus"] });
    refresh();
  };

  const rows = tenantsQ.data ?? [];
  const plans = plansQ.data ?? [];
  const menuMap = menuOverridesQ.data ?? {};
  const deleted = deletedQ.data ?? [];

  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            FinRoot · Owner Console
          </span>
          <h1 className="font-display text-2xl font-bold text-foreground mt-1">Tenants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create workspaces, assign plans, and customize which modules each tenant can use.
          </p>
        </div>
        <AddTenantDialog onCreated={refresh} plans={plans} />
      </div>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total tenants", value: rows.length, color: "text-foreground" },
            { label: "Active", value: activeCount, color: "text-emerald-500" },
            { label: "Suspended", value: rows.length - activeCount, color: "text-amber-500" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border/50 bg-card/50 px-4 py-3 text-center">
              <p className={cn("font-display text-2xl font-bold", s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* How-to hint */}
      <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 px-4 py-3 text-xs text-muted-foreground">
        <Settings2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
        <span>
          When creating a tenant you select which modules to enable for that workspace.
          For existing tenants, click the{" "}
          <strong className="text-foreground">X/Y modules</strong> pill or the{" "}
          <strong className="text-foreground">↕</strong> chevron to customise access at any time.
        </span>
      </div>

      {/* Tenant list */}
      <div className="space-y-2">
        {tenantsQ.isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tenants…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card/50 py-16 text-center text-muted-foreground text-sm">
            <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
            No tenants yet. Click <strong>Add tenant</strong> to create the first one.
          </div>
        ) : (
          rows.map((t) => (
            <TenantRow
              key={t.id}
              tenant={t}
              plans={plans}
              currentModules={menuMap[t.id] ?? planMenus(t.plan_name)}
              onSetStatus={setStatus}
              onAssignPlan={assignPlan}
              onRemove={remove}
              onModulesSaved={handleModulesSaved}
            />
          ))
        )}
      </div>

      {/* Stage 3.5 — the 30-day restore window. Only rendered when something is
          actually in it, so the console does not carry a permanent empty box. */}
      {deleted.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Recently deleted
            </h2>
            <p className="text-sm text-muted-foreground">
              Already inaccessible to their members. Restorable until the purge date, after
              which they are removed permanently — the nightly job does this automatically.
            </p>
          </div>

          {deleted.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{d.name}</div>
                <div className="text-xs text-muted-foreground">
                  Deleted {new Date(d.deleted_at).toLocaleDateString("en-IN")} ·{" "}
                  {d.days_left > 0 ? (
                    <>
                      <strong>{d.days_left}</strong> day{d.days_left === 1 ? "" : "s"} left to
                      restore
                    </>
                  ) : (
                    <span className="text-destructive">due for purge</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => restoreTenant(d.id, d.name)}>
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => purgeTenant(d.id, d.name)}
                >
                  Purge now
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
