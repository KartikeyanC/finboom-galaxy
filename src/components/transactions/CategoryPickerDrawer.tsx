import { useMemo, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
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
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="px-4 pt-2 pb-3 text-left">
          <DrawerTitle className="text-base font-display">Pick a category</DrawerTitle>
          <div className="relative mt-2">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items (e.g., Fuel, Rent)..."
              className="pl-8 h-9 text-sm"
            />
          </div>
        </DrawerHeader>

        <div className="flex flex-1 min-h-[55vh] max-h-[65vh] border-t border-border/40">
          {/* Left pane */}
          <div className="w-[42%] sm:w-[34%] overflow-y-auto bg-muted/30 border-r border-border/40">
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
                    "w-full flex items-center gap-2 px-3 py-3 text-left text-sm transition-colors border-l-2",
                    isActive
                      ? "bg-primary/10 border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                  )}
                >
                  <span className="text-lg leading-none">{g.icon}</span>
                  <span className="truncate leading-tight">{g.name}</span>
                </button>
              );
            })}
          </div>

          {/* Right pane */}
          <div className="flex-1 overflow-y-auto p-3">
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
                        "rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                        "flex flex-col gap-0.5",
                        selected
                          ? "border-primary bg-primary/10 text-foreground shadow-sm"
                          : "border-border/60 bg-background hover:border-primary/40 hover:bg-accent/40",
                      )}
                    >
                      <span className="flex items-center gap-1.5 leading-tight">
                        {q && <span className="text-base">{icon}</span>}
                        <span className="truncate font-medium">{sub}</span>
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
      </DrawerContent>
    </Drawer>
  );
}