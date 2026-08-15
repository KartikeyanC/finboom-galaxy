import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  delay?: number;
}

const MetricCard = ({ label, value, change, changeType = "neutral", icon, delay = 0 }: MetricCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="glass-card p-5 flex flex-col gap-3 group hover:border-primary/30 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="metric-label">{label}</span>
        {icon && <span className="text-muted-foreground group-hover:text-primary transition-colors">{icon}</span>}
      </div>
      <div className="metric-value text-foreground">{value}</div>
      {change && (
        <div className="flex items-center gap-1.5">
          {changeType === "positive" ? (
            <ArrowUpRight className="w-3.5 h-3.5 text-success" />
          ) : changeType === "negative" ? (
            <ArrowDownRight className="w-3.5 h-3.5 text-coral" />
          ) : null}
          <span
            className={cn(
              "text-xs font-medium",
              changeType === "positive" && "text-success",
              changeType === "negative" && "text-coral",
              changeType === "neutral" && "text-muted-foreground"
            )}
          >
            {change}
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default MetricCard;
