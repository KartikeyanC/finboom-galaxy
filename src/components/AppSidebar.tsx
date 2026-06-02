import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  PieChart,
  Target,
  Calculator,
  Settings,
  Bell,
  Zap,
  Upload,
  Landmark,
  CreditCard,
  ScanLine,
  HandCoins,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAccess } from "@/contexts/AccessContext";
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

const mainItems = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, menuId: "dashboard" },
  { title: "Income", url: "/app/income", icon: Wallet, menuId: "income" },
  { title: "Expenses", url: "/app/expenses", icon: HandCoins, menuId: "expenses" },
  { title: "Investments", url: "/app/investments", icon: TrendingUp, menuId: "investments" },
  { title: "Budget", url: "/app/budget", icon: PieChart, menuId: "budget" },
  { title: "Goals", url: "/app/goals", icon: Target, menuId: "goals" },
  { title: "Accounts", url: "/app/accounts", icon: Landmark, menuId: "accounts" },
];

const toolItems = [
  { title: "Calculator", url: "/app/calculator", icon: Calculator, menuId: "calculator" },
  { title: "Import", url: "/app/import", icon: Upload, menuId: "import" },
  { title: "Bill Scan", url: "/app/bill-scan", icon: ScanLine, menuId: "bill-scan" },
  { title: "Reminders", url: "/app/reminders", icon: Bell, menuId: "reminders" },
  { title: "Billing", url: "/app/billing", icon: CreditCard, menuId: "billing" },
  { title: "Settings", url: "/app/settings", icon: Settings, menuId: "settings" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const { canAccess } = useAccess();
  const visibleMain = mainItems.filter((i) => canAccess(i.menuId));
  const visibleTools = toolItems.filter((i) => canAccess(i.menuId));

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon" className="border-r border-border/40">
      <SidebarHeader className={cn(collapsed ? "p-2" : "p-4")}> 
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}> 
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center glow-primary flex-shrink-0">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-display text-lg font-bold text-gradient-primary">
              FinRoots
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-semibold px-3">
            Overview
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      end
                      className={cn(
                        "hover:bg-accent/60 rounded-lg transition-all duration-200",
                        collapsed && "justify-center"
                      )}
                      activeClassName="bg-primary/10 text-primary font-medium border border-primary/20"
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-semibold px-3">
            Tools
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleTools.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      end
                      className={cn(
                        "hover:bg-accent/60 rounded-lg transition-all duration-200",
                        collapsed && "justify-center"
                      )}
                      activeClassName="bg-primary/10 text-primary font-medium border border-primary/20"
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={cn(collapsed ? "p-2" : "p-4")}> 
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}> 
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-chart-2/60 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-foreground">AK</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground truncate">Arun K</span>
              <span className="text-[11px] text-muted-foreground truncate">Premium Plan</span>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
