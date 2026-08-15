import { useState } from "react";
import { Check, Loader2, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";

import ModuleGrid from "./ModuleGrid";

/**
 * Inline expandable panel under a tenant row — shows current module access
 * and lets the PO toggle modules on/off for that entire tenant.
 */
export default function TenantModulesPanel({
  tenantId,
  tenantName,
  currentModules,
  onSaved,
}: {
  tenantId: string;
  tenantName: string;
  currentModules: string[];
  onSaved: () => void;
}) {
  const [modules, setModules] = useState<string[]>(currentModules);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("po_set_tenant_menus", {
      p_tenant_id: tenantId,
      p_menus: { allow: modules },
    });
    setSaving(false);
    if (error) return notifyError(error);
    toast.success(`Module access updated for ${tenantName}`);
    onSaved();
  };

  const changed =
    modules.length !== currentModules.length ||
    modules.some((m) => !currentModules.includes(m));

  return (
    <div className="border-t border-border/40 px-5 pb-5 pt-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Settings2 className="h-4 w-4 text-primary" />
            Module Access for <span className="text-primary">{tenantName}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toggle which FinRoot pages this workspace can use. Takes effect immediately.
          </p>
        </div>
        {changed && (
          <Button size="sm" className="gap-1.5 shrink-0" onClick={save} disabled={saving}>
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
              : <><Check className="h-3.5 w-3.5" /> Save changes</>
            }
          </Button>
        )}
      </div>

      <ModuleGrid selected={modules} onChange={setModules} />

      {changed && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-amber-500">
            Unsaved changes — click Save to apply.
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => setModules(currentModules)}
            >
              Discard
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
