import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, Tag, Plus, Trash2, Check } from "lucide-react";
import {
  EXPENSE_CATEGORY_GROUPS,
  findGroupForSub,
  useCustomSubcategories,
  type ExpenseCategoryGroup,
} from "@/lib/expenseSubcategories";
import { useCustomCategories } from "@/lib/categories";

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
  const [newSub, setNewSub] = useState("");
  const { add: addCustomSub, remove: removeCustomSub, forGroup, store } = useCustomSubcategories();
  const customCats = useCustomCategories();

  // Custom head categories created via "Create New Expense Category", surfaced
  // here so they're selectable as MAIN categories (deduped against built-ins).
  const customHeads = useMemo(
    () =>
      customCats.store.expense.filter(
        (n) => !EXPENSE_CATEGORY_GROUPS.some((g) => g.name.toLowerCase() === n.toLowerCase()),
      ),
    [customCats.store.expense],
  );

  const allGroups: ExpenseCategoryGroup[] = useMemo(
    () => [
      ...EXPENSE_CATEGORY_GROUPS,
      ...customHeads.map((n) => ({ name: n, icon: Tag, subs: [] as string[] })),
    ],
    [customHeads],
  );

  const [activeGroup, setActiveGroup] = useState<ExpenseCategoryGroup>(() => {
    const fromValue = value ? findGroupForSub(value) : undefined;
    const fromCategory = category
      ? EXPENSE_CATEGORY_GROUPS.find((g) => g.name === category)
      : undefined;
    return fromValue ?? fromCategory ?? EXPENSE_CATEGORY_GROUPS[0];
  });

  const q = query.trim().toLowerCase();

  // Built-in subs merged with any user-added custom subs for that group.
  const subsFor = (g: ExpenseCategoryGroup) => [...g.subs, ...forGroup(g.name)];
  const customSet = useMemo(() => new Set(forGroup(activeGroup.name)), [forGroup, activeGroup.name, store]);

  // Filtered groups -> subs. When searching across all groups, also rebuild what's shown
  // on the right pane.
  const filteredGroups = useMemo(() => {
    if (!q) return allGroups;
    return allGroups.map((g) => ({
      ...g,
      subs: subsFor(g).filter(
        (s) => s.toLowerCase().includes(q) || g.name.toLowerCase().includes(q),
      ),
    })).filter((g) => g.subs.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, store, allGroups]);

  const rightSubs = q
    ? filteredGroups.flatMap((g) =>
        g.subs.map((s) => ({ parent: g.name, sub: s, Icon: g.icon })),
      )
    : subsFor(activeGroup).map((s) => ({ parent: activeGroup.name, sub: s, Icon: activeGroup.icon }));

  const handlePick = (parent: string, sub: string) => {
    onSelect(parent, sub);
    setQuery("");
    setNewSub("");
    setOpen(false);
  };

  const handleAddSub = () => {
    const name = newSub.trim();
    if (!name) return;
    const ok = addCustomSub(activeGroup.name, name);
    setNewSub("");
    if (ok) handlePick(activeGroup.name, name);
  };

  const displayLabel = value ? value : category ? category : "Choose category";

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
        {/* Search header — extra right padding so the input clears the dialog's X button */}
        <div className="p-3 pr-12 border-b border-border/60">
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
            {(q ? filteredGroups : allGroups).map((g) => {
              const isActive = !q && g.name === activeGroup.name;
              const Icon = g.icon;
              return (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => {
                    setActiveGroup(allGroups.find((x) => x.name === g.name) ?? g);
                    setQuery("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm rounded-lg border transition-colors",
                    isActive
                      ? "bg-primary/10 border-primary/30 text-primary font-medium"
                      : "border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} strokeWidth={2} />
                  <span className="truncate leading-tight">{g.name}</span>
                </button>
              );
            })}
            </div>
          </div>

          {/* Right pane */}
          <div className="w-2/3 overflow-y-auto p-3 bg-background flex flex-col">
            {rightSubs.length === 0 && q ? (
              <div className="flex-1 grid place-items-center text-xs text-muted-foreground">
                No matches. Try a different search.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* Pick the head category directly (no specific subcategory). */}
                {!q && (
                  <button
                    type="button"
                    onClick={() => handlePick(activeGroup.name, "")}
                    className={cn(
                      "col-span-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs font-medium transition-all flex items-center gap-1.5",
                      value === null && category === activeGroup.name
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-primary/5",
                    )}
                  >
                    {value === null && category === activeGroup.name && <Check className="w-3.5 h-3.5 text-primary" />}
                    Use “{activeGroup.name}” directly
                  </button>
                )}
                {rightSubs.map(({ parent, sub, Icon }) => {
                  const selected = value === sub;
                  const isCustom = !q && customSet.has(sub);
                  return (
                    <div key={`${parent}-${sub}`} className="relative group">
                      <button
                        type="button"
                        onClick={() => handlePick(parent, sub)}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-all",
                          "flex flex-col gap-0.5 bg-muted/30",
                          selected
                            ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
                            : "border-border/60 text-foreground/90 hover:border-primary/50 hover:bg-primary/5",
                        )}
                      >
                        <span className="flex items-center gap-1.5 leading-tight">
                          {q && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          <span className="truncate">{sub}</span>
                        </span>
                        {q && (
                          <span className="text-xs text-muted-foreground truncate">{parent}</span>
                        )}
                      </button>
                      {isCustom && (
                        <button
                          type="button"
                          aria-label={`Remove ${sub}`}
                          onClick={(e) => { e.stopPropagation(); removeCustomSub(parent, sub); }}
                          className="absolute top-1 right-1 hidden group-hover:grid place-items-center h-5 w-5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add a custom subcategory under the active head category */}
            {!q && (
              <div className="mt-3 pt-3 border-t border-border/60">
                <div className="flex items-center gap-2">
                  <Input
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddSub(); } }}
                    placeholder={`Add a subcategory to ${activeGroup.name}…`}
                    className="h-9 text-xs"
                  />
                  <Button type="button" size="sm" className="h-9 gap-1 shrink-0" onClick={handleAddSub} disabled={!newSub.trim()}>
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-muted/40 border-t border-border/60 flex justify-between items-center">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            {q
              ? `Searching across ${allGroups.length} categories`
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
