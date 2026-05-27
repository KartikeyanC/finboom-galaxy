import { useState } from "react";
import { Bell, CalendarClock, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Reminder {
  id: string;
  title: string;
  due: string;
  amount: string;
  category: "Insurance" | "Loan EMI" | "Savings" | "Subscription";
  paid: boolean;
}

const SEED: Reminder[] = [
  { id: "1", title: "Term Life Insurance — Premium", due: "2026-06-05", amount: "₹18,400", category: "Insurance", paid: false },
  { id: "2", title: "Home Loan EMI", due: "2026-06-07", amount: "₹42,300", category: "Loan EMI", paid: false },
  { id: "3", title: "Emergency Fund SIP", due: "2026-06-10", amount: "₹10,000", category: "Savings", paid: false },
  { id: "4", title: "Health Insurance — Renewal", due: "2026-06-22", amount: "₹14,200", category: "Insurance", paid: false },
  { id: "5", title: "Netflix + Spotify Bundle", due: "2026-06-12", amount: "₹799", category: "Subscription", paid: true },
];

export default function RemindersPage() {
  const [items, setItems] = useState<Reminder[]>(SEED);
  const upcoming = items.filter((i) => !i.paid).length;

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[1000px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Stay on track</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
          <Bell className="w-7 h-7" /> Reminders
        </h1>
        <p className="text-muted-foreground mt-2">{upcoming} upcoming payments this cycle.</p>
      </header>

      <div className="glass-card divide-y divide-border/30">
        {items.map((r) => (
          <label
            key={r.id}
            className={cn(
              "flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-accent/30",
              r.paid && "opacity-60"
            )}
          >
            <Checkbox
              checked={r.paid}
              onCheckedChange={(v) =>
                setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, paid: !!v } : x)))
              }
            />
            <div className="flex-1 min-w-0">
              <div className={cn("font-medium text-foreground", r.paid && "line-through")}>
                {r.title}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <CalendarClock className="w-3 h-3" />
                {new Date(r.due).toLocaleDateString()} • {r.category}
              </div>
            </div>
            <div className="font-display font-semibold text-foreground">{r.amount}</div>
            {r.paid && <CheckCircle2 className="w-4 h-4 text-success" />}
          </label>
        ))}
      </div>
    </div>
  );
}