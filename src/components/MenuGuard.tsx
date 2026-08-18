import { Navigate, useLocation } from "react-router-dom";
import { ShieldOff, WifiOff } from "lucide-react";
import { useAccess, fallbackPath } from "@/contexts/AccessContext";
import { useTenant } from "@/contexts/TenantContext";
import { useMenuLocks } from "@/hooks/useMenuLocks";
import { UpgradeLock } from "@/components/upsell/UpgradeLock";
import { Button } from "@/components/ui/button";

export function MenuGuard({
  menuId,
  children,
}: {
  menuId: string;
  children: React.ReactNode;
}) {
  const { canAccess, allowedMenus, activeProfile, menusErrored, refresh } = useAccess();
  const tenant = useTenant();
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

  /**
   * BUG-115 (reopened) — `canAccess` fails closed on a resolution *failure*
   * the exact same way it fails closed on a resolution that legitimately
   * excludes this menu, because access control must never guess open. But
   * this guard used to react to both the same way too: redirect, silently.
   * For a real outage that reads as data loss — the user gets bounced off
   * whatever page they were on with no sign anything is wrong, same class of
   * bug as the dashboard's own empty-state confusion this was first filed
   * against. `menusErrored` (and TenantContext's own `error`, since a failed
   * `tenant_members` fetch cascades into "no tenant" before AccessContext
   * ever runs) is the signal that lets this stay in place and say so, instead
   * of moving the user somewhere else and staying quiet about why.
   */
  if (menusErrored || tenant.error) {
    return (
      <MenuResolutionError
        onRetry={() => {
          void tenant.refresh();
          void refresh();
        }}
      />
    );
  }

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

function MenuResolutionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-8 space-y-3">
        <div className="mx-auto h-14 w-14 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
          <WifiOff className="h-7 w-7" />
        </div>
        <h1 className="font-display text-lg font-semibold">Can't reach the server right now.</h1>
        <p className="text-sm text-muted-foreground">
          We couldn't check what you have access to, so we're not showing this page rather than
          guessing. Your data is safe — this isn't about what's in your workspace, just about
          reaching it. Check your connection and try again.
        </p>
        <Button onClick={onRetry} variant="outline" className="mt-2">
          Try again
        </Button>
      </div>
    </div>
  );
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
