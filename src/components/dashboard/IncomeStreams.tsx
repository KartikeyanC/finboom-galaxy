import { motion } from "framer-motion";
import { Wallet, Briefcase, Home, Wrench, ArrowRightLeft } from "lucide-react";

interface IncomeStream {
  category: string;
  icon: React.ReactNode;
  sources: { name: string; amount: number; currency?: string; rate?: number }[];
}

const INCOME_STREAMS: IncomeStream[] = [
  {
    category: "Active",
    icon: <Briefcase className="w-4 h-4" />,
    sources: [{ name: "Salary", amount: 85000 }],
  },
  {
    category: "Passive",
    icon: <Wallet className="w-4 h-4" />,
    sources: [
      { name: "Freelance (USD)", amount: 1200, currency: "USD", rate: 83.5 },
      { name: "Freelance (INR)", amount: 25000 },
    ],
  },
  {
    category: "Investment",
    icon: <ArrowRightLeft className="w-4 h-4" />,
    sources: [
      { name: "MF Dividends", amount: 8500 },
      { name: "FD Interest", amount: 4200 },
    ],
  },
  {
    category: "Property",
    icon: <Home className="w-4 h-4" />,
    sources: [
      { name: "Home Rent", amount: 18000 },
      { name: "Agri Land", amount: 5000 },
    ],
  },
];

const formatCurrency = (val: number) => `₹${val.toLocaleString("en-IN")}`;

const IncomeStreams = () => {
  const totalIncome = INCOME_STREAMS.reduce(
    (total, stream) =>
      total +
      stream.sources.reduce(
        (s, src) => s + (src.currency ? src.amount * (src.rate || 1) : src.amount),
        0
      ),
    0
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Income Streams
        </h3>
        <span className="text-xs font-display font-semibold text-primary">
          {formatCurrency(Math.round(totalIncome))}/mo
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {INCOME_STREAMS.map((stream) => (
          <div key={stream.category}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-muted-foreground">{stream.icon}</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {stream.category}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 pl-6">
              {stream.sources.map((src) => (
                <div key={src.name} className="flex items-center justify-between text-sm">
                  <span className="text-secondary-foreground">{src.name}</span>
                  <div className="flex items-center gap-2">
                    {src.currency && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        ${src.amount} × ₹{src.rate}
                      </span>
                    )}
                    <span className="font-display font-semibold text-foreground">
                      {formatCurrency(src.currency ? Math.round(src.amount * (src.rate || 1)) : src.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default IncomeStreams;
