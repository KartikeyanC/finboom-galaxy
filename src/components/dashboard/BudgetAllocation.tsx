import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const BUDGET_DATA = [
  { name: "Needs", value: 50, color: "hsl(160, 60%, 45%)" },
  { name: "Financial Freedom", value: 13, color: "hsl(210, 70%, 55%)" },
  { name: "Education", value: 10, color: "hsl(280, 60%, 55%)" },
  { name: "Play", value: 8, color: "hsl(35, 90%, 55%)" },
  { name: "Long-Term Savings", value: 8, color: "hsl(190, 70%, 50%)" },
  { name: "Giving", value: 6, color: "hsl(12, 80%, 60%)" },
  { name: "Agri", value: 5, color: "hsl(90, 50%, 45%)" },
];

const BudgetAllocation = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-card p-5"
    >
      <h3 className="font-display text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
        Budget Allocation
      </h3>
      <div className="flex items-center gap-4">
        <div className="w-40 h-40 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={BUDGET_DATA}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={68}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {BUDGET_DATA.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                cursor={false}
                contentStyle={{
                  backgroundColor: "hsl(220, 18%, 10%)",
                  border: "1px solid hsl(220, 14%, 16%)",
                  borderRadius: "8px",
                  color: "hsl(210, 20%, 92%)",
                  fontSize: "12px",
                }}
                itemStyle={{ color: "hsl(210, 20%, 92%)" }}
                labelStyle={{ color: "hsl(210, 20%, 70%)" }}
                formatter={(value: number, _n, entry: any) => [
                  `${value}%`,
                  entry?.payload?.name ?? "",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {BUDGET_DATA.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground truncate flex-1">{item.name}</span>
              <span className="font-medium text-foreground font-display">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default BudgetAllocation;
