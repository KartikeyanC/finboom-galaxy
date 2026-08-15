import { Navigate, useLocation } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useAccess, fallbackPath } from "@/contexts/AccessContext";
import { useMenuLocks } from "@/hooks/useMenuLocks";
import { UpgradeLock } from "@/components/upsell/UpgradeLock";

export function MenuGuard({
  menuId,
  children,
}: {
  menuId: string;
  children: React.ReactNode;
}) {
  const { canAccess, allowedMenus, activeProfile } = useAccess();
  const { lockOf, loading: locksLoading } = useMenuLocks();
  const location = useLocation();

  if (canAccess(menuId)) return <>{children}</>;

  /**
   * Stage 5.5 — a plan-locked route stays where it is and sells.
   *
   * Redirecting told the visitor nothing: not that the feature exists, not
   * that it is on a higher plan, and not what to do next. The redirect is
   * kept for a menu the owner switched OFF, because that is their decision
   * about this workspace and no amount of money would change it.
   *
   * Waiting on `locksLoading` matters: without it, the plan catalogue arriving
   * a beat late would bounce the user out of a URL they typed, and there is no
   * way back from a redirect.
   */
  if (locksLoading) return null;
  if (lockOf(menuId).kind === "plan") return <UpgradeLock menuId={menuId} />;

  // Restricted profile with zero modules granted → show neutral empty state
  // instead of bouncing into a redirect loop.
  if (activeProfile && (allowedMenus?.length ?? 0) === 0) {
    return <NoModulesAssigned name={activeProfile.name} />;
  }

  const target = fallbackPath(allowedMenus);
  if (target === location.pathname) {
    return <NoModulesAssigned name={activeProfile?.name ?? "this account"} />;
  }
  return <Navigate to={target} replace />;
}

function NoModulesAssigned({ name }: { name: string }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-8 space-y-3">
        <div className="mx-auto h-14 w-14 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
          <ShieldOff className="h-7 w-7" />
        </div>
        <h1 className="font-display text-lg font-semibold">
          No modules currently assigned to this account context.
        </h1>
        <p className="text-sm text-muted-foreground">
          {name} has no feature pages enabled yet. Ask the primary
          administrator to switch on at least one module from the
          permissions center.
        </p>
      </div>
    </div>
  );
}
