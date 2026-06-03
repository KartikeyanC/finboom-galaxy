import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

const TREND_DATA = [
  { month: "Jan", netWorth: 850000, assets: 1200000, liabilities: 350000 },
  { month: "Feb", netWorth: 870000, assets: 1230000, liabilities: 360000 },
  { month: "Mar", netWorth: 920000, assets: 1280000, liabilities: 360000 },
  { month: "Apr", netWorth: 895000, assets: 1260000, liabilities: 365000 },
  { month: "May", netWorth: 960000, assets: 1320000, liabilities: 360000 },
  { month: "Jun", netWorth: 1010000, assets: 1380000, liabilities: 370000 },
  { month: "Jul", netWorth: 1045000, assets: 1410000, liabilities: 365000 },
  { month: "Aug", netWorth: 1080000, assets: 1440000, liabilities: 360000 },
  { month: "Sep", netWorth: 1120000, assets: 1490000, liabilities: 370000 },
  { month: "Oct", netWorth: 1165000, assets: 1540000, liabilities: 375000 },
  { month: "Nov", netWorth: 1210000, assets: 1590000, liabilities: 380000 },
  { month: "Dec", netWorth: 1280000, assets: 1650000, liabilities: 370000 },
];

const formatValue = (val: number) =>
  `₹${Math.round(val).toLocaleString("en-IN")}`;

const NetWorthTrend = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Net Worth Trend
        </h3>
        <span className="text-xs text-muted-foreground">Last 12 months</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={TREND_DATA}>
            <defs>
              <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(160, 60%, 45%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(160, 60%, 45%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(215, 12%, 50%)" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(215, 12%, 50%)" }}
              tickFormatter={formatValue}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(220, 18%, 10%)",
                border: "1px solid hsl(220, 14%, 16%)",
                borderRadius: "8px",
                color: "hsl(210, 20%, 92%)",
                fontSize: "12px",
              }}
              formatter={(value: number) => [formatValue(value), ""]}
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke="hsl(160, 60%, 45%)"
              strokeWidth={2.5}
              fill="url(#netWorthGrad)"
              dot={false}
              activeDot={{ r: 4, fill: "hsl(160, 60%, 45%)", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default NetWorthTrend;
