import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ReminderField, emptyDraft, type ReminderDraft } from "./ReminderField";
import type { ReminderRecord } from "@/lib/remindersStore";

interface Props {
  open: boolean;
  record: ReminderRecord | null;
  onClose: () => void;
  onSave: (rec: ReminderRecord) => void;
}

function recordToDraft(r: ReminderRecord): ReminderDraft {
  return {
    enabled: true,
    context: r.context,
    date: r.date,
    amount: r.amount != null ? String(r.amount) : "",
    notes: r.notes,
    frequency: r.frequency,
    grace: r.grace,
    verifyLiquidity: r.verifyLiquidity,
    maturityLeads: r.maturityLeads,
  };
}

export function ReminderEditorDialog({ open, record, onClose, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<ReminderDraft>(emptyDraft("fixed_due"));

  useEffect(() => {
    if (!open) return;
    if (record) {
      setTitle(record.title);
      setDraft(recordToDraft(record));
    } else {
      setTitle("");
      setDraft({ ...emptyDraft("fixed_due"), enabled: true });
    }
  }, [open, record]);

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "Add a name", description: "Give your reminder a short title." });
      return;
    }
    if (!draft.date) {
      toast({ title: "Pick a date", description: "Reminder needs a target date." });
      return;
    }
    const amount = draft.amount && draft.amount.trim() !== "" ? Number(draft.amount) : undefined;
    const rec: ReminderRecord = {
      id: record?.id ?? crypto.randomUUID(),
      title: title.trim(),
      context: draft.context,
      date: draft.date,
      amount: Number.isFinite(amount) ? amount : undefined,
      currency: record?.currency ?? "INR",
      notes: draft.notes?.trim() || undefined,
      frequency: draft.context === "fixed_due" ? draft.frequency : undefined,
      grace: draft.context === "fixed_due" ? draft.grace : undefined,
      verifyLiquidity: draft.context === "balance_buffer" ? draft.verifyLiquidity : undefined,
      maturityLeads: draft.context === "maturity" ? draft.maturityLeads : undefined,
      source: record?.source ?? "manual",
      sourceId: record?.sourceId,
      status: "scheduled",
      createdAt: record?.createdAt ?? new Date().toISOString(),
    };
    onSave(rec);
    toast({ title: record ? "Reminder updated" : "Reminder scheduled" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{record ? "Edit reminder" : "New reminder"}</DialogTitle>
          <DialogDescription>
            Smart fields adapt based on what you&apos;re tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Reminder name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. HDFC Credit Card Bill"
              maxLength={80}
            />
          </div>

          <ReminderField value={draft} onChange={setDraft} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>{record ? "Save changes" : "Schedule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
