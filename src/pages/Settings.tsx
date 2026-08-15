import { useState } from "react";
import {
  Settings as SettingsIcon,
  Layout,
  LayoutDashboard,
  Sparkles,
  Palette,
  Check,
  Users,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { DEVICE_LOCAL_HINT } from "@/lib/deviceLocal";
import DeleteAccountCard from "@/components/settings/DeleteAccountCard";
import SampleDataCard from "@/components/settings/SampleDataCard";
import SupportCard from "@/components/settings/SupportCard";
import AppLockSettings from "@/components/settings/AppLockSettings";
import {
  useDashboardLayout,
  setDashboardLayout,
  type DashboardLayout,
} from "@/lib/dashboardLayout";

const DASHBOARD_LAYOUTS: { id: DashboardLayout; label: string; description: string; icon: typeof LayoutDashboard }[] = [
  { id: "wealth", label: "Wealth", description: "New layout — net worth, health score & cash flow.", icon: Sparkles },
  { id: "classic", label: "Classic", description: "The original dashboard with hero & metric cards.", icon: LayoutDashboard },
];

export default function SettingsPage() {
  const { theme, setTheme, presets } = useTheme();
  const dashboardLayout = useDashboardLayout();
  const [layout, setLayout] = useState<"comfortable" | "compact">("comfortable");
  const [cats, setCats] = useState<Record<string, boolean>>({
    Salary: true, Freelance: true, Rental: false,
    "Food & Dining": true, Transport: true, Entertainment: false,
  });

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[1100px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Preferences</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
          <SettingsIcon className="w-7 h-7" /> Settings
        </h1>
      </header>

      {/* Interface Personalization */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" /> Interface Personalization
            </h2>
            <p className="text-sm text-muted-foreground">
              Pick a global theme — all surfaces, inputs, calendars and ledgers update instantly.
            </p>
            <p className="text-xs text-muted-foreground/80 mt-1">{DEVICE_LOCAL_HINT}.</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            Active: {presets.find((p) => p.id === theme)?.label}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {presets.map((p) => {
            const active = theme === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setTheme(p.id);
                  toast.success(`${p.label} theme applied`);
                }}
                aria-pressed={active}
                className={cn(
                  "group relative text-left rounded-xl border p-3 transition-all overflow-hidden",
                  "hover:border-primary/40 hover:shadow-sm",
                  active
                    ? "border-primary ring-2 ring-primary/40 shadow-md"
                    : "border-border/50 bg-card/40",
                )}
              >
                {active && (
                  <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
                <div
                  className="h-16 w-full rounded-lg border border-border/60 flex overflow-hidden mb-3"
                  aria-hidden
                >
                  {p.swatch.map((c, i) => (
                    <div
                      key={i}
                      className="flex-1 h-full"
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="text-sm font-semibold text-foreground leading-tight">
                  {p.label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {p.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dashboard layout */}
      <div className="glass-card p-6 space-y-4">
        <div>
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-primary" /> Dashboard layout
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose how your dashboard home page is arranged. Switch back anytime.
          </p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            {DEVICE_LOCAL_HINT} — a phone and a desktop can use different layouts.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DASHBOARD_LAYOUTS.map((l) => {
            const active = dashboardLayout === l.id;
            const Icon = l.icon;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setDashboardLayout(l.id);
                  toast.success(`${l.label} dashboard applied`);
                }}
                aria-pressed={active}
                className={cn(
                  "relative text-left rounded-xl border p-4 transition-all flex items-start gap-3",
                  active ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "border-border/50 hover:border-primary/40 hover:bg-accent/30",
                )}
              >
                {active && (
                  <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
                <span className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  <Icon className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-foreground">{l.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{l.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-1 gap-4">
        <div className="glass-card p-6 space-y-4">
          <h2 className="font-display font-semibold text-foreground">Layout density</h2>
          <div className="grid grid-cols-2 gap-3">
            {(["comfortable", "compact"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={cn(
                  "h-20 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all capitalize",
                  layout === l ? "border-primary bg-primary/10 text-primary" : "border-border/40 hover:bg-accent/30"
                )}
              >
                <Layout className="w-5 h-5" />
                <span className="text-sm font-medium">{l}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="font-display font-semibold text-foreground">Categories visibility</h2>
        <p className="text-sm text-muted-foreground">Hide categories you don't use; they'll disappear from pickers and charts.</p>
        <div className="divide-y divide-border/30 mt-2">
          {Object.entries(cats).map(([name, on]) => (
            <div key={name} className="flex items-center justify-between py-3">
              <Label className="font-normal">{name}</Label>
              <Switch checked={on} onCheckedChange={(v) => setCats((p) => ({ ...p, [name]: v }))} />
            </div>
          ))}
        </div>
      </div>

      {/* App Lock (PIN) */}
      <AppLockSettings />

      {/* Team & Permissions — now lives in Workspace */}
      <Link
        to="/app/workspace"
        className="glass-card p-5 flex items-center justify-between gap-4 group hover:border-primary/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-display font-semibold text-foreground text-sm">
              Team &amp; Permissions
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Invite collaborators, grant per-member module access, and manage recurring entries — all in Workspace.
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </Link>

      {/* Stage 5.3 — renders only while sample data exists. */}
      <SampleDataCard />

      {/* Stage 5.7 — the way to reach a human, above the irreversible thing. */}
      <SupportCard />

      {/* Stage 5.2 — last on the page on purpose: it is the one action here
          that cannot be undone. */}
      <DeleteAccountCard />
    </div>
  );
}