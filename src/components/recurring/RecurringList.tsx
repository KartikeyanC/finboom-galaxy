import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Trash2, Calendar, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getIcon } from "@/lib/incomeSeed";
import { formatMoney } from "@/lib/finance";
import {
  useRecurring, useMarkRecurring, useDeleteRecurring,
  type RecurringType,
} from "@/hooks/useRecurring";

function daysUntil(iso: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(iso); due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function dueLabel(iso: string) {
  const d = daysUntil(iso);
  if (d < 0) return { text: `${Math.abs(d)}d overdue`, tone: "destructive" as const };
  if (d === 0) return { text: "Due today", tone: "default" as const };
  if (d <= 7) return { text: `In ${d}d`, tone: "secondary" as const };
  return { text: new Date(iso).toLocaleDateString(), tone: "outline" as const };
}

interface Props { type: RecurringType }

export default function RecurringList({ type }: Props) {
  const { data: items = [], isLoading } = useRecurring(type);
  const mark = useMarkRecurring();
  const del = useDeleteRecurring();

  const active = items.filter((i) => i.is_active);
  const accent = type === "income" ? "text-emerald-400" : "text-destructive";

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading recurring items…</div>;
  }

  if (active.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-muted-foreground">
        <Repeat className="w-6 h-6 mx-auto mb-2 opacity-50" />
        No recurring {type === "income" ? "income" : "expenses"} yet. Add one to start tracking.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <AnimatePresence initial={false}>
        {active.map((item) => {
          const Icon = getIcon(item.icon ?? "Coins");
          const due = dueLabel(item.next_due_date);
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="glass-card p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center ${accent}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.category} · {item.frequency}
                    </div>
                  </div>
                </div>
                <Badge variant={due.tone}>
                  <Calendar className="w-3 h-3 mr-1" />
                  {due.text}
                </Badge>
              </div>

              <div className={`font-display text-xl font-bold ${accent}`}>
                {formatMoney(item.amount, item.currency)}
                {item.currency !== "INR" && (
                  <span className="text-xs text-muted-foreground ml-2 font-sans font-normal">
                    ≈ {formatMoney(item.amount * Number(item.fx_rate), "INR")}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5"
                  variant={type === "income" ? "default" : "outline"}
                  onClick={() => mark.mutate(item)}
                  disabled={mark.isPending}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {type === "income" ? "Mark received" : "Mark paid"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" aria-label="Delete">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {item.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This stops future occurrences. Past transactions generated from it stay in your log.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate(item.id)}>
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}