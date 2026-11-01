import {
  Settings as SettingsIcon,
  Layout,
  LayoutDashboard,
  Sparkles,
  Palette,
  Check,
  Users,
  ArrowRight,
  Sun,
  Moon,
  Rows3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useLayoutDensity, setLayoutDensity, type LayoutDensity } from "@/lib/layoutDensity";
import { INCOME_CATEGORIES } from "@/lib/finance";
import { EXPENSE_CATEGORY_GROUPS } from "@/lib/expenseSubcategories";
import { useCustomCategories, useHiddenCategories } from "@/lib/categories";

const DENSITIES: { id: LayoutDensity; label: string; description: string; icon: typeof Layout }[] = [
  { id: "comfortable", label: "Comfortable", description: "Roomy spacing — easy on the eyes.", icon: Layout },
  { id: "compact", label: "Compact", description: "Tighter cards, more on one screen.", icon: Rows3 },
];

const DASHBOARD_LAYOUTS: { id: DashboardLayout; label: string; description: string; icon: typeof LayoutDashboard }[] = [
  { id: "wealth", label: "Wealth", description: "New layout — net worth, health score & cash flow.", icon: Sparkles },
  { id: "classic", label: "Classic", description: "The original dashboard with hero & metric cards.", icon: LayoutDashboard },
];

export default function SettingsPage() {
  const { mode, setMode, palette, setPalette, palettes } = useTheme();
  const dashboardLayout = useDashboardLayout();
  const density = useLayoutDensity();
  const { store: customCats } = useCustomCategories();
  const { isHidden, setHidden } = useHiddenCategories();
  const categoryLists: { type: "expense" | "income"; title: string; names: string[] }[] = [
    {
      type: "expense",
      title: "Expense",
      names: [...new Set([...EXPENSE_CATEGORY_GROUPS.map((g) => g.name), ...customCats.expense])],
    },
    {
      type: "income",
      title: "Income",
      names: [...new Set([...INCOME_CATEGORIES, ...customCats.income.active, ...customCats.income.passive])],
    },
  ];

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[1100px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Preferences</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
          <SettingsIcon className="w-7 h-7" /> Settings
        </h1>
      </header>

      {/* Appearance: NineFlow's model, a mode plus a colour theme */}
      <div className="glass-card p-5 space-y-5">
        <div>
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" /> Appearance
          </h2>
          <p className="text-sm text-muted-foreground">
            Light or dark, and a colour theme. The FinRoot logo stays green in every theme.
          </p>
          <p className="text-xs text-muted-foreground mt-1">{DEVICE_LOCAL_HINT}.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">Mode</Label>
          <Tabs value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
            <TabsList>
              <TabsTrigger value="light" className="gap-1.5"><Sun className="h-4 w-4" /> Light</TabsTrigger>
              <TabsTrigger value="dark" className="gap-1.5"><Moon className="h-4 w-4" /> Dark</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">Colour theme</Label>
          <div className="flex flex-wrap gap-2">
            {palettes.map((p) => {
              const active = palette === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPalette(p.id)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-2.5 h-10 rounded-full border pl-1.5 pr-4 text-sm font-semibold transition",
                    active ? "border-primary bg-accent text-primary" : "border-border bg-card text-foreground hover:bg-background",
                  )}
                >
                  <span
                    className="h-7 w-7 rounded-full border border-border flex items-center justify-center"
                    style={{ background: p.swatch[0] }}
                    aria-hidden
                  >
                    <span className="h-4 w-4 rounded-full flex items-center justify-center" style={{ background: p.swatch[1] }}>
                      {active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                  </span>
                  {p.label}
                </button>
              );
            })}
          </div>
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

      <div className="glass-card p-6 space-y-4">
        <div>
          <h2 className="font-display font-semibold text-foreground">Layout density</h2>
          <p className="text-sm text-muted-foreground mt-1">
            How much breathing room the app pages have. Text stays the same size.
          </p>
          <p className="text-xs text-muted-foreground mt-1">{DEVICE_LOCAL_HINT}</p>
        </div>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Layout density">
          {DENSITIES.map((d) => {
            const Icon = d.icon;
            const active = density === d.id;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setLayoutDensity(d.id);
                  toast.success(`${d.label} spacing on`);
                }}
                className={cn(
                  "min-h-20 rounded-lg border p-3 flex flex-col items-center justify-center gap-1 text-center transition-all",
                  active ? "border-primary bg-primary/10 text-primary" : "border-border/40 hover:bg-accent/30",
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{d.label}</span>
                <span className="text-xs text-muted-foreground leading-snug">{d.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="font-display font-semibold text-foreground">Categories visibility</h2>
        <p className="text-sm text-muted-foreground">
          Switch off the categories your household never uses, and they leave the category pickers for everyone in
          this workspace. Past entries and your totals still count them — nothing is deleted.
        </p>
        <div className="grid md:grid-cols-2 gap-6 mt-2">
          {categoryLists.map((list) => (
            <div key={list.type}>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{list.title}</div>
              <div className="divide-y divide-border/30">
                {list.names.map((name) => {
                  const id = `cat-${list.type}-${name}`;
                  return (
                    <div key={name} className="flex items-center justify-between py-3">
                      <Label htmlFor={id} className="font-normal">{name}</Label>
                      <Switch
                        id={id}
                        checked={!isHidden(list.type, name)}
                        onCheckedChange={(on) => setHidden(list.type, name, !on)}
                      />
                    </div>
                  );
                })}
              </div>
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