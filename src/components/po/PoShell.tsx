import { ReactNode, useState } from "react";
import { Navigate, useLocation, useNavigate, Link } from "react-router-dom";
import { LayoutDashboard, Building2, BarChart3, LogOut, ShieldCheck, ScrollText, Layers, Ticket, BadgeIndianRupee, KeyRound, Palette, Activity, Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/po", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/po/tenants", label: "Tenants", icon: Building2, end: false },
  { to: "/po/analytics", label: "Analytics", icon: BarChart3, end: false },
  { to: "/po/plans", label: "Plans", icon: Layers, end: false },
  { to: "/po/pricing", label: "Pricing Page", icon: BadgeIndianRupee, end: false },
  { to: "/po/branding", label: "Branding", icon: Palette, end: false },
  { to: "/po/coupons", label: "Coupons", icon: Ticket, end: false },
  { to: "/po/status", label: "Status Page", icon: Activity, end: false },
  { to: "/po/audit", label: "Audit Log", icon: ScrollText, end: false },
  { to: "/po/security", label: "Security", icon: KeyRound, end: false },
];

function PoNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <nav className="flex-1 p-3 space-y-1" aria-label="Owner Console">
      {NAV.map((n) => {
        const active = n.end ? location.pathname === n.to : location.pathname.startsWith(n.to);
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * BUG-056 — the console had a fixed `w-60` sidebar with no mobile layout at
 * all: below ~768px it either clipped or forced horizontal scroll on every
 * page, and it's the only surface a Product Owner has for suspending a
 * tenant or rotating their own PO secret. Below `md` the aside is replaced
 * by a slide-over `Sheet` opened from a top bar, reusing the exact same nav
 * list (`PoNav`) so the two layouts can't drift apart.
 */
export function PoShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { isPO, loading: poLoading, checked } = usePlatformAdmin();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading || poLoading || !checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user || !isPO) {
    return <Navigate to="/po/login" replace />;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/po/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <div className="md:hidden h-14 flex items-center justify-between gap-2 px-4 border-b border-border/40 bg-background/60 backdrop-blur">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-display font-semibold text-sm">Owner Console</span>
        </div>
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 flex flex-col">
          <SheetTitle className="sr-only">Owner Console navigation</SheetTitle>
          <div className="h-16 flex items-center gap-2 px-5 border-b border-border/40">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-display font-semibold">Owner Console</span>
          </div>
          <PoNav onNavigate={() => setMobileOpen(false)} />
          <div className="p-3 border-t border-border/40">
            <div className="text-xs text-muted-foreground truncate px-1 mb-2">{user.email}</div>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <aside className="hidden md:flex w-60 shrink-0 border-r border-border/40 bg-background/60 backdrop-blur flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-border/40">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-display font-semibold">Owner Console</span>
        </div>
        <PoNav />
        <div className="p-3 border-t border-border/40">
          <div className="text-xs text-muted-foreground truncate px-1 mb-2">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
