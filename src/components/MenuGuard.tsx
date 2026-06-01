import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAccess, fallbackPath } from "@/contexts/AccessContext";
import { Button } from "@/components/ui/button";

export function MenuGuard({
  menuId,
  children,
}: {
  menuId: string;
  children: React.ReactNode;
}) {
  const { canAccess, allowedMenus } = useAccess();
  if (!canAccess(menuId)) {
    return <AccessDenied fallback={fallbackPath(allowedMenus)} />;
  }
  return <>{children}</>;
}

function AccessDenied({ fallback }: { fallback: string }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-8 space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-destructive/15 text-destructive flex items-center justify-center">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="font-display text-xl font-semibold">Access Denied</h1>
        <p className="text-sm text-muted-foreground">
          You do not have permission to view this module. Please contact the
          primary account administrator.
        </p>
        <Button asChild variant="outline" className="mt-2">
          <Link to={fallback}>Go to an allowed page</Link>
        </Button>
      </div>
    </div>
  );
}