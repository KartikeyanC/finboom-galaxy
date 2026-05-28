import { useState } from "react";
import { motion } from "framer-motion";
import { GripVertical, ChevronUp, ChevronDown, X } from "lucide-react";
import { getIcon, type IncomeStream } from "@/lib/incomeSeed";
import { formatMoney } from "@/lib/finance";
import { Button } from "@/components/ui/button";

interface Props {
  stream: IncomeStream;
  onDragStart: (id: string) => void;
  onDropOn: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", INR: "₹" };

const IncomeCard = ({ stream, onDragStart, onDropOn, onMove, onRemove, isFirst, isLast }: Props) => {
  const Icon = getIcon(stream.icon);
  const [over, setOver] = useState(false);
  const inr = stream.amount * stream.exchangeRateToINR;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25 }}
      draggable
      onDragStart={(e) => {
        (e as unknown as DragEvent).dataTransfer?.setData("text/plain", stream.id);
        onDragStart(stream.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDropOn(stream.id);
      }}
      className={`glass-card p-4 sm:p-5 flex items-center gap-3 sm:gap-4 transition-all hover:border-primary/30 ${
        over ? "border-primary ring-2 ring-primary/20" : ""
      }`}
    >
      <div className="flex flex-col items-center gap-1 shrink-0 text-muted-foreground">
        <button
          aria-label="Move up"
          onClick={() => onMove(stream.id, -1)}
          disabled={isFirst}
          className="sm:hidden disabled:opacity-30 hover:text-primary"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <GripVertical className="w-5 h-5 cursor-grab active:cursor-grabbing hidden sm:block" />
        <button
          aria-label="Move down"
          onClick={() => onMove(stream.id, 1)}
          disabled={isLast}
          className="sm:hidden disabled:opacity-30 hover:text-primary"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display font-semibold text-foreground truncate">{stream.name}</h3>
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
              stream.type === "active"
                ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                : "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30"
            }`}
          >
            {stream.type}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {SYMBOL[stream.currency]}
          {stream.amount.toLocaleString("en-US")} {stream.currency}
        </p>
      </div>

      <div className="text-right shrink-0">
        <div className="text-xs text-muted-foreground">In INR</div>
        <div className="font-display font-bold text-foreground text-lg">{formatMoney(inr, "INR")}</div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-coral shrink-0"
        onClick={() => onRemove(stream.id)}
        aria-label="Remove stream"
      >
        <X className="w-4 h-4" />
      </Button>
    </motion.div>
  );
};

export default IncomeCard;