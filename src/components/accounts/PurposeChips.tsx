import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The "Account Utility Purpose" chip editor — split out of
 * AccountsManager.tsx in Stage 4.13.
 *
 * The four pieces of state it needs (is the add box open, its draft, which
 * chip is being renamed, its draft) are transient UI state that nothing else
 * on the page reads, so they live here now instead of among the page's
 * fourteen `useState`s.
 *
 * Renaming and deleting a purpose do NOT stop at the option list — they also
 * rewrite the tag on the form and on every saved account — so those stay with
 * the parent and come back as callbacks. `onAdd`/`onRename` return whether the
 * change was accepted: a rejected name (a duplicate) must leave the editor
 * open with the text still in it, which a void callback could not express.
 */
export default function PurposeChips({
  options,
  selected,
  onToggle,
  onAdd,
  onRename,
  onDelete,
}: {
  options: string[];
  selected: string[];
  onToggle: (purpose: string) => void;
  onAdd: (purpose: string) => boolean;
  onRename: (from: string, to: string) => boolean;
  onDelete: (purpose: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newPurpose, setNewPurpose] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const addPurpose = () => {
    const v = newPurpose.trim();
    if (!v) return;
    if (!onAdd(v)) return;
    setNewPurpose("");
    setAdding(false);
  };

  const startEdit = (p: string) => {
    setEditing(p);
    setEditValue(p);
  };

  const commitEdit = () => {
    const v = editValue.trim();
    if (!editing || !v || v === editing) {
      setEditing(null);
      return;
    }
    if (onRename(editing, v)) setEditing(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Account Utility Purpose</Label>
        {!adding && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-primary hover:text-primary"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Add Custom Purpose
          </Button>
        )}
      </div>

      {adding && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={newPurpose}
            onChange={(e) => setNewPurpose(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPurpose();
              } else if (e.key === "Escape") {
                setAdding(false);
                setNewPurpose("");
              }
            }}
            placeholder="e.g. Business Capital, Kids Education"
            className="h-9"
          />
          <Button type="button" size="sm" onClick={addPurpose}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setNewPurpose("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {options.map((p) => {
          const checked = selected.includes(p);
          if (editing === p) {
            return (
              <div key={p} className="flex items-center gap-1 rounded-full border border-primary/60 bg-primary/10 pl-2 pr-1 py-0.5">
                <Input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitEdit();
                    } else if (e.key === "Escape") {
                      setEditing(null);
                    }
                  }}
                  onBlur={commitEdit}
                  className="h-7 w-40 text-xs border-0 bg-transparent focus-visible:ring-0 px-1"
                />
              </div>
            );
          }
          return (
            <div
              key={p}
              className={cn(
                "group inline-flex items-center gap-1 rounded-full border pl-3 pr-1 py-1 text-xs transition-colors cursor-pointer select-none",
                checked
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/60 bg-card/40 hover:border-border text-foreground/80",
              )}
              onClick={() => onToggle(p)}
            >
              {checked && <Check className="h-3 w-3" />}
              <span>{p}</span>
              <span className="ml-1 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(p);
                  }}
                  className="h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-foreground/10"
                  aria-label={`Edit ${p}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p);
                  }}
                  className="h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-destructive/15 text-destructive"
                  aria-label={`Delete ${p}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          );
        })}
        {options.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground">
            No purposes yet. Add one to tag your accounts.
          </p>
        )}
      </div>
    </div>
  );
}
