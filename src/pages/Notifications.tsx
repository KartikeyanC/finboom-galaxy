import { Bell, CheckCircle2, AlertTriangle, Info, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type NotifType = "success" | "warning" | "info" | "transfer";

const ITEMS: { id: string; type: NotifType; title: string; body: string; time: string }[] = [
  { id: "1", type: "transfer", title: "Carryover balance applied", body: "₹4,210 from April rolled into May's Play bucket.", time: "2h ago" },
  { id: "2", type: "success", title: "Salary credited", body: "₹85,000 added to your Income stream.", time: "Yesterday" },
  { id: "3", type: "warning", title: "Food & Dining over budget", body: "You've used 112% of this month's allocation.", time: "2d ago" },
  { id: "4", type: "info", title: "New feature: Manual FX entry", body: "Add custom exchange rates per transaction.", time: "3d ago" },
  { id: "5", type: "success", title: "Transaction saved", body: "Freelance · $1,200 @ 83.45 = ₹100,140", time: "4d ago" },
];

const ICONS: Record<NotifType, typeof Bell> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  transfer: ArrowRightLeft,
};

const TONE: Record<NotifType, string> = {
  success: "text-success bg-success/15",
  warning: "text-coral bg-coral/15",
  info: "text-primary bg-primary/15",
  transfer: "text-chart-2 bg-chart-2/15",
};

export default function NotificationsPage() {
  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[900px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Inbox</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
          <Bell className="w-7 h-7" /> Notifications
        </h1>
        <p className="text-muted-foreground mt-2">System status, balance carryovers, and recent activity.</p>
      </header>

      <div className="glass-card divide-y divide-border/30">
        {ITEMS.map((n) => {
          const Icon = ICONS[n.type];
          return (
            <div key={n.id} className="flex items-start gap-4 px-5 py-4 hover:bg-accent/20 transition-colors">
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", TONE[n.type])}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{n.title}</div>
                <div className="text-sm text-muted-foreground">{n.body}</div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{n.time}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}