import { motion } from "framer-motion";
import { Bell, Shield, TrendingUp, AlertTriangle } from "lucide-react";

interface Reminder {
  icon: React.ReactNode;
  title: string;
  description: string;
  type: "info" | "warning" | "success";
}

const REMINDERS: Reminder[] = [
  {
    icon: <Shield className="w-4 h-4" />,
    title: "Term Insurance Due",
    description: "₹4,000 monthly savings needed. 2 months remaining.",
    type: "warning",
  },
  {
    icon: <TrendingUp className="w-4 h-4" />,
    title: "MF SIP Processed",
    description: "₹10,000 debited for Axis Bluechip Fund.",
    type: "success",
  },
  {
    icon: <AlertTriangle className="w-4 h-4" />,
    title: "Missed Savings Target",
    description: "₹3,200 shortfall redistributed to Oct-Dec.",
    type: "warning",
  },
];

const typeColors = {
  info: { bg: "bg-chart-2/10", border: "border-chart-2/20", icon: "text-chart-2" },
  warning: { bg: "bg-warning/10", border: "border-warning/20", icon: "text-warning" },
  success: { bg: "bg-success/10", border: "border-success/20", icon: "text-success" },
};

const ActionableReminders = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Reminders
        </h3>
        <Bell className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-3">
        {REMINDERS.map((r, i) => {
          const colors = typeColors[r.type];
          return (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-lg border ${colors.bg} ${colors.border}`}
            >
              <span className={`mt-0.5 ${colors.icon}`}>{r.icon}</span>
              <div>
                <span className="text-sm font-medium text-foreground block">{r.title}</span>
                <span className="text-xs text-muted-foreground">{r.description}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default ActionableReminders;
