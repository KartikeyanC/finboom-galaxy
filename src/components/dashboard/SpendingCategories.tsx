import { motion } from "framer-motion";
import {
  Car,
  UtensilsCrossed,
  ShoppingBag,
  Heart,
  Smartphone,
  Stethoscope,
  GraduationCap,
  Plane,
} from "lucide-react";

interface SpendCategory {
  name: string;
  amount: number;
  icon: React.ReactNode;
  color: string;
  budget: number;
}

const SPENDING: SpendCategory[] = [
  { name: "Food & Dining", amount: 12400, icon: <UtensilsCrossed className="w-4 h-4" />, color: "hsl(35, 90%, 55%)", budget: 15000 },
  { name: "Transport", amount: 5800, icon: <Car className="w-4 h-4" />, color: "hsl(210, 70%, 55%)", budget: 6000 },
  { name: "Shopping", amount: 8200, icon: <ShoppingBag className="w-4 h-4" />, color: "hsl(280, 60%, 55%)", budget: 10000 },
  { name: "Healthcare", amount: 3500, icon: <Stethoscope className="w-4 h-4" />, color: "hsl(12, 80%, 60%)", budget: 5000 },
  { name: "Education", amount: 4000, icon: <GraduationCap className="w-4 h-4" />, color: "hsl(190, 70%, 50%)", budget: 8000 },
  { name: "Travel", amount: 6500, icon: <Plane className="w-4 h-4" />, color: "hsl(160, 60%, 45%)", budget: 8000 },
  { name: "Subscriptions", amount: 2100, icon: <Smartphone className="w-4 h-4" />, color: "hsl(45, 85%, 55%)", budget: 3000 },
  { name: "Personal Care", amount: 1800, icon: <Heart className="w-4 h-4" />, color: "hsl(330, 60%, 55%)", budget: 3000 },
];

const formatCurrency = (val: number) => `₹${val.toLocaleString("en-IN")}`;

const SpendingCategories = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="glass-card p-5"
    >
      <h3 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
        Spending This Month
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {SPENDING.map((cat) => {
          const pct = Math.round((cat.amount / cat.budget) * 100);
          const overBudget = pct > 90;
          return (
            <div
              key={cat.name}
              className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors"
            >
              <span style={{ color: cat.color }}>{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-foreground block truncate">{cat.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(cat.amount)}
                </span>
                <div className="h-1 rounded-full bg-secondary mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: overBudget ? "hsl(12, 80%, 60%)" : cat.color,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default SpendingCategories;
