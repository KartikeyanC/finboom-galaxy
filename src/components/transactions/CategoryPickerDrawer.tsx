import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, Tag } from "lucide-react";
import {
  EXPENSE_CATEGORY_GROUPS,
  findGroupForSub,
  type ExpenseCategoryGroup,
} from "@/lib/expenseSubcategories";

interface Props {
  /** Selected subcategory (drives the display label). */
  value: string | null;
  /** Selected parent category. */
  category: string | null;
  /** Called when the user taps a subcategory chip. */
  onSelect: (parent: string, sub: string) => void;
}

export default function CategoryPickerDrawer({ value, category, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<ExpenseCategoryGroup>(() => {
    const fromValue = value ? findGroupForSub(value) : undefined;
    const fromCategory = category
      ? EXPENSE_CATEGORY_GROUPS.find((g) => g.name === category)
      : undefined;
    return fromValue ?? fromCategory ?? EXPENSE_CATEGORY_GROUPS[0];
  });

  const q = query.trim().toLowerCase();

  // Filtered groups -> subs. When searching across all groups, also rebuild what's shown
  // on the right pane.
  const filteredGroups = useMemo(() => {
    if (!q) return EXPENSE_CATEGORY_GROUPS;
    return EXPENSE_CATEGORY_GROUPS.map((g) => ({
      ...g,
      subs: g.subs.filter(
        (s) => s.toLowerCase().includes(q) || g.name.toLowerCase().includes(q),
      ),
    })).filter((g) => g.subs.length > 0);
  }, [q]);

  const rightSubs = q
    ? filteredGroups.flatMap((g) =>
        g.subs.map((s) => ({ parent: g.name, sub: s, icon: g.icon })),
      )
    : activeGroup.subs.map((s) => ({ parent: activeGroup.name, sub: s, icon: activeGroup.icon }));

  const handlePick = (parent: string, sub: string) => {
    onSelect(parent, sub);
    setQuery("");
    setOpen(false);
  };

  const displayLabel = value
    ? value
    : category
      ? category
      : "Choose category";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal h-10"
        >
          <span className="flex items-center gap-2 truncate">
            <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{displayLabel}</span>
            {value && category && (
              <span className="text-xs text-muted-foreground truncate">· {category}</span>
            )}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="p-0 gap-0 sm:max-w-2xl max-h-[520px] overflow-hidden flex flex-col rounded-2xl"
      >
        {/* Search header */}
        <div className="p-3 border-b border-border/60">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories (e.g., Fuel, Rent)..."
              className="pl-9 h-10 text-sm"
            />
          </div>
        </div>

        {/* Two-pane picker */}
        <div className="flex flex-1 min-h-[340px] overflow-hidden">
          {/* Left pane */}
          <div className="w-1/3 overflow-y-auto border-r border-border/60 bg-background">
            <div className="p-2 space-y-1">
            {(q ? filteredGroups : EXPENSE_CATEGORY_GROUPS).map((g) => {
              const isActive = !q && g.name === activeGroup.name;
              return (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => {
                    setActiveGroup(g);
                    setQuery("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm rounded-lg border transition-colors",
                    isActive
                      ? "bg-primary/10 border-primary/30 text-primary font-medium"
                      : "border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                  )}
                >
                  <span className="text-base leading-none shrink-0">{g.icon}</span>
                  <span className="truncate leading-tight">{g.name}</span>
                </button>
              );
            })}
            </div>
          </div>

          {/* Right pane */}
          <div className="w-2/3 overflow-y-auto p-3 bg-background">
            {rightSubs.length === 0 ? (
              <div className="h-full grid place-items-center text-xs text-muted-foreground">
                No matches. Try a different search.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {rightSubs.map(({ parent, sub, icon }) => {
                  const selected = value === sub;
                  return (
                    <button
                      key={`${parent}-${sub}`}
                      type="button"
                      onClick={() => handlePick(parent, sub)}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-all",
                        "flex flex-col gap-0.5 bg-muted/30",
                        selected
                          ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
                          : "border-border/60 text-foreground/90 hover:border-primary/50 hover:bg-primary/5",
                      )}
                    >
                      <span className="flex items-center gap-1.5 leading-tight">
                        {q && <span className="text-sm">{icon}</span>}
                        <span className="truncate">{sub}</span>
                      </span>
                      {q && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {parent}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-muted/40 border-t border-border/60 flex justify-between items-center">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {q
              ? `Searching across ${EXPENSE_CATEGORY_GROUPS.length} categories`
              : `Selecting for: ${activeGroup.name}`}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}