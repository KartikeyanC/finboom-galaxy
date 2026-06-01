import { Navigate } from "react-router-dom";
import { useAccess, fallbackPath } from "@/contexts/AccessContext";

export function MenuGuard({
  menuId,
  children,
}: {
  menuId: string;
  children: React.ReactNode;
}) {
  const { canAccess, allowedMenus } = useAccess();
  if (!canAccess(menuId)) {
    return <Navigate to={fallbackPath(allowedMenus)} replace />;
  }
  return <>{children}</>;
}