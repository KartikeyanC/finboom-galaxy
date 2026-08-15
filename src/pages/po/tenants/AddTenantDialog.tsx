import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { ALL_MENU_IDS } from "@/lib/accessMenus";

import ModuleGrid from "./ModuleGrid";
import type { Plan } from "./types";

/* ─────────────────────────── plan presets ─────────────────────────── */

const ROOTS_MODULES = ["dashboard", "income", "expenses", "budget", "goals", "reminders", "calculator"];
const PRO_MODULES   = [...ALL_MENU_IDS];

const PLAN_CARDS = [
  {
    key: "roots",
    label: "Roots",
    price: "Free",
    desc: "For anyone starting the habit.",
    features: ["Unlimited transactions", "1 budget cycle", "3 active goals", "Email digests"],
    modules: ROOTS_MODULES,
    border: "border-border/50 hover:border-primary/40",
    activeBorder: "border-primary/60 bg-primary/5",
    badge: null,
  },
  {
    key: "pro",
    label: "Pro",
    price: "₹199/mo",
    desc: "For households serious about wealth.",
    features: ["Everything in Roots", "Unlimited budgets & goals", "Multi-currency portfolio", "Screenshot → transaction AI", "Insurance carryover engine"],
    modules: PRO_MODULES,
    border: "border-amber-500/30 hover:border-amber-500/60",
    activeBorder: "border-amber-500/60 bg-amber-500/5",
    badge: "Most chosen",
  },
] as const;

/**
 * The three-step create-workspace wizard (details → plan → modules) — split
 * out of PoTenants.tsx in Stage 4.13.
 *
 * The plan cards above are PRESENTATION presets: they seed the module set and
 * are matched to a real `plans` row by name. The catalogue in the database
 * remains the source of truth for what a plan costs and grants — these cards
 * only decide what the PO sees pre-ticked before creating the workspace.
 */
export default function AddTenantDialog({ onCreated, plans }: { onCreated: () => void; plans: Plan[] }) {
  const [open, setOpen]       = useState(false);
  const [step, setStep]       = useState<1 | 2 | 3>(1);
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [planKey, setPlanKey] = useState<"roots" | "pro">("roots");
  const [planId, setPlanId]   = useState<string>("");
  const [modules, setModules] = useState<string[]>([...ROOTS_MODULES]);
  const [busy, setBusy]       = useState(false);

  const reset = () => {
    setStep(1); setName(""); setEmail("");
    setPlanKey("roots"); setPlanId("");
    setModules([...ROOTS_MODULES]);
  };

  const goToStep2 = () => {
    if (!name.trim()) return toast.error("Enter a workspace name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return toast.error("Enter a valid owner email");
    setStep(2);
  };

  const selectPlan = (key: "roots" | "pro") => {
    const card = PLAN_CARDS.find(c => c.key === key)!;
    setPlanKey(key);
    setModules([...card.modules]);
    // match to DB plan by name
    const matched = plans.find(p => p.name.toLowerCase().includes(key));
    setPlanId(matched?.id ?? "");
  };

  const goToStep3 = () => setStep(3);

  const create = async () => {
    setBusy(true);
    const { data: tenantData, error: createErr } = await supabase
      .rpc("po_create_tenant", { p_name: name.trim(), p_owner_email: email.trim() });
    if (createErr) { setBusy(false); return notifyError(createErr); }

    const tenantId = (tenantData as unknown as { id?: string })?.id ?? tenantData;
    if (tenantId) {
      // assign plan
      if (planId) {
        await supabase.rpc("po_assign_plan", { p_tenant_id: tenantId, p_plan_id: planId });
      }
      // apply module access
      await supabase.rpc("po_set_tenant_menus", {
        p_tenant_id: tenantId,
        p_menus: { allow: modules },
      });
    }

    setBusy(false);
    toast.success(`"${name.trim()}" created on ${planKey === "pro" ? "Pro" : "Roots"} with ${modules.length} modules`);
    reset(); setOpen(false); onCreated();
  };

  const STEPS = ["Workspace", "Plan", "Modules"];

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add tenant
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            {step === 1 ? "Create Tenant" : step === 2 ? "Choose Plan" : "Customize Modules"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-1">
          {STEPS.map((label, i) => {
            const s = (i + 1) as 1 | 2 | 3;
            return (
              <div key={s} className="flex items-center gap-1">
                <div className={cn(
                  "h-6 w-6 rounded-full text-xs font-semibold flex items-center justify-center transition-colors shrink-0",
                  step === s ? "bg-primary text-primary-foreground"
                    : s < step ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground",
                )}>
                  {s < step ? <Check className="h-3 w-3" strokeWidth={3} /> : s}
                </div>
                <span className={cn("text-xs", step === s ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {label}
                </span>
                {s < 3 && <div className="h-px w-5 bg-border/60 mx-1" />}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Workspace details ── */}
        {step === 1 && (
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Workspace name</Label>
              <Input id="t-name" value={name} placeholder="e.g. Acme Family"
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && goToStep2()} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-email">Owner email</Label>
              <Input id="t-email" type="email" value={email} placeholder="owner@email.com"
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && goToStep2()} />
              <p className="text-xs text-muted-foreground">
                The owner must already have a FinRoot account.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 2: Plan selection ── */}
        {step === 2 && (
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose a plan for <strong className="text-foreground">{name}</strong>.
              This pre-sets the available modules — you can fine-tune them in the next step.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PLAN_CARDS.map(card => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => selectPlan(card.key)}
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-all space-y-3",
                    planKey === card.key ? card.activeBorder : card.border,
                  )}
                >
                  {card.badge && (
                    <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-amber-500 text-[11px] font-semibold text-black uppercase tracking-wide">
                      {card.badge}
                    </span>
                  )}
                  {planKey === card.key && (
                    <span className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                    </span>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
                    <p className="font-display text-xl font-bold text-foreground">{card.price}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{card.desc}</p>
                  </div>
                  <ul className="space-y-1">
                    {card.features.map(f => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" strokeWidth={3} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground pt-1 border-t border-border/30">
                    {card.modules.length} modules pre-enabled
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Module customization ── */}
        {step === 3 && (
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Fine-tune which modules <strong className="text-foreground">{name}</strong> can access.
              Pre-set from <strong className="text-foreground">{planKey === "pro" ? "Pro" : "Roots"}</strong> plan.
            </p>
            <div className="max-h-[320px] overflow-y-auto pr-1">
              <ModuleGrid selected={modules} onChange={setModules} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={busy}>
              Back
            </Button>
          )}
          <Button variant="ghost" onClick={() => { setOpen(false); reset(); }} disabled={busy}>
            Cancel
          </Button>
          {step === 1 && <Button onClick={goToStep2}>Next — Choose plan</Button>}
          {step === 2 && <Button onClick={goToStep3}>Next — Customize modules</Button>}
          {step === 3 && (
            <Button onClick={create} disabled={busy || modules.length === 0}>
              {busy
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Creating…</>
                : `Create tenant · ${modules.length} module${modules.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

