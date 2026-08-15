import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import type { IncomeStream } from "@/lib/incomeSeed";
import { IconChip } from "@/components/ui/icon-chip";

interface Props {
  streams: IncomeStream[];
  onToggle: (id: string) => void;
  onReset: () => void;
}

const ManageCategoriesSheet = ({ streams, onToggle, onReset }: Props) => {
  const sorted = [...streams].sort((a, b) => {
    if (a.type !== b.type) return a.type === "active" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" />
          <span className="hidden sm:inline">Manage Categories</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Manage Categories</SheetTitle>
          <SheetDescription>Toggle income streams on or off. Changes apply instantly.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-2">
          {sorted.map((s) => {
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors"
              >
                <IconChip name={s.icon} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{s.type} income</div>
                </div>
                <Switch checked={s.isVisible} onCheckedChange={() => onToggle(s.id)} />
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onReset} className="w-full">
            Reset to defaults
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ManageCategoriesSheet;