import { useState } from "react";
import {
  Ban, CheckCircle2, ChevronDown, ChevronUp, Settings2, Trash2, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ALL_MENU_IDS } from "@/lib/accessMenus";

import TenantModulesPanel from "./TenantModulesPanel";
import type { Plan, PoTenant } from "./types";

/**
 * One workspace in the PO tenant list, with its inline module panel — split
 * out of PoTenants.tsx in Stage 4.13. Every mutation is a callback: this
 * component never calls an RPC, so there is one place (the page) that decides
 * what a suspend, a plan change or a delete actually does.
 */
export default function TenantRow({
  tenant,
  plans,
  currentModules,
  onSetStatus,
  onAssignPlan,
  onRemove,
  onModulesSaved,
}: {
  tenant: PoTenant;
  plans: Plan[];
  currentModules: string[];
  onSetStatus: (id: string, status: string) => void;
  onAssignPlan: (id: string, planId: string) => void;
  onRemove: (id: string, name: string) => void;
  onModulesSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const granted = currentModules.length;
  const total = ALL_MENU_IDS.length;

  return (
    <div className={cn(
      "rounded-xl border transition-all duration-200",
      expanded ? "border-primary/30 bg-primary/5" : "border-border/50 bg-card/60",
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">

        {/* Workspace name + status */}
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{tenant.name}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                tenant.status === "active"
                  ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                  : "border-amber-500/40 text-amber-500 bg-amber-500/10",
              )}
            >
              {tenant.status}
            </Badge>
            {tenant.sub_status === "expired" && (
              <Badge variant="outline" className="text-xs border-destructive/40 text-destructive bg-destructive/10">
                sub expired
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {tenant.owner_email ?? "—"}
          </p>
        </div>

        {/* Members */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Users className="h-3.5 w-3.5" />
          {tenant.member_count}
        </div>

        {/* Module count pill */}
        <button
          type="button"
          title="Click to customize module access"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors shrink-0",
            expanded
              ? "border-primary/50 bg-primary/10 text-primary"
              : granted === total
                ? "border-emerald-500/40 bg-emerald-500/8 text-emerald-600 hover:border-primary/40"
                : "border-amber-500/40 bg-amber-500/8 text-amber-600 hover:border-primary/40",
          )}
        >
          <Settings2 className="h-3 w-3" />
          {granted}/{total} modules
        </button>

        {/* Plan selector */}
        <Select
          value={plans.find((p) => p.name === tenant.plan_name)?.id ?? ""}
          onValueChange={(v) => onAssignPlan(tenant.id, v)}
        >
          <SelectTrigger className="h-8 w-28 text-xs shrink-0">
            <SelectValue placeholder={tenant.plan_name ?? "—"} />
          </SelectTrigger>
          <SelectContent>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status toggle + delete */}
        <div className="flex items-center gap-1 shrink-0">
          {tenant.status === "active" ? (
            <Button
              size="sm" variant="ghost"
              className="h-8 gap-1 text-xs text-amber-500 hover:text-amber-400"
              onClick={() => onSetStatus(tenant.id, "suspended")}
            >
              <Ban className="h-3.5 w-3.5" /> Suspend
            </Button>
          ) : (
            <Button
              size="sm" variant="ghost"
              className="h-8 gap-1 text-xs text-emerald-500 hover:text-emerald-400"
              onClick={() => onSetStatus(tenant.id, "active")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Activate
            </Button>
          )}
          <Button
            size="icon" variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onRemove(tenant.id, tenant.name)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon" variant="ghost"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Customize modules"}
          >
            {expanded
              ? <ChevronUp className="h-4 w-4" />
              : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expandable module panel */}
      {expanded && (
        <TenantModulesPanel
          tenantId={tenant.id}
          tenantName={tenant.name}
          currentModules={currentModules}
          onSaved={() => { onModulesSaved(); setExpanded(false); }}
        />
      )}
    </div>
  );
}
