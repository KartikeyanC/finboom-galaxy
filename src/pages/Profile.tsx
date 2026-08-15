import { useEffect, useState } from "react";
import { User, Mail, Globe, Loader2, Sparkles, CheckCircle2, ArrowRight, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { useTenantSetting } from "@/hooks/useTenantSetting";


/* ── Plan info ─────────────────────────────────────────────────────────────── */
const ROOTS_FEATURES = ["Unlimited transactions", "1 budget cycle", "3 active goals", "Email digests"];
const PRO_FEATURES   = ["Everything in Roots", "Unlimited budgets & goals", "Multi-currency portfolio", "Screenshot → transaction AI", "Insurance carryover engine"];

function PlanCard() {
  const { currentTenantId } = useTenant();
  const navigate = useNavigate();
  const [plan, setPlan]     = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [end, setEnd]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenantId) return;
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan_name, status, current_period_end")
        .eq("tenant_id", currentTenantId)
        .order("current_period_end", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      setPlan(data?.plan_name ?? "Roots");
      setStatus(data?.status ?? "free");
      setEnd(data?.current_period_end ?? null);
      setLoading(false);
    })();
  }, [currentTenantId]);

  const isPro    = plan?.toLowerCase().includes("pro");
  const isActive = status === "active" || status === "trialing";

  if (loading) return (
    <div className="glass-card p-6 flex items-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading plan…
    </div>
  );

  return (
    <div className={cn(
      "glass-card p-6 space-y-4",
      isPro && "border-primary/30 bg-primary/5",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            {isPro ? <Crown className="w-4 h-4 text-primary" /> : <Sparkles className="w-4 h-4 text-muted-foreground" />}
            Current Plan
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-bold font-display text-foreground">{plan ?? "Roots"}</span>
            <Badge variant={isActive && isPro ? "default" : "secondary"} className="text-xs">
              {isActive ? (status === "trialing" ? "Trial" : "Active") : "Free"}
            </Badge>
          </div>
          {end && isPro && (
            <p className="text-xs text-muted-foreground">
              Renews {new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>

        {!isPro && (
          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => navigate("/billing")}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Upgrade to Pro
          </Button>
        )}
        {isPro && (
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => navigate("/billing")}>
            Manage plan
          </Button>
        )}
      </div>

      {/* features */}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {(isPro ? PRO_FEATURES : ROOTS_FEATURES).map(f => (
          <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className={cn("w-3.5 h-3.5 shrink-0", isPro ? "text-primary" : "text-muted-foreground/60")} />
            {f}
          </div>
        ))}
      </div>

      {/* upgrade banner for free users */}
      {!isPro && (
        <button
          onClick={() => navigate("/billing")}
          className="w-full mt-1 rounded-lg border border-primary/20 bg-primary/8 hover:bg-primary/12 transition-colors p-3 flex items-center justify-between gap-3 group"
        >
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Upgrade to Pro — ₹199/mo</p>
            <p className="text-xs text-muted-foreground">Unlimited budgets, AI bill scan, multi-currency & more</p>
          </div>
          <ArrowRight className="w-4 h-4 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Stage 3.1: base currency is the WORKSPACE's reporting currency, stored in
  // tenant_settings. It was a per-device localStorage value, which meant two
  // members could render the same shared figures in different currencies —
  // the numbers are not converted, so that made reports quietly wrong.
  const { value: savedBase, setValue: persistBase } = useTenantSetting("base_currency");
  const base = (savedBase as "INR" | "USD" | "AED") || "INR";
  const setBase = (next: "INR" | "USD" | "AED") => persistBase(next);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load the real profile.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, mobile")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setName(
        data?.display_name ||
          (user.user_metadata?.display_name as string | undefined) ||
          user.email?.split("@")[0] ||
          "",
      );
      setPhone(data?.mobile ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    // Persist to the profiles table (used across the app, e.g. member lists).
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim() || null, mobile: phone.trim() || null })
      .eq("id", user.id);
    if (error) {
      setSaving(false);
      return notifyError(error);
    }
    // Also update auth metadata so the sidebar / session reflect the new name.
    const { error: metaErr } = await supabase.auth.updateUser({
      data: { display_name: name.trim() },
    });
    setSaving(false);
    if (metaErr) return notifyError(metaErr);
    toast.success("Profile saved");
  };

  const initials = (name || "U").slice(0, 2).toUpperCase();

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[900px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Account</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
          <User className="w-7 h-7" /> Profile
        </h1>
      </header>

      <div className="glass-card p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/60 to-chart-2/60 flex items-center justify-center text-xl font-bold">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg font-bold text-foreground">{name || "—"}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-1 truncate">
            <Mail className="w-3.5 h-3.5" /> {user?.email ?? "—"}
          </div>
        </div>
      </div>

      <PlanCard />

      <div className="glass-card p-6 space-y-4">
        <h2 className="font-display font-semibold text-foreground">Personal details</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={name} disabled={loading} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} disabled={loading} placeholder="+91 …" onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-4 h-4" /> Base currency
        </h2>
        <p className="text-sm text-muted-foreground">Used as the default for new transactions and dashboard totals.</p>
        <p className="text-xs text-muted-foreground/80">
          Applies to the whole workspace and everyone in it, on every device — amounts are not
          converted, so members must read the same figures in the same currency.
        </p>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {(["INR", "USD", "AED"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setBase(c)}
              className={cn(
                "h-12 rounded-md border text-sm font-medium transition-all",
                base === c ? "border-primary bg-primary/10 text-primary" : "border-border/40 hover:bg-accent/30",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  );
}
