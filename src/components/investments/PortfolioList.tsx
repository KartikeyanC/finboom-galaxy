import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Trash2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/finance";
import {
  ASSET_LABELS,
  getCurrent,
  getInvested,
  getRecordName,
  type InvestmentRecord,
} from "@/lib/investmentsStore";

interface Props {
  records: InvestmentRecord[];
  onEdit: (rec: InvestmentRecord) => void;
  onDelete: (id: string) => void;
}

const PortfolioList = ({ records, onEdit, onDelete }: Props) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
      <header className="flex items-center justify-between p-5 border-b border-border">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Active Investment Portfolio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {records.length}{" "}
            {records.length === 1 ? "asset tracked" : "assets tracked"}
          </p>
        </div>
      </header>

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 px-6">
          <div className="w-14 h-14 rounded-full bg-muted/60 flex items-center justify-center mb-4 text-muted-foreground">
            <Wallet className="w-7 h-7" />
          </div>
          <p className="text-sm text-muted-foreground max-w-xs">
            Your portfolio is empty. Click{" "}
            <span className="text-foreground font-medium">
              "Add New Investment"
            </span>{" "}
            above to track your growth.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {records.map((r) => {
              const invested = getInvested(r);
              const current = getCurrent(r);
              const delta = current - invested;
              const positive = delta >= 0;
              const isConfirming = confirmId === r.id;

              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="group relative px-5 py-4 hover:bg-muted/40 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                    {/* Left: name + badges */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">
                          {getRecordName(r)}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {ASSET_LABELS[r.asset]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {r.currency}
                        </Badge>
                        {r.goal && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-primary/40 text-primary"
                          >
                            {r.goal}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Middle: values */}
                    <div className="flex items-center gap-6 ml-auto">
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Invested
                        </div>
                        <div className="text-sm font-bold text-foreground tabular-nums">
                          {formatMoney(invested, r.currency)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Current
                        </div>
                        <div
                          className={`text-sm font-bold tabular-nums ${
                            positive ? "text-emerald-500" : "text-rose-500"
                          }`}
                        >
                          {formatMoney(current, r.currency)}
                        </div>
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                        onClick={() => onEdit(r)}
                        aria-label="Edit investment"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-rose-500"
                        onClick={() => setConfirmId(r.id)}
                        aria-label="Delete investment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Inline confirm */}
                  <AnimatePresence>
                    {isConfirming && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                          <span className="text-xs text-foreground">
                            Are you sure you want to delete this record?
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setConfirmId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs bg-rose-500 hover:bg-rose-500/90 text-white"
                              onClick={() => {
                                onDelete(r.id);
                                setConfirmId(null);
                              }}
                            >
                              Yes, Delete
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
};

export default PortfolioList;