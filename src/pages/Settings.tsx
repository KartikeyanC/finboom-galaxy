import { useState } from "react";
import {
  Settings as SettingsIcon,
  Layout,
  Users,
  Lock,
  Mail,
  ShieldCheck,
  Eye,
  X,
  CalendarIcon,
  AlertTriangle,
  Plus,
  Palette,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

type CollaboratorRole = "admin" | "viewer";
type Collaborator = { id: string; name: string; email: string; role: CollaboratorRole };

export default function SettingsPage() {
  const { theme, setTheme, presets } = useTheme();
  const [layout, setLayout] = useState<"comfortable" | "compact">("comfortable");
  const [cats, setCats] = useState<Record<string, boolean>>({
    Salary: true, Freelance: true, Rental: false,
    "Food & Dining": true, Transport: true, Entertainment: false,
  });

  // Permissions & date-lock state
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("viewer");
  const [dateLockEnabled, setDateLockEnabled] = useState(false);
  const [lockStart, setLockStart] = useState<Date | undefined>();
  const [lockEnd, setLockEnd] = useState<Date | undefined>();

  const lockInvalid = dateLockEnabled && lockStart && lockEnd && lockStart > lockEnd;
  const today = new Date();
  const outsideWindow =
    dateLockEnabled &&
    lockStart &&
    lockEnd &&
    !lockInvalid &&
    (today < lockStart || today > lockEnd);

  const addCollaborator = () => {
    const name = inviteName.trim();
    const email = inviteEmail.trim();
    if (!name || !email) return toast.error("Enter name and email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Invalid email");
    if (collaborators.some((c) => c.email.toLowerCase() === email.toLowerCase()))
      return toast.error("Already invited");
    setCollaborators((p) => [
      ...p,
      { id: crypto.randomUUID(), name, email, role: inviteRole },
    ]);
    setInviteName("");
    setInviteEmail("");
    setInviteRole("viewer");
    toast.success(`Invited ${name} as ${inviteRole}`);
  };

  const removeCollaborator = (id: string) =>
    setCollaborators((p) => p.filter((c) => c.id !== id));

  const updateRole = (id: string, role: CollaboratorRole) =>
    setCollaborators((p) => p.map((c) => (c.id === id ? { ...c, role } : c)));

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

      {/* Permissions Panel */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Sharing & Permissions
            </h2>
            <p className="text-sm text-muted-foreground">
              Invite collaborators and control admin/viewer access to your workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {collaborators.map((c) => (
              <Badge
                key={c.id}
                variant="secondary"
                className="gap-1.5 pl-2 pr-1 py-1"
              >
                {c.role === "admin" ? (
                  <ShieldCheck className="w-3 h-3" />
                ) : (
                  <Eye className="w-3 h-3" />
                )}
                <span className="text-[11px]">
                  {c.role === "admin" ? "Co-Admin" : "Viewer"}: {c.name}
                </span>
              </Badge>
            ))}
            {dateLockEnabled && lockStart && lockEnd && !lockInvalid && (
              <Badge
                variant="outline"
                className="gap-1.5 border-amber-500/40 text-amber-500"
              >
                <CalendarIcon className="w-3 h-3" />
                {format(lockStart, "dd MMM")} – {format(lockEnd, "dd MMM")}
              </Badge>
            )}
          </div>
        </div>

        {/* Invite row */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_140px_auto] gap-2">
          <Input
            placeholder="Name"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as CollaboratorRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={addCollaborator} className="gap-1">
            <Plus className="w-4 h-4" /> Invite
          </Button>
        </div>

        {/* Collaborator list */}
        {collaborators.length > 0 && (
          <div className="divide-y divide-border/30 rounded-lg border border-border/40">
            {collaborators.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={c.role}
                    onValueChange={(v) => updateRole(c.id, v as CollaboratorRole)}
                  >
                    <SelectTrigger className="h-8 w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeCollaborator(c.id)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Date-locked access */}
        <div className="rounded-lg border border-border/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              <Label className="font-medium">Date-Restricted Work Window</Label>
            </div>
            <Switch checked={dateLockEnabled} onCheckedChange={setDateLockEnabled} />
          </div>
          {dateLockEnabled && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { label: "Start", value: lockStart, set: setLockStart },
                  { label: "End", value: lockEnd, set: setLockEnd },
                ] as const).map((f) => (
                  <Popover key={f.label}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start font-normal",
                          !f.value && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {f.value ? format(f.value, "PPP") : `${f.label} date`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={f.value}
                        onSelect={f.set}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                ))}
              </div>
              {lockInvalid && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5" /> Start date must be before end date.
                </div>
              )}
              {outsideWindow && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-500">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  This workspace is locked for editing outside the specified operational dates.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}