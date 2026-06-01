import { useEffect, useState } from "react";
import {
  Users,
  Lock,
  Mail,
  ShieldCheck,
  Eye,
  AlertTriangle,
  Settings2,
  Plus,
  X,
  Check,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { useAccess, type AccessProfile } from "@/contexts/AccessContext";
import {
  ACCESS_MENUS,
  ALL_MENU_IDS,
  type Collaborator,
  type CollaboratorRole,
} from "@/lib/accessMenus";

const STORAGE_COLLABS = "finroots.permissions.collaborators";
const STORAGE_LOCK = "finroots.permissions.dateLock";

type StoredLock = {
  enabled: boolean;
  start?: string;
  end?: string;
};

function loadCollabs(): Collaborator[] {
  try {
    const raw = localStorage.getItem(STORAGE_COLLABS);
    return raw ? (JSON.parse(raw) as Collaborator[]) : [];
  } catch {
    return [];
  }
}

function loadLock(): StoredLock {
  try {
    const raw = localStorage.getItem(STORAGE_LOCK);
    return raw ? (JSON.parse(raw) as StoredLock) : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

function PermissionBadges({ menus }: { menus: string[] }) {
  if (menus.length === ALL_MENU_IDS.length) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
      >
        <Check className="h-2.5 w-2.5" />
        All Modules Granted
      </Badge>
    );
  }
  if (menus.length === 0) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-destructive/40 text-destructive bg-destructive/10"
      >
        No module access
      </Badge>
    );
  }
  const labels = menus
    .map((id) => ACCESS_MENUS.find((m) => m.id === id)?.label)
    .filter((x): x is string => Boolean(x));
  const visible = labels.slice(0, 3);
  const overflow = labels.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((l) => (
        <Badge key={l} variant="secondary" className="text-[10px] px-1.5 py-0">
          {l}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          +{overflow} more
        </Badge>
      )}
    </div>
  );
}

export default function PermissionsCenter() {
  const { setProfiles } = useAccess();
  const [collaborators, setCollaborators] = useState<Collaborator[]>(loadCollabs);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("viewer");
  const [inviteMenus, setInviteMenus] = useState<string[]>([...ALL_MENU_IDS]);

  const initialLock = loadLock();
  const [dateLockEnabled, setDateLockEnabled] = useState(initialLock.enabled);
  const [lockStart, setLockStart] = useState<Date | undefined>(
    initialLock.start ? new Date(initialLock.start) : undefined,
  );
  const [lockEnd, setLockEnd] = useState<Date | undefined>(
    initialLock.end ? new Date(initialLock.end) : undefined,
  );

  // Persist collaborators + sync into access context
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COLLABS, JSON.stringify(collaborators));
    } catch {
      /* ignore */
    }
    const profiles: AccessProfile[] = collaborators.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      menus: c.menuAccess,
    }));
    setProfiles(profiles);
  }, [collaborators, setProfiles]);

  // Persist date lock
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_LOCK,
        JSON.stringify({
          enabled: dateLockEnabled,
          start: lockStart?.toISOString(),
          end: lockEnd?.toISOString(),
        }),
      );
    } catch {
      /* ignore */
    }
  }, [dateLockEnabled, lockStart, lockEnd]);

  const lockInvalid =
    dateLockEnabled && lockStart && lockEnd && lockStart > lockEnd;

  const addCollaborator = () => {
    const name = inviteName.trim();
    const email = inviteEmail.trim();
    if (!name || !email) return toast.error("Enter name and email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return toast.error("Invalid email address");
    if (collaborators.some((c) => c.email.toLowerCase() === email.toLowerCase()))
      return toast.error("This email is already a collaborator");
    setCollaborators((p) => [
      ...p,
      {
        id: crypto.randomUUID(),
        name,
        email,
        role: inviteRole,
        menuAccess: [...inviteMenus],
      },
    ]);
    setInviteName("");
    setInviteEmail("");
    setInviteRole("viewer");
    setInviteMenus([...ALL_MENU_IDS]);
    toast.success(`Invited ${name} as ${inviteRole}`);
  };

  const removeCollaborator = (id: string) =>
    setCollaborators((p) => p.filter((c) => c.id !== id));

  const updateRole = (id: string, role: CollaboratorRole) =>
    setCollaborators((p) => p.map((c) => (c.id === id ? { ...c, role } : c)));

  const toggleMenu = (id: string, menuId: string) =>
    setCollaborators((p) =>
      p.map((c) =>
        c.id === id
          ? {
              ...c,
              menuAccess: c.menuAccess.includes(menuId)
                ? c.menuAccess.filter((m) => m !== menuId)
                : [...c.menuAccess, menuId],
            }
          : c,
      ),
    );

  const setMenuAll = (id: string, all: boolean) =>
    setCollaborators((p) =>
      p.map((c) =>
        c.id === id ? { ...c, menuAccess: all ? [...ALL_MENU_IDS] : [] } : c,
      ),
    );

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Account Share & Permissions Center
          </h2>
          <p className="text-sm text-muted-foreground">
            Invite collaborators and control exactly which modules they can access.
          </p>
        </div>
        <Badge variant="secondary" className="text-[11px]">
          {collaborators.length} collaborator
          {collaborators.length === 1 ? "" : "s"}
          {dateLockEnabled ? " · Date-lock active" : ""}
        </Badge>
      </div>

      {/* Invite */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Invite Member
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px_auto] gap-2">
          <Input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Collaborator name"
          />
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@domain.com"
              className="pl-8"
            />
          </div>
          <Select
            value={inviteRole}
            onValueChange={(v) => setInviteRole(v as CollaboratorRole)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Admin
                </span>
              </SelectItem>
              <SelectItem value="viewer">
                <span className="inline-flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Viewer
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" onClick={addCollaborator}>
            <Plus className="h-4 w-4" /> Invite
          </Button>
        </div>

        {/* Module Permissions */}
        <div className="mt-3 rounded-lg border border-border/60 bg-background/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-xs font-semibold">
                Grant Module Permissions
              </Label>
              <p className="text-[10px] text-muted-foreground">
                Pick exactly which feature pages this collaborator can open.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setInviteMenus((m) =>
                  m.length === ALL_MENU_IDS.length ? [] : [...ALL_MENU_IDS],
                )
              }
              className="text-[11px] font-medium text-primary hover:underline whitespace-nowrap"
            >
              Toggle All
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ACCESS_MENUS.map((m) => {
              const checked = inviteMenus.includes(m.id);
              return (
                <label
                  key={m.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
                    checked
                      ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                      : "border-border/60 bg-slate-500/5 text-muted-foreground hover:border-border",
                  )}
                >
                  <span className="truncate">{m.label}</span>
                  <Switch
                    checked={checked}
                    onCheckedChange={() =>
                      setInviteMenus((curr) =>
                        curr.includes(m.id)
                          ? curr.filter((x) => x !== m.id)
                          : [...curr, m.id],
                      )
                    }
                    className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-600"
                  />
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Collaborator list */}
      {collaborators.length > 0 && (
        <div className="space-y-2">
          {collaborators.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-2.5"
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                  c.role === "admin"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {c.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {c.email}
                </div>
                <div className="mt-1">
                  <PermissionBadges menus={c.menuAccess} />
                </div>
              </div>
              <Select
                value={c.role}
                onValueChange={(v) => updateRole(c.id, v as CollaboratorRole)}
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Menu Access</span>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {c.menuAccess.length}/{ALL_MENU_IDS.length}
                    </Badge>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3">
                  <div className="text-xs font-medium mb-2">
                    Menus accessible to {c.name.split(" ")[0]}
                  </div>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline"
                      onClick={() => setMenuAll(c.id, true)}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:underline"
                      onClick={() => setMenuAll(c.id, false)}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-auto">
                    {ACCESS_MENUS.map((m) => {
                      const checked = c.menuAccess.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer transition-colors",
                            checked
                              ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                              : "border-border/60 bg-slate-500/5 text-muted-foreground hover:border-border",
                          )}
                        >
                          <span className="truncate">{m.label}</span>
                          <Switch
                            checked={checked}
                            onCheckedChange={() => toggleMenu(c.id, m.id)}
                            className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-600"
                          />
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                onClick={() => removeCollaborator(c.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Date lock */}
      <div className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-medium">
                Enforce Date-Restricted Work Window
              </div>
              <div className="text-[11px] text-muted-foreground">
                Block transactions outside the approved dates.
              </div>
            </div>
          </div>
          <Switch
            checked={dateLockEnabled}
            onCheckedChange={setDateLockEnabled}
          />
        </div>
        {dateLockEnabled && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !lockStart && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {lockStart ? format(lockStart, "PPP") : "Start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={lockStart}
                    onSelect={setLockStart}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !lockEnd && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {lockEnd ? format(lockEnd, "PPP") : "End date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={lockEnd}
                    onSelect={setLockEnd}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {lockInvalid && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Start date must be before end date.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}