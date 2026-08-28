import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TRACKER_TYPE_META, trackerTypeMeta } from "./trackerMeta";
import type { Tracker, TrackerInput, TrackerType } from "@/lib/trackers";

/**
 * Create or edit a tracker.
 *
 * Plain controlled state plus a module-level zod schema checked in submit —
 * the house form idiom since react-hook-form was removed (BUG-065). No new
 * form framework.
 *
 * Creating is TWO steps and editing is one. The template step turns "pick a
 * type" from a recall task (a dropdown of eight words) into a recognition one
 * (eight labelled cards with an example) — Hick's Law, and the same shape as
 * the trip-kind picker the user has already met (Jakob's). Editing skips it,
 * because by then the answer is already known.
 */

const schema = z.object({
  name: z.string().trim().min(1, "Give your tracker a name").max(80, "Name is too long"),
  start_date: z.string().min(1, "A start date is required"),
  end_date: z.string().nullable(),
  budget: z.number().nonnegative("A budget cannot be negative").max(1e12).nullable(),
  description: z.string().trim().max(500).nullable(),
});

const today = () => new Date().toISOString().slice(0, 10);

export default function TrackerDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Present when editing; absent when creating. */
  initial?: Tracker | null;
  onSubmit: (input: TrackerInput) => void;
  saving?: boolean;
}) {
  const editing = !!initial;

  const [step, setStep] = useState<"template" | "form">(editing ? "form" : "template");
  const [type, setType] = useState<TrackerType>("Custom");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState<number | undefined>(undefined);
  const [description, setDescription] = useState("");

  // Hydrate on open. Editing loads the row; creating resets, so a dialog
  // reopened after a cancel never shows the last attempt's half-typed values.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setStep("form");
      setType(initial.type);
      setName(initial.name);
      setStartDate(initial.start_date);
      setEndDate(initial.end_date ?? "");
      setBudget(initial.budget === null ? undefined : Number(initial.budget));
      setDescription(initial.description ?? "");
    } else {
      setStep("template");
      setType("Custom");
      setName("");
      setStartDate(today());
      setEndDate("");
      setBudget(undefined);
      setDescription("");
    }
  }, [open, initial]);

  const chooseTemplate = (t: TrackerType) => {
    setType(t);
    setStep("form");
  };

  const submit = () => {
    const parsed = schema.safeParse({
      name,
      start_date: startDate,
      end_date: endDate || null,
      budget: budget === undefined ? null : budget,
      description: description || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    // Checked here rather than in the schema so the message can name both
    // fields; a zod refinement would only be able to point at one.
    if (parsed.data.end_date && parsed.data.end_date < parsed.data.start_date) {
      toast.error("The end date cannot be before the start date");
      return;
    }
    onSubmit({
      name: parsed.data.name,
      type,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      budget: parsed.data.budget,
      description: parsed.data.description,
    });
  };

  const meta = trackerTypeMeta(type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <meta.icon className="w-5 h-5 text-primary" />
            {editing ? "Edit tracker" : step === "template" ? "What are you tracking?" : "New tracker"}
          </DialogTitle>
          <DialogDescription>
            {step === "template"
              ? "Pick the closest match. It only sets the icon and a suggested name — you can change everything next."
              : "A tracker groups transactions under a project. It holds no money and never moves any between your accounts."}
          </DialogDescription>
        </DialogHeader>

        {step === "template" ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TRACKER_TYPE_META.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.type}
                  type="button"
                  onClick={() => chooseTemplate(m.type)}
                  title={m.blurb}
                  className={cn(
                    "h-24 rounded-lg border flex flex-col items-center justify-center gap-1.5 px-2",
                    "text-xs font-medium transition-all text-center",
                    "border-border/50 hover:bg-accent/40 hover:border-primary/50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <Icon className="w-5 h-5 text-primary" />
                  {m.type}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tracker-name">Name</Label>
                <Input
                  id="tracker-name"
                  autoFocus
                  placeholder={`e.g. ${meta.placeholder}`}
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tracker-start">Start date</Label>
                <Input
                  id="tracker-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                {/* The distinction the whole date model rests on. */}
                <p className="text-xs text-muted-foreground">
                  When the project actually began — not when you created this tracker.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tracker-end">End date (optional)</Label>
                <Input
                  id="tracker-end"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tracker-budget">Budget (optional)</Label>
                <MoneyInput
                  id="tracker-budget"
                  placeholder="No budget"
                  value={budget ?? ""}
                  onValueChange={setBudget}
                />
                <p className="text-xs text-muted-foreground">
                  In ₹. Leave blank to just total the spend without a target.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tracker-desc">Notes (optional)</Label>
              <Textarea
                id="tracker-desc"
                rows={2}
                maxLength={500}
                placeholder="Anything you want to remember about this project."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === "form" && (
          <DialogFooter className="gap-2 sm:gap-0">
            {!editing && (
              <Button variant="ghost" onClick={() => setStep("template")} className="gap-1 mr-auto">
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create tracker"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
