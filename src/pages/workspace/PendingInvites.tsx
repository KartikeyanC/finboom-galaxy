import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { notifyError } from "@/lib/errorMessages";
import { daysLeft, invitesKey, type InviteShare } from "@/lib/inviteShare";

type InviteRow = {
  id: string;
  email: string;
  role: string;
  menu_overrides: Json | null;
  expires_at: string;
};

/**
 * BUG-020 — invitations that have not been used yet. Before this an invite
 * vanished from view the moment its link panel was closed: nothing showed who
 * was still to join, and a lost link could not be replaced or withdrawn.
 *
 * Read straight from `invitations` (owners may SELECT their workspace's rows);
 * the token hash is never selected. A new link re-runs create_invitation with
 * the same email, role and modules, which also retires the old link.
 */
export default function PendingInvites({
  tenantId,
  workspace,
  onNewLink,
}: {
  tenantId: string | null;
  workspace?: string | null;
  onNewLink: (invite: InviteShare) => void;
}) {
  const qc = useQueryClient();

  const invites = useQuery({
    queryKey: invitesKey(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, menu_overrides, expires_at")
        .eq("tenant_id", tenantId as string)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });

  const renew = useMutation({
    mutationFn: async (r: InviteRow) => {
      const { data, error } = await supabase.rpc("create_invitation", {
        p_tenant_id: tenantId as string,
        p_email: r.email,
        p_role: r.role,
        p_menus: r.menu_overrides ?? undefined,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.token) throw new Error("No link came back");
      return { r, token: row.token as string, expiresAt: row.expires_at as string };
    },
    onSuccess: ({ r, token, expiresAt }) => {
      onNewLink({
        email: r.email,
        role: r.role,
        workspace,
        expiresAt,
        link: `${window.location.origin}/invite/${token}`,
      });
      qc.invalidateQueries({ queryKey: invitesKey(tenantId) });
    },
    onError: (e) => notifyError(e, { title: "Could not make a new link" }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation withdrawn");
      qc.invalidateQueries({ queryKey: invitesKey(tenantId) });
    },
    onError: (e) => notifyError(e),
  });

  const rows = invites.data ?? [];
  if (invites.isError || rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        Pending invitations ({rows.length})
      </Label>
      <ul className="glass-card divide-y divide-border/40">
        {rows.map((r) => {
          const left = daysLeft(r.expires_at);
          const busy = (renew.isPending && renew.variables?.id === r.id) ||
            (revoke.isPending && revoke.variables === r.id);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="min-w-[12rem] flex-1">
                <div className="text-sm font-medium text-foreground break-all">{r.email}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="h-5 px-1.5 text-[11px] capitalize">{r.role}</Badge>
                  <Clock className="h-3 w-3" />
                  {left > 0 ? `Expires in ${left} day${left === 1 ? "" : "s"}` : (
                    <span className="text-amber-500">Expired — make a new link</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={busy}
                  onClick={() => renew.mutate(r)}>
                  <Link2 className="h-3.5 w-3.5" /> New link
                </Button>
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" disabled={busy}
                  aria-label={`Withdraw the invitation for ${r.email}`}
                  onClick={() => revoke.mutate(r.id)}>
                  <X className="h-3.5 w-3.5" /> Withdraw
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
