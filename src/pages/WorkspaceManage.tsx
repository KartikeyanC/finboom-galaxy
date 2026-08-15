import { useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Eye,
  Mail,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/contexts/AccessContext";
import { useTenant } from "@/contexts/TenantContext";
import { ACCESS_MENUS, ALL_MENU_IDS, type CollaboratorRole } from "@/lib/accessMenus";
import RecurringList from "@/components/recurring/RecurringList";
import RecurringDialog from "@/components/recurring/RecurringDialog";

import MemberCard, { type MemberRow } from "./workspace/MemberCard";
import ReminderSummaryBar from "./workspace/ReminderSummaryBar";
import { MODULE_ICON } from "./workspace/moduleIcons";

/* ────────────────────────────────── main page ───────────────────────────────── */

export default function WorkspaceManage() {
  const { members, refresh } = useAccess();
  const { currentTenantId } = useTenant();

  /* ── member rows (optimistic) ── */
  const [rows, setRows] = useState<MemberRow[]>([]);
  useEffect(() => {
    setRows(
      members.map((m) => ({
        userId: m.user_id,
        name: m.display_name || m.email || m.username || "Member",
        email: m.email ?? "",
        role: m.role,
        menus: m.role === "owner" ? [...ALL_MENU_IDS] : (m.menu_overrides?.allow ?? [...ALL_MENU_IDS]),
        isOwner: m.role === "owner",
      })),
    );
  }, [members]);

  /* ── invite form ── */
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("viewer");
  const [inviteMenus, setInviteMenus] = useState<string[]>([...ALL_MENU_IDS]);
  const [inviting, setInviting] = useState(false);
  const [showInviteMenus, setShowInviteMenus] = useState(false);
  // Shown once, right after creating an invitation — the token is never
  // retrievable again (only its hash is stored).
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  /* ── helpers ── */
  const persistMenus = async (userId: string, menus: string[]) => {
    if (!currentTenantId) return;
    const { error } = await supabase.rpc("set_member_menus", {
      p_tenant_id: currentTenantId,
      p_user_id: userId,
      p_menus: { allow: menus },
    });
    if (error) { notifyError(error); await refresh(); }
  };

  const handleToggleMenu = (userId: string, menuId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.userId !== userId) return r;
        const menus = r.menus.includes(menuId)
          ? r.menus.filter((m) => m !== menuId)
          : [...r.menus, menuId];
        void persistMenus(userId, menus);
        return { ...r, menus };
      }),
    );
  };

  const handleGrantAll = (userId: string) => {
    setRows((prev) => prev.map((r) => r.userId === userId ? { ...r, menus: [...ALL_MENU_IDS] } : r));
    void persistMenus(userId, [...ALL_MENU_IDS]);
  };

  const handleRevokeAll = (userId: string) => {
    setRows((prev) => prev.map((r) => r.userId === userId ? { ...r, menus: [] } : r));
    void persistMenus(userId, []);
  };

  const handleUpdateRole = async (userId: string, role: CollaboratorRole) => {
    if (!currentTenantId) return;
    setRows((prev) => prev.map((r) => r.userId === userId ? { ...r, role } : r));
    const { error } = await supabase.rpc("update_member_role", {
      p_tenant_id: currentTenantId,
      p_user_id: userId,
      p_role: role,
    });
    if (error) { notifyError(error); await refresh(); }
  };

  const handleRemove = async (userId: string) => {
    if (!currentTenantId) return;
    const { error } = await supabase.rpc("revoke_member", {
      p_tenant_id: currentTenantId,
      p_user_id: userId,
    });
    if (error) return notifyError(error);
    toast.success("Member removed");
    await refresh();
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return toast.error("Enter an email address");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Invalid email address");
    if (!currentTenantId) return toast.error("No active workspace");
    setInviting(true);
    // Stage 3.8: create_invitation works whether or not they already have an
    // account — the old invite_member required an existing auth.users row and
    // simply refused otherwise (BUG-020). It returns the raw token ONCE, so the
    // link is captured here and never fetched again.
    const { data, error } = await supabase.rpc("create_invitation", {
      p_tenant_id: currentTenantId,
      p_email: email,
      p_role: inviteRole,
      p_menus: { allow: inviteMenus },
    });
    setInviting(false);
    if (error) return notifyError(error, { title: "Could not create the invitation" });

    const row = Array.isArray(data) ? data[0] : data;
    if (row?.token) {
      setInviteLink(`${window.location.origin}/invite/${row.token}`);
    }
    // No email is sent: `send-email` is deliberately not deployed (BUG-005).
    // The inviter shares the link themselves, which is why it is shown rather
    // than merely confirmed.
    toast.success(`Invitation created for ${email}`, {
      description: "Copy the link below and send it to them.",
    });
    setInviteEmail(""); setInviteRole("viewer"); setInviteMenus([...ALL_MENU_IDS]);
    setShowInviteMenus(false);
    await refresh();
  };

  const collaborators = rows.filter((r) => !r.isOwner);
  const owner = rows.find((r) => r.isOwner);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[1200px] mx-auto">
      {/* ── Page header ── */}
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">
            FinRoot
          </span>
          <span className="text-xs text-muted-foreground/50">·</span>
          <span className="text-xs text-muted-foreground">Workspace</span>
        </div>
        <h1 className="font-display text-3xl font-bold text-foreground flex items-center gap-3">
          <Users className="w-7 h-7 text-primary" />
          Workspace Management
        </h1>
        <p className="text-muted-foreground max-w-xl text-sm">
          Manage team members, grant granular module permissions per individual, and configure
          recurring income and expense entries with optional reminders.
        </p>
      </header>

      {/* ── Tabs ── */}
      <Tabs defaultValue="permissions" className="space-y-6">
        <TabsList className="h-auto p-1 gap-1">
          <TabsTrigger value="permissions" className="gap-2 px-4 py-2">
            <Users className="h-3.5 w-3.5" />
            Team &amp; Permissions
            <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
              {rows.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="recurring-income" className="gap-2 px-4 py-2">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            Recurring Income
          </TabsTrigger>
          <TabsTrigger value="recurring-expenses" className="gap-2 px-4 py-2">
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            Recurring Expenses
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════ TAB 1: Permissions ══════════════════════ */}
        <TabsContent value="permissions" className="space-y-6 mt-0">

          {/* Info strip */}
          <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 px-4 py-3 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>
              Inviting someone gives you a <strong className="text-foreground">link to send them</strong>.
              They don&rsquo;t need a FinRoot account yet — if they sign up with the invited email
              they join automatically. Links last 14 days and only work for that address.
              Permissions are enforced server-side and take effect immediately.
            </span>
          </div>

          {/* ── Invite card ── */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Invite Member</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  placeholder="email@domain.com"
                  className="pl-9"
                />
              </div>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as CollaboratorRole)}>
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
              <Button onClick={handleInvite} disabled={inviting} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {inviting ? "Inviting…" : "Invite"}
              </Button>
            </div>

            {/* Stage 3.8: the link IS the invitation. Shown once — the raw token
                is not stored, only its hash, so it cannot be looked up again. */}
            {inviteLink && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="text-xs font-semibold text-foreground">
                  Invitation link — copy it now
                </div>
                <p className="text-xs text-muted-foreground">
                  Send this to them yourself. It works whether or not they already have an
                  account, expires in 14 days, and can only be used by that email address.
                  This is the only time it can be shown.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-background/70 px-2 py-1.5 text-xs">
                    {inviteLink}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteLink);
                        toast.success("Link copied");
                      } catch {
                        toast.error("Copy failed — select the link and copy it manually");
                      }
                    }}
                  >
                    Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setInviteLink(null)}>
                    Done
                  </Button>
                </div>
              </div>
            )}

            {/* Pre-set module permissions for invite */}
            <div>
              {/* Stage 4.7: py-1.5 for the hit area — this disclosure was a
                  16 px-tall row of text, under the 24 px minimum. */}
              <button
                type="button"
                className="flex items-center gap-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowInviteMenus((v) => !v)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Pre-set module permissions
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {inviteMenus.length}/{ALL_MENU_IDS.length}
                </Badge>
                {showInviteMenus
                  ? <ChevronUp className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {showInviteMenus && (
                <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Toggle which pages this person can access after joining.
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() =>
                        setInviteMenus((m) =>
                          m.length === ALL_MENU_IDS.length ? [] : [...ALL_MENU_IDS],
                        )
                      }
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
                            "flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition-all select-none",
                            checked
                              ? "border-primary/40 bg-primary/8 text-foreground"
                              : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {MODULE_ICON[m.id] ?? <span className="text-xs">📦</span>}
                            <span className="font-medium">{m.label}</span>
                          </div>
                          <Switch
                            checked={checked}
                            onCheckedChange={() =>
                              setInviteMenus((curr) =>
                                curr.includes(m.id)
                                  ? curr.filter((x) => x !== m.id)
                                  : [...curr, m.id],
                              )
                            }
                            className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Member list ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Workspace Members ({rows.length})
              </Label>
              <Button
                size="sm" variant="ghost"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => refresh()}
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
            </div>

            {rows.length === 0 ? (
              <div className="glass-card p-10 text-center text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No members yet. Invite someone above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Owner first */}
                {owner && (
                  <MemberCard
                    member={owner}
                    onUpdateRole={handleUpdateRole}
                    onToggleMenu={handleToggleMenu}
                    onGrantAll={handleGrantAll}
                    onRevokeAll={handleRevokeAll}
                    onRemove={handleRemove}
                  />
                )}
                {/* Collaborators */}
                {collaborators.length > 0 && (
                  <div className="space-y-2">
                    {collaborators.length > 0 && (
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider px-1 pt-1">
                        Collaborators ({collaborators.length})
                      </p>
                    )}
                    {collaborators.map((m) => (
                      <MemberCard
                        key={m.userId}
                        member={m}
                        onUpdateRole={handleUpdateRole}
                        onToggleMenu={handleToggleMenu}
                        onGrantAll={handleGrantAll}
                        onRevokeAll={handleRevokeAll}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══════════════════════ TAB 2: Recurring Income ══════════════════════ */}
        <TabsContent value="recurring-income" className="space-y-4 mt-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" />
                Recurring Income
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Salaries, freelance retainers, rental income, dividends — track every recurring
                income stream and get reminded before it's due.
              </p>
            </div>
            <RecurringDialog type="income" />
          </div>

          <ReminderSummaryBar type="income" />

          {/* Bell legend */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1">
              <Bell className="h-3 w-3 text-primary" /> Bell icon = reminder set
            </span>
            <span className="flex items-center gap-1">
              <Bell className="h-3 w-3 text-amber-400" /> Amber = reminder active now
            </span>
          </div>

          <RecurringList type="income" />
        </TabsContent>

        {/* ══════════════════════ TAB 3: Recurring Expenses ══════════════════════ */}
        <TabsContent value="recurring-expenses" className="space-y-4 mt-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-destructive" />
                Recurring Expenses
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Rent, EMIs, subscriptions, utilities — mark as paid to post a transaction
                automatically. Set reminders so nothing slips through.
              </p>
            </div>
            <RecurringDialog type="expense" />
          </div>

          <ReminderSummaryBar type="expense" />

          {/* Bell legend */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1">
              <Bell className="h-3 w-3 text-primary" /> Bell icon = reminder set
            </span>
            <span className="flex items-center gap-1">
              <Bell className="h-3 w-3 text-amber-400" /> Amber = reminder active now
            </span>
          </div>

          <RecurringList type="expense" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
