import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, LogOut, Search, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useNavigate } from "react-router-dom";
import { useAccess } from "@/contexts/AccessContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  useRealtimeSync();
  const { profiles, viewAsId, setViewAsId, activeProfile } = useAccess();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="h-16 flex items-center justify-between border-b border-border/30 bg-background/60 backdrop-blur-xl sticky top-0 z-50 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div className="hidden sm:flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 w-64">
                <Search className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Search anything...</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {profiles.length > 0 && (
                <Select
                  value={viewAsId ?? "__owner__"}
                  onValueChange={(v) => setViewAsId(v === "__owner__" ? null : v)}
                >
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <Eye className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__owner__">Owner (full access)</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{" "}
                        <span className="text-muted-foreground">· {p.role}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {activeProfile && (
                <Badge
                  variant="outline"
                  className="hidden md:inline-flex border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]"
                >
                  Restricted view
                </Badge>
              )}
              <span className="text-xs text-muted-foreground hidden sm:block font-display">April 2026</span>
              <Link
                to="/app/notifications"
                aria-label="Notifications"
                className="relative w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors"
              >
                <Bell className="w-4 h-4 text-muted-foreground" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-coral animate-pulse" />
              </Link>
              {user && (
                <>
                  <Link
                    to="/app/profile"
                    className="hidden md:inline text-xs text-muted-foreground max-w-[160px] truncate hover:text-foreground transition-colors"
                  >
                    {user.email}
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await signOut();
                      navigate("/", { replace: true });
                    }}
                    className="gap-1.5"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Sign out</span>
                  </Button>
                </>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
