import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";

/**
 * Lets a user who belongs to more than one workspace choose the active one.
 *
 * Every data hook keys its React Query cache on `currentTenantId` and filters
 * on `tenant_id`, so switching here re-fetches scoped data automatically — no
 * manual cache invalidation is needed.
 *
 * Renders nothing for the common single-workspace case.
 */
export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { memberships, currentTenantId, setCurrentTenantId, current } = useTenant();
  // A deleted workspace has no business being a switch target — TenantContext
  // already steers currentTenantId away from one on its own.
  const selectable = memberships.filter((m) => m.status !== "deleted");

  if (selectable.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Switch workspace"
          title={current ? `Workspace: ${current.name}` : "Switch workspace"}
          className={cn(
            "mb-2 flex w-full items-center rounded-lg border border-border bg-card text-sm transition-colors hover:bg-accent",
            collapsed ? "justify-center p-2" : "gap-2 px-3 py-2",
          )}
        >
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left font-medium">
                {current?.name ?? "Select workspace"}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {selectable.map((m) => (
          <DropdownMenuItem
            key={m.tenantId}
            onSelect={() => setCurrentTenantId(m.tenantId)}
            className="gap-2"
          >
            <Check
              className={cn(
                "h-4 w-4 shrink-0",
                m.tenantId === currentTenantId ? "opacity-100" : "opacity-0",
              )}
            />
            <span className="flex-1 truncate">{m.name}</span>
            <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default WorkspaceSwitcher;
