import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  PieChart,
  Target,
  Calculator,
  Settings,
  Bell,
  Upload,
  Download,
  Landmark,
  CreditCard,
  ScanLine,
  HandCoins,
  ShieldCheck,
  Scale,
  Plane,
  Users,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useBranding } from "@/hooks/useBranding";
import { NavLink } from "@/components/NavLink";
import { Link, useLocation } from "react-router-dom";
import { useAccess } from "@/contexts/AccessContext";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useMenuLocks } from "@/hooks/useMenuLocks";
import { lockTooltip, type MenuLock } from "@/lib/menuUpsell";
import { cn } from "@/lib/utils";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";

const mainItems = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, menuId: "dashboard" },
  { title: "Income", url: "/app/income", icon: Wallet, menuId: "income" },
  { title: "Expenses", url: "/app/expenses", icon: HandCoins, menuId: "expenses" },
  { title: "Investments", url: "/app/investments", icon: TrendingUp, menuId: "investments" },
  { title: "Budget", url: "/app/budget", icon: PieChart, menuId: "budget" },
  { title: "Goals", url: "/app/goals", icon: Target, menuId: "goals" },
  { title: "Accounts", url: "/app/accounts", icon: Landmark, menuId: "accounts" },
];

const wealthItems = [
  { title: "Net Worth", url: "/app/net-worth", icon: Scale, menuId: "net-worth" },
  { title: "Insurance", url: "/app/insurance", icon: ShieldCheck, menuId: "insurance" },
  { title: "Trips", url: "/app/trips", icon: Plane, menuId: "trips" },
];

const toolItems = [
  { title: "Workspace", url: "/app/workspace", icon: Users, menuId: "settings" },
  { title: "Calculator", url: "/app/calculator", icon: Calculator, menuId: "calculator" },
  { title: "Import", url: "/app/import", icon: Upload, menuId: "import" },
  { title: "Export", url: "/app/export", icon: Download, menuId: "import" },
  { title: "Bill Scan", url: "/app/bill-scan", icon: ScanLine, menuId: "bill-scan" },
  { title: "Reminders", url: "/app/reminders", icon: Bell, menuId: "reminders" },
  { title: "Billing", url: "/app/billing", icon: CreditCard, menuId: "billing" },
  { title: "Settings", url: "/app/settings", icon: Settings, menuId: "settings" },
];

type NavEntry = (typeof mainItems)[number];

const NOT_LOCKED: MenuLock = { kind: "none" };

/**
 * One sidebar row, available or plan-locked.
 *
 * The three groups rendered this markup three times over; Stage 5.5 needed a
 * fourth state in each of them, which is three chances to get it subtly
 * different. A locked row still navigates — its route renders the upgrade
 * page — so it is a link, not a disabled button a keyboard cannot reach.
 */
function NavItem({
  item,
  lock,
  collapsed,
  active,
}: {
  item: NavEntry;
  lock: MenuLock;
  collapsed: boolean;
  active: boolean;
}) {
  const locked = lock.kind === "plan";
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={lockTooltip(item.title, lock)}>
        <NavLink
          to={item.url}
          end
          className={cn(
            "hover:bg-accent/60 rounded-lg transition-all duration-200",
            locked && "text-muted-foreground/70",
            collapsed && "justify-center",
          )}
          activeClassName="bg-primary/10 text-primary font-medium border border-primary/20"
        >
          <item.icon className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
          {locked && (
            <>
              {!collapsed && <Lock className="h-3.5 w-3.5 flex-shrink-0 opacity-70" aria-hidden />}
              {/* The padlock is the only visual cue; without this the row reads
                  to a screen reader exactly like an available one. */}
              <span className="sr-only">
                {lock.upgrade ? `included in ${lock.upgrade.name}` : "not included in your plan"}
              </span>
            </>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { appName } = useBranding();
  const location = useLocation();
  const currentPath = location.pathname;
  const { canAccess } = useAccess();
  const { lockOf } = useMenuLocks();
  const { user } = useAuth();
  const { data: sub } = useSubscription();
  const { canPrompt, isStandalone, isIOS, promptInstall } = usePwaInstall();

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "unavailable") {
      toast(
        isIOS
          ? "Tap the Share button, then “Add to Home Screen”."
          : "Open your browser menu and choose “Install app”.",
      );
    }
  };
  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "User";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const planLabel = sub?.plan_name ? `${sub.plan_name} plan` : "Free plan";
  /**
   * Stage 5.5 — a feature the plan does not include is shown, locked, instead
   * of vanishing. Hiding it means nobody ever discovers what the paid plan is
   * for; the row is muted and carries a padlock, and its route renders the
   * upgrade page rather than bouncing.
   *
   * A menu the OWNER switched off stays hidden: that is their decision about
   * this workspace, and advertising it back at the person they hid it from
   * would be both confusing and unsellable.
   *
   * `billing` is excluded on purpose — selling the page where you pay us, as
   * a paid feature, is absurd. (It is plan-gated today; see the 5.5 note.)
   */
  const withLocks = (items: typeof mainItems) =>
    items
      .map((i) => ({ item: i, lock: canAccess(i.menuId) ? NOT_LOCKED : lockOf(i.menuId) }))
      .filter(
        ({ item, lock }) =>
          lock.kind === "none" || (lock.kind === "plan" && item.menuId !== "billing"),
      );

  const visibleMain = withLocks(mainItems);
  const visibleTools = withLocks(toolItems);
  const visibleWealth = withLocks(wealthItems);

  const isActive = (path: string) => currentPath === path;

  return (
    /* BUG-097 — the sidebar renders as a plain <div>, so axe reported every
       link in it as "not contained by landmarks": ~20 navigation links that a
       screen reader could not jump to as a group, and could not skip either.
       It IS the app's main navigation, so it should say so. The label matters
       because a page can have several navigation landmarks and "navigation" on
       its own does not distinguish them. */
    <Sidebar
      collapsible="icon"
      role="navigation"
      aria-label="Main"
      className="border-r border-border/40"
    >
      <SidebarHeader className={cn(collapsed ? "p-2" : "p-4")}> 
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}> 
          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
            <BrandLogo className="w-8 h-8 rounded-xl shadow-sm" />
          </div>
          {!collapsed && (
            <span className="font-display text-lg font-bold text-gradient-primary">
              {appName}
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {visibleMain.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold px-3">
            Overview
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain.map(({ item, lock }) => (
                <NavItem
                  key={item.title}
                  item={item}
                  lock={lock}
                  collapsed={collapsed}
                  active={isActive(item.url)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        {visibleWealth.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold px-3">
            Wealth
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleWealth.map(({ item, lock }) => (
                <NavItem
                  key={item.title}
                  item={item}
                  lock={lock}
                  collapsed={collapsed}
                  active={isActive(item.url)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        {visibleTools.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold px-3">
            Tools
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleTools.map(({ item, lock }) => (
                <NavItem
                  key={item.title}
                  item={item}
                  lock={lock}
                  collapsed={collapsed}
                  active={isActive(item.url)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className={cn(collapsed ? "p-2" : "p-4")}>
        <WorkspaceSwitcher collapsed={collapsed} />
        {!isStandalone && (canPrompt || isIOS) && (
          <button
            onClick={handleInstall}
            aria-label="Install app"
            title={`Install ${appName} as an app`}
            className={cn(
              "mb-2 flex items-center rounded-lg border border-primary/30 bg-primary/10 text-sm font-medium text-primary transition-colors hover:bg-primary/20",
              collapsed ? "justify-center p-2" : "gap-2 px-3 py-2",
            )}
          >
            <Download className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Install app</span>}
          </button>
        )}
        <Link
          to="/app/profile"
          aria-label="Open profile"
          title={`${displayName} · ${planLabel}`}
          className={cn(
            "flex items-center gap-3 rounded-lg transition-colors hover:bg-accent/60",
            collapsed ? "justify-center p-1.5" : "p-1.5",
          )}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-chart-2/60 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-foreground">{initials || "U"}</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
              <span className="text-xs text-muted-foreground truncate capitalize">{planLabel}</span>
            </div>
          )}
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
