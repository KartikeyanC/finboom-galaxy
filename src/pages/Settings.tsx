import { useState } from "react";
import {
  Settings as SettingsIcon,
  Layout,
  Palette,
  Check,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import PermissionsCenter from "@/components/permissions/PermissionsCenter";

export default function SettingsPage() {
  const { theme, setTheme, presets } = useTheme();
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
          </div>
          <Badge variant="secondary" className="text-[11px]">
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
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {p.description}
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

      {/* Account Share & Permissions Center (moved from Accounts) */}
      <PermissionsCenter />
    </div>
  );
}