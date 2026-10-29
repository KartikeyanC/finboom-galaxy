import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, LogOut, Search, Eye, Lock, Sun, Moon, Plus, WifiOff } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { SkipLink } from "@/components/SkipLink";
import { useOnline } from "@/hooks/useOnline";
import { markSignOutIntent, recordLogout, requestLock } from "@/lib/appLock";
import { useLockSettings } from "@/hooks/useLockSettings";
import { useAccess } from "@/contexts/AccessContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useNotifications } from "@/hooks/useNotifications";
import GlobalSearch from "@/components/GlobalSearch";
import QuickAddSheet from "@/components/QuickAddSheet";
import { MobileNav } from "@/components/MobileNav";
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

  const [searchOpen, setSearchOpen]       = useState(false);
  const [quickAddOpen, setQuickAddOpen]   = useState(false);
  const [searchParams, setSearchParams]   = useSearchParams();

  // Stage 5.4: with the lock optional, "Lock" has nothing to lock to when it
  // is off — the button would either do nothing or, worse, strand someone
  // behind a screen they have no PIN for.
  const lock = useLockSettings(user?.id);
  const online = useOnline();

  // Ctrl/Cmd+K → search   |   plain "n" → quick-add
  //
  // Stage 4.10 / BUG-048: this used to preventDefault Ctrl/Cmd+N, which is the
  // browser's own "New Window". Taking it is hostile — and on macOS Safari and
  // Chrome the page often cannot suppress it anyway, so the user got a new
  // window AND our sheet. Quick-add moved to a bare "n", the convention Gmail
  // and Linear use, which collides with nothing.
  //
  // Ctrl/Cmd+K stays: web apps have effectively claimed it, and users reaching
  // for it in an app like this mean the app's search.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }

      // A bare letter must never fire while the user is typing, or inside a
      // dialog/menu where it may mean something else.
      if (e.key !== "n" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        !el ||
        el.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
        el.closest('[role="dialog"], [role="menu"], [role="listbox"]')
      ) {
        return;
      }
      e.preventDefault();
      setQuickAddOpen(true);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // PWA shortcut: /app?quick-add=1 → auto-open quick-add sheet
  useEffect(() => {
    if (searchParams.get("quick-add") === "1") {
      setQuickAddOpen(true);
      searchParams.delete("quick-add");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const { profiles, viewAsId, setViewAsId, activeProfile } = useAccess();
  const isReadOnly = !!activeProfile && activeProfile.role === "viewer";
  const { data: sub } = useSubscription();
  const subExpired = sub?.status === "expired";
  const { unread } = useNotifications();
  const { isDark, setMode } = useTheme();
  const isLight = !isDark;
  return (
    // NineFlow: labels from 1024px wide, icons only below that.
    <SidebarProvider defaultOpen={typeof window === "undefined" || window.innerWidth >= 1024}>
      {/*
        Stage 4.8 / BUG-052 — skip link. The sidebar is ~20 links, so a keyboard
        or screen-reader user had to tab through the entire navigation on every
        page before reaching the content. Visually hidden until focused, which
        is the point: it appears exactly when someone is tabbing.
      */}
      <SkipLink />
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="h-16 flex items-center justify-between bg-background/85 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hidden md:inline-flex rounded-full text-muted-foreground hover:text-foreground" />
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden sm:flex items-center gap-2.5 h-10 rounded-full border border-border bg-card hover:bg-background px-3.5 w-64 transition-colors group"
              >
                <Search className="w-4 h-4 text-faint group-hover:text-foreground transition-colors" />
                <span className="text-sm text-faint group-hover:text-foreground transition-colors flex-1 text-left">
                  Search anything...
                </span>
                {/* BUG-094 — `/60` on top of an already-marginal token put this
                    at 2.24:1, the worst reading in the app. It is a keyboard
                    hint, so dimming it was deliberate; but a hint nobody can
                    read is not a subtle hint, it is a missing one. */}
                <kbd className="hidden lg:inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-border bg-background px-1.5 text-[10px] font-semibold text-muted-foreground">
                  Ctrl K
                </kbd>
              </button>

              {/* Quick Add — visible on all screen sizes */}
              <button
                type="button"
                onClick={() => setQuickAddOpen(true)}
                title="Quick add transaction (press N)"
                className="hidden md:flex items-center gap-2 h-10 px-4 rounded-full bg-gradient-to-r from-brand-a to-brand-b text-brand-foreground text-sm font-semibold hover:opacity-90 transition active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
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
                  className="hidden md:inline-flex border-amber-500/40 text-amber-400 bg-amber-500/10 text-xs"
                >
                  Restricted view
                </Badge>
              )}
              <span className="text-xs font-semibold text-muted-foreground hidden sm:block tabular-nums">
                {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => setMode(isLight ? "dark" : "light")}
                aria-label="Toggle light/dark theme"
                title={isLight ? "Switch to dark" : "Switch to light"}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-card transition-colors text-muted-foreground hover:text-foreground"
              >
                {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <Link
                to="/app/notifications"
                aria-label="Notifications"
                className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-card transition-colors"
              >
                <Bell className="w-4 h-4 text-muted-foreground" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-xs font-semibold text-white flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              {user && (
                <>
                  {/* Stage 4.7: py-1.5 is a hit-area fix, not spacing — the
                      link's own box was 16 px tall, under the 24 px minimum
                      (WCAG 2.5.8). Its flex siblings are 36 px, so the row
                      height is unchanged. */}
                  <Link
                    to="/app/profile"
                    className="hidden md:inline py-1.5 text-xs text-muted-foreground max-w-[160px] truncate hover:text-foreground transition-colors"
                  >
                    {user.email}
                  </Link>
                  {lock.active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (user) {
                          recordLogout(user.id);
                          requestLock();
                        }
                      }}
                      className="gap-1.5"
                      title="Lock — re-enter with your PIN (or password after 12h)"
                    >
                      <Lock className="w-4 h-4" />
                      <span className="hidden lg:inline">Lock</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      // Order matters. Navigating before `signOut()` resolves
                      // leaves a window where the Supabase session is still
                      // valid but the user is already sitting on a public
                      // route — and if anything in that window (a fresh
                      // `/auth` load, a second tab) re-reads the session, it
                      // finds one and bounces straight back into the app.
                      // Found via a Playwright run that hit exactly that: a
                      // "sign out, sign back in" test landed on `/auth` mid
                      // sign-out and was redirected to `/app` because the
                      // session had not actually cleared yet.
                      //
                      // That fix (signOut before navigate) opened a SECOND
                      // race: ProtectedRoute is still mounted at this point
                      // and reacts to `signOut()` clearing the session with
                      // its own `<Navigate to="/auth">`, which can beat this
                      // navigate("/") to the punch — a later Playwright run
                      // caught exactly that, landing back on the sign-in form
                      // instead of the marketing page every time. markSignOutIntent()
                      // tells ProtectedRoute to stand down for this one, so
                      // only this navigate() decides the destination.
                      markSignOutIntent();
                      await signOut();
                      navigate("/", { replace: true });
                    }}
                    className="gap-1.5"
                    title="Sign out and return to the website"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Sign out</span>
                  </Button>
                </>
              )}
            </div>
          </header>

          {/*
            BUG-096 — the app had no offline handling at all, and the service
            worker hid the problem: the shell loads from cache, so going offline
            produced a completely normal-looking dashboard still showing
            whatever figures it had. `role="status"` so a screen reader is told
            too, and `aria-live="polite"` so it waits for a pause rather than
            interrupting. It says what is stale, not just that the network is
            gone — "offline" alone leaves the user guessing which numbers to
            trust.
          */}
          {!online && (
            <div
              role="status"
              aria-live="polite"
              className="border-b border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs px-4 sm:px-6 py-2 flex items-center gap-2"
            >
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span>
                You are <strong className="font-semibold">offline</strong>. Figures shown were last
                loaded while connected and may be out of date; changes you make now will not be
                saved until the connection returns.
              </span>
            </div>
          )}

          {isReadOnly && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs px-4 sm:px-6 py-2 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" />
              Read-only view as <strong className="font-semibold">{activeProfile?.name}</strong>.
              Add, edit and delete actions are disabled for this collaborator.
            </div>
          )}

          {subExpired && (
            <div className="border-b border-destructive/30 bg-destructive/10 text-destructive text-xs px-4 sm:px-6 py-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                Your <strong className="font-semibold">{sub?.plan_name ?? "plan"}</strong> subscription has expired — some features are limited.
              </span>
              <Link to="/app/billing" className="font-semibold underline whitespace-nowrap">
                Renew
              </Link>
            </div>
          )}

          <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto pb-24 md:pb-0">
            {children}
          </main>
        </div>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <QuickAddSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
      <MobileNav onQuickAdd={() => setQuickAddOpen(true)} onSearch={() => setSearchOpen(true)} />
    </SidebarProvider>
  );
}
