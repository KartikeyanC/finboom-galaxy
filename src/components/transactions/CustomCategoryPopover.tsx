import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useCustomCategories, type IncomeSubtype } from "@/lib/categories";
import type { TxnType } from "@/hooks/useTransactions";

/**
 * Create and manage this workspace's custom categories — split out of
 * TransactionDialog.tsx in Stage 4.13.
 *
 * It reads and writes the same tenant setting the dialog does (via
 * `useCustomCategories`, a React Query-backed store, so both see one cache).
 * `onCreated` exists because adding a category also SELECTS it in the form —
 * and for an expense it clears the subcategory, since a brand-new head
 * category has none.
 */
export default function CustomCategoryPopover({
  activeType,
  onCreated,
}: {
  activeType: TxnType;
  onCreated: (name: string) => void;
}) {
  const custom = useCustomCategories();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sub, setSub] = useState<IncomeSubtype>("active");

  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (activeType === "income") {
      custom.addIncome(sub, n);
    } else {
      custom.addExpense(n);
    }
    onCreated(n);
    setName("");
    setOpen(false);
    toast.success(`Added "${n}"`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button
      type="button"
      variant="outline"
      className="w-full justify-center gap-2 border-dashed border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
    >
      <Plus className="w-4 h-4" />
      Create New {activeType === "income" ? "Income" : "Expense"} Category
    </Button>
  </PopoverTrigger>
  <PopoverContent align="end" className="w-72 sm:w-80 space-y-3 p-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Create new category</Label>
        <Input
          autoFocus
          placeholder="e.g. Crypto, Coffee"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </div>
      {activeType === "income" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Classify as</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["active", "passive"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSub(s)}
                className={
                  "text-xs rounded-md py-1.5 border capitalize " +
                  (sub === s
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={save}>Save</Button>
      </div>
      {/* Manage existing custom */}
      {(activeType === "income"
        ? [...custom.store.income.active.map((n) => ({ n, sub: "active" as const })),
           ...custom.store.income.passive.map((n) => ({ n, sub: "passive" as const }))]
        : custom.store.expense.map((n) => ({ n, sub: null as null }))
      ).length > 0 && (
        <div className="border-t border-border pt-2 space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Your custom
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {activeType === "income"
              ? [
                  ...custom.store.income.active.map((n) => ({ n, sub: "active" as IncomeSubtype })),
                  ...custom.store.income.passive.map((n) => ({ n, sub: "passive" as IncomeSubtype })),
                ].map(({ n, sub: entrySub }) => (
                  <div key={`${entrySub}-${n}`} className="flex items-center justify-between text-xs">
                    <span>
                      {n} <span className="text-muted-foreground">· {entrySub}</span>
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-coral"
                      onClick={() => custom.removeIncome(entrySub, n)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              : custom.store.expense.map((n) => (
                  <div key={n} className="flex items-center justify-between text-xs">
                    <span>{n}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-coral"
                      onClick={() => custom.removeExpense(n)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
          </div>
        </div>
      )}
  </PopoverContent>
</Popover>
  );
}
