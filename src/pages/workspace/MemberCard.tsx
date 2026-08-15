import { useState } from "react";
import {
  Check, ChevronUp, Crown, Eye, Settings2, ShieldCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ACCESS_MENUS, ALL_MENU_IDS, type CollaboratorRole } from "@/lib/accessMenus";

import { MODULE_ICON } from "./moduleIcons";

/**
 * One workspace member with their expandable per-module permission grid —
 * split out of WorkspaceManage.tsx in Stage 4.13.
 *
 * Every change is a callback: this component performs no RPC and holds no
 * server state, only whether the card is expanded and whether the remove
 * dialog is open. The permissions it draws are a CONVENIENCE VIEW — the real
 * gate is `is_tenant_member` and `get_effective_menus` server-side, so nothing
 * here may be treated as enforcement.
 */

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "viewer";
  menus: string[];
  isOwner: boolean;
};

export default function MemberCard({
  member,
  onUpdateRole,
  onToggleMenu,
  onGrantAll,
  onRevokeAll,
  onRemove,
}: {
  member: MemberRow;
  onUpdateRole: (userId: string, role: CollaboratorRole) => void;
  onToggleMenu: (userId: string, menuId: string) => void;
  onGrantAll: (userId: string) => void;
  onRevokeAll: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const granted = member.menus.length;
  const total = ALL_MENU_IDS.length;
  const pct = Math.round((granted / total) * 100);

  return (
    <div className={cn(
      "rounded-xl border transition-all duration-200",
      member.isOwner
        ? "border-amber-500/30 bg-amber-500/5"
        : expanded
          ? "border-primary/40 bg-primary/5"
          : "border-border/60 bg-background/40",
    )}>
      {/* Card header */}
      <div className="flex items-center gap-3 p-4">
        {/* Avatar */}
        <div className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
          member.isOwner
            ? "bg-amber-500/15 text-amber-400"
            : member.role === "admin"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
        )}>
          {member.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {member.name}
            </span>
            {member.isOwner && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
          </div>
          <div className="text-xs text-muted-foreground truncate">{member.email}</div>
          {!member.isOwner && (
            <div className="flex items-center gap-1.5 mt-1">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden w-20">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-primary" : "bg-amber-500",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {granted}/{total} modules
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        {member.isOwner ? (
          <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400 bg-amber-500/10 shrink-0">
            Owner · Full Access
          </Badge>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <Select
              value={member.role}
              onValueChange={(v) => onUpdateRole(member.userId, v as CollaboratorRole)}
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-primary" /> Admin
                  </span>
                </SelectItem>
                <SelectItem value="viewer">
                  <span className="inline-flex items-center gap-1.5">
                    <Eye className="h-3 w-3 text-muted-foreground" /> Viewer
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon" variant="ghost"
              className="h-8 w-8"
              onClick={() => setExpanded((e) => !e)}
              title={expanded ? "Collapse permissions" : "Edit permissions"}
            >
              {expanded
                ? <ChevronUp className="h-4 w-4" />
                : <Settings2 className="h-4 w-4" />}
            </Button>
            <Button
              size="icon" variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setConfirmRemove(true)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Expanded permission grid */}
      {expanded && !member.isOwner && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Module Access
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => onGrantAll(member.userId)}
              >
                Grant All
              </button>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => onRevokeAll(member.userId)}
              >
                Revoke All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ACCESS_MENUS.map((m) => {
              const checked = member.menus.includes(m.id);
              return (
                <label
                  key={m.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition-all select-none",
                    checked
                      ? "border-primary/40 bg-primary/8 text-foreground"
                      : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {MODULE_ICON[m.id] ?? <span className="text-xs">📦</span>}
                    <span className="truncate font-medium">{m.label}</span>
                    {checked && <Check className="h-3 w-3 text-primary shrink-0" />}
                  </div>
                  <Switch
                    checked={checked}
                    onCheckedChange={() => onToggleMenu(member.userId, m.id)}
                    className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted shrink-0"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Remove confirm */}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke their access to the workspace. They can be re-invited later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => { setConfirmRemove(false); onRemove(member.userId); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
