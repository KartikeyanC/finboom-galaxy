import { useState } from "react";
import { Settings as SettingsIcon, Moon, Sun, Layout } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
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

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-card p-6 space-y-4">
          <h2 className="font-display font-semibold text-foreground">Theme</h2>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: "dark", label: "Dark", icon: Moon },
              { id: "light", label: "Light", icon: Sun },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "h-20 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all",
                  theme === t.id ? "border-primary bg-primary/10 text-primary" : "border-border/40 hover:bg-accent/30"
                )}
              >
                <t.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

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
    </div>
  );
}