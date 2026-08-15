import { AlertTriangle, HandCoins, Smartphone, User, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SplitMode } from "@/lib/splitMeta";

/**
 * The "Shared Group Split" toggle and its three modes — split out of
 * TransactionDialog.tsx in Stage 4.13.
 *
 * Purely the fields: what gets WRITTEN for a split (the encoded description
 * plus the optional net-worth mirror) stays in the dialog's submit path,
 * because the mirror is menu-gated and must not post when the workspace lacks
 * the net-worth feature.
 *
 * `amount` is the user's OWN share in every mode; `splitTotal` is the whole
 * bill and only exists for "I paid for everyone".
 */
export default function SplitFields({
  splitOn,
  onSplitOnChange,
  splitMode,
  onSplitModeChange,
  splitTotal,
  onSplitTotalChange,
  splitFriend,
  onSplitFriendChange,
  amount,
  onAmountChange,
  currency,
}: {
  splitOn: boolean;
  onSplitOnChange: (on: boolean) => void;
  splitMode: SplitMode;
  onSplitModeChange: (mode: SplitMode) => void;
  splitTotal: string;
  onSplitTotalChange: (v: string) => void;
  splitFriend: string;
  onSplitFriendChange: (v: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  currency: string;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Transaction Type</Label>
      <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border/40">
        <button
          type="button"
          onClick={() => onSplitOnChange(false)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
            !splitOn
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <User className="w-3.5 h-3.5" /> Single Expense
        </button>
        <button
          type="button"
          onClick={() => onSplitOnChange(true)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
            splitOn
              ? "bg-background text-foreground shadow-sm border border-primary/40"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Users className="w-3.5 h-3.5" /> Shared Group Split
        </button>
      </div>
      <AnimatePresence initial={false}>
        {splitOn && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-3">
              <div className="grid grid-cols-1 gap-2">
                {([
                  { id: "paid_full", icon: HandCoins, title: "I Paid for Everyone", sub: "Friend owes me their share" },
                  { id: "settled", icon: Smartphone, title: "Friend Paid, I Settled Now via UPI", sub: "Already squared up" },
                  { id: "owe", icon: AlertTriangle, title: "Friend Paid, I Owe Them", sub: "Unsettled debt to track" },
                ] as const).map((opt) => {
                  const Icon = opt.icon;
                  const active = splitMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSplitModeChange(opt.id)}
                      className={cn(
                        "flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 transition-colors",
                        active
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/50 hover:bg-accent/40",
                      )}
                    >
                      <Icon className={cn("w-4 h-4 mt-0.5", active ? "text-primary" : "text-muted-foreground")} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{opt.title}</div>
                        <div className="text-xs text-muted-foreground">{opt.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                {splitMode === "paid_full" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total Bill Amount</Label>
                    <Input
                      type="number" inputMode="decimal" placeholder="e.g. 1000"
                      value={splitTotal}
                      onChange={(e) => onSplitTotalChange(e.target.value)}
                    />
                  </div>
                )}
                <div className={cn("space-y-1.5", splitMode !== "paid_full" && "col-span-2")}>
                  <Label className="text-xs">
                    {splitMode === "paid_full" ? "My Share Amount" : "Your Share"}
                  </Label>
                  <MoneyInput
                    placeholder="e.g. 200"
                    value={amount}
                    onValueChange={(n) => onAmountChange(n === undefined ? "" : String(n))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Friend / Group Name</Label>
                <Input
                  placeholder="e.g. Rahul, Goa Trip Crew"
                  value={splitFriend}
                  onChange={(e) => onSplitFriendChange(e.target.value)}
                />
              </div>

              {splitMode === "paid_full" && Number(splitTotal) > 0 && Number(amount) > 0 && (
                <div className="text-xs text-muted-foreground rounded-md bg-background/60 border border-border/40 px-3 py-2">
                  <span className="text-foreground font-medium">
                    {currency} {Math.max(0, Number(splitTotal) - Number(amount)).toLocaleString("en-IN")}
                  </span>{" "}
                  will be tracked as <span className="text-foreground">owed by {splitFriend || "friend"}</span> in your Net Worth assets.
                </div>
              )}
              {splitMode === "owe" && Number(amount) > 0 && (
                <div className="text-xs text-amber-300/90 rounded-md bg-amber-500/5 border border-amber-500/30 px-3 py-2">
                  Will be added as a liability under Personal Loans in your Net Worth.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
