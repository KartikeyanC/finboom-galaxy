import { useEffect } from "react";
import { Bell, CheckCircle2, AlertTriangle, Info, ArrowRightLeft, UserPlus, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";

function iconFor(type: string): { Icon: typeof Bell; tone: string } {
  if (type.startsWith("member")) return { Icon: UserPlus, tone: "text-primary bg-primary/15" };
  if (type.startsWith("subscription")) return { Icon: CreditCard, tone: "text-coral bg-coral/15" };
  if (type === "tenant.suspended") return { Icon: AlertTriangle, tone: "text-coral bg-coral/15" };
  if (type === "tenant.active") return { Icon: CheckCircle2, tone: "text-success bg-success/15" };
  if (type.includes("transfer")) return { Icon: ArrowRightLeft, tone: "text-chart-2 bg-chart-2/15" };
  return { Icon: Info, tone: "text-primary bg-primary/15" };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function NotificationsPage() {
  const { items, unread, loading, markAllRead } = useNotifications();

  // Mark everything read on open.
  useEffect(() => {
    if (unread > 0) void markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread === 0]);

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[900px] mx-auto">
      <header className="flex items-end justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Inbox</span>
          <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
            <Bell className="w-7 h-7" /> Notifications
          </h1>
          <p className="text-muted-foreground mt-2">Workspace, access and subscription updates.</p>
        </div>
        {items.some((n) => !n.read_at) && (
          <Button variant="outline" size="sm" onClick={() => markAllRead()}>
            Mark all read
          </Button>
        )}
      </header>

      <div className="glass-card divide-y divide-border/30">
        {loading && <div className="px-5 py-6 text-sm text-muted-foreground">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            You're all caught up — no notifications yet.
          </div>
        )}
        {items.map((n) => {
          const { Icon, tone } = iconFor(n.type);
          return (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-4 px-5 py-4 transition-colors",
                n.read_at ? "hover:bg-accent/20" : "bg-primary/5 hover:bg-primary/10",
              )}
            >
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", tone)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{n.title}</div>
                {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(n.created_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
