import { useEffect, useState } from "react";
import { Plus, ShieldCheck, AlertTriangle, X, CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CATEGORY_META,
  policyUrgency,
  URGENT_DAYS,
  useInsurance,
  PAY_STRUCTURES,
  PAYMENT_FREQUENCIES,
  FREQUENCY_MULTIPLIER,
  type InsuranceCategory,
  type InsurancePolicy,
  type PayStructure,
  type PaymentFrequency,
  uploadPolicyDocument,
  deletePolicyDocument,
  signedDocumentUrl,
  loadLegacyDocument,
} from "@/lib/insuranceStore";
import { DOC_ACCEPT, documentRejectionReason } from "@/lib/insuranceDocs";
import { useTenant } from "@/contexts/TenantContext";
import { notifyError } from "@/lib/errorMessages";
import { formatMoney } from "@/lib/finance";
import PolicyList from "@/components/insurance/PolicyList";

const CATEGORY_ORDER: InsuranceCategory[] = ["health", "life", "vehicle", "gadget", "other"];

const pad2 = (n: number) => String(n).padStart(2, "0");

function KpiCard({
  label,
  value,
  icon,
  tone,
  subline,
  ring,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "destructive";
  subline?: string;
  ring?: boolean;
}) {
  const toneMap = {
    emerald: { wrap: "bg-emerald-500/10 text-emerald-500", ring: "ring-emerald-500/20", border: "" },
    amber: { wrap: "bg-amber-500/10 text-amber-500", ring: "ring-amber-500/20", border: "" },
    destructive: { wrap: "bg-destructive/10 text-destructive", ring: "ring-destructive/20", border: "border-destructive/30" },
  }[tone];
  return (
    <div
      className={cn(
        "p-5 bg-card border border-border rounded-2xl flex items-center gap-5 transition-colors",
        ring && `ring-1 ${toneMap.ring} ${toneMap.border}`,
      )}
    >
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", toneMap.wrap)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className={cn("text-2xl font-bold font-display", tone === "destructive" ? "text-destructive" : "text-foreground")}>{value}</p>
          {subline && <span className={cn("text-xs font-semibold", `text-${tone === "destructive" ? "destructive" : tone + "-500"}`)}>{subline}</span>}
        </div>
      </div>
    </div>
  );
}

type PolicyFormData = Omit<InsurancePolicy, "id" | "createdAt">;

const EMPTY_FORM: PolicyFormData = {
    category: "health",
    policyName: "",
    provider: "",
    policyNumber: "",
    sumInsured: 0,
    premium: 0,
    payStructure: "Regular-Pay",
    paymentFrequency: "Annual",
    dueDate: new Date().toISOString().slice(0, 10),
    documentName: "",
  documentDataUrl: "",
  documentMime: "",
    notes: "",
};

function PolicyDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  mode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: PolicyFormData;
  onSubmit: (p: PolicyFormData) => void;
  mode: "create" | "edit";
}) {
  const [form, setForm] = useState<PolicyFormData>(initial);

  useEffect(() => {
    if (open) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Insurance Policy" : "Edit Insurance Policy"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Policy Name</Label>
            <Input
              value={form.policyName}
              placeholder="e.g. HDFC Life Term Plan"
              onChange={(e) => setForm({ ...form, policyName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as InsuranceCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_META[c].emoji} {CATEGORY_META[c].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pay Structure</Label>
              <Select
                value={form.payStructure}
                onValueChange={(v) => setForm({ ...form, payStructure: v as PayStructure })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAY_STRUCTURES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Insurance Provider</Label>
            <Input
              value={form.provider}
              placeholder="e.g. Star Health"
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Policy Number</Label>
            <Input value={form.policyNumber} onChange={(e) => setForm({ ...form, policyNumber: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sum Insured (₹)</Label>
              <MoneyInput value={form.sumInsured || ""} onValueChange={(n) => setForm({ ...form, sumInsured: n ?? 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label>Premium Amount (₹)</Label>
              <MoneyInput
                placeholder="0"
                value={form.premium || ""}
                onValueChange={(n) => setForm({ ...form, premium: n ?? 0 })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment Frequency</Label>
              <Select
                value={form.paymentFrequency}
                onValueChange={(v) => setForm({ ...form, paymentFrequency: v as PaymentFrequency })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_FREQUENCIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Next Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal h-10", !form.dueDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.dueDate ? format(new Date(form.dueDate), "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.dueDate ? new Date(form.dueDate) : undefined}
                    onSelect={(d) => d && setForm({ ...form, dueDate: d.toISOString().slice(0, 10) })}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!form.policyName || !form.provider || !form.policyNumber}
            onClick={() => { onSubmit(form); onOpenChange(false); }}
          >
            {mode === "create" ? "Save Policy" : "Update Policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Insurance = () => {
  const { items, add, update, remove, removeMany } = useInsurance();
  const { currentTenantId } = useTenant();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InsurancePolicy | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewPolicy, setPreviewPolicy] = useState<InsurancePolicy | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (p: InsurancePolicy) => { setEditing(p); setDialogOpen(true); };

  const handleSubmit = (data: PolicyFormData) => {
    if (editing) {
      update(editing.id, data);
      toast.success("Policy updated");
    } else {
      add(data);
      toast.success("Policy added");
    }
  };

  // Stage 3.3: the file goes to the insurance-docs bucket; the row keeps only a
  // path. Previously this read the whole file into a base64 data URL with no
  // size check at all and stored it in the row.
  const handleFilePick = (policy: InsurancePolicy) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = DOC_ACCEPT;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!currentTenantId) {
        toast.error("No workspace selected");
        return;
      }
      // The bucket enforces this too; checking here turns a failed upload into
      // a sentence the user can act on.
      const rejection = documentRejectionReason(file);
      if (rejection) {
        toast.error("Couldn't attach that file", { description: rejection });
        return;
      }

      const previousPath = policy.documentPath;
      setUploadingId(policy.id);
      try {
        const fields = await uploadPolicyDocument(currentTenantId, policy.id, file);
        update(policy.id, { ...fields, documentDataUrl: null });
        // Only once the row points at the new object — otherwise a failure
        // between the two would leave the policy referencing a deleted file.
        if (previousPath) void deletePolicyDocument(previousPath);
        toast.success(`Attached ${file.name}`);
      } catch (e) {
        notifyError(e, { title: "Couldn't upload that document" });
      } finally {
        setUploadingId(null);
      }
    };
    input.click();
  };

  // Bulk delete: one batch call for the rows, then each policy's document —
  // the same clean-up as the single delete, and only once the rows are gone,
  // so a failed delete never leaves a policy pointing at a deleted file.
  const deleteMany = async (ids: string[]) => {
    const doomed = items
      .filter((x) => ids.includes(x.id) && x.documentPath)
      .map((x) => x.documentPath as string);
    await removeMany(ids);
    doomed.forEach((path) => void deletePolicyDocument(path));
  };

  // A policy with no renewal date is neither overdue nor urgent — it is
  // unknown, and counting it either way would be a claim we cannot make.
  const overdueCount = items.filter((p) => policyUrgency(p.dueDate) === "overdue").length;
  const urgentCount = items.filter((p) => policyUrgency(p.dueDate) === "urgent").length;
  const annualPremiumTotal = items.reduce(
    (sum, p) => sum + (p.premium || 0) * (FREQUENCY_MULTIPLIER[p.paymentFrequency] ?? 1),
    0,
  );

  return (
    <div className="px-6 sm:px-10 py-10 space-y-12 max-w-[1400px] mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-primary font-bold">Management</span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Insurance Center</h1>
          <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
            Monitor active coverage, renewal timelines, and policy documentation across your entire financial portfolio.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 px-5 py-2.5 font-semibold shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Add New Policy
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard
          label="Active Policies"
          value={pad2(items.length)}
          icon={<ShieldCheck className="w-6 h-6" />}
          tone="emerald"
        />
        <KpiCard
          label="Annual Premium"
          value={formatMoney(annualPremiumTotal)}
          icon={<ShieldCheck className="w-6 h-6" />}
          tone="emerald"
        />
        <KpiCard
          label="Renewing Soon"
          value={pad2(urgentCount)}
          icon={<Clock className="w-6 h-6" />}
          tone="amber"
          subline={`IN ${URGENT_DAYS} DAYS`}
          ring={urgentCount > 0}
        />
        <KpiCard
          label="Overdue Policies"
          value={pad2(overdueCount)}
          icon={<AlertTriangle className="w-6 h-6" />}
          tone="destructive"
          ring={overdueCount > 0}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState onAdd={openCreate} />
      ) : (
        <PolicyList
          items={items}
          categoryOrder={CATEGORY_ORDER}
          uploadingId={uploadingId}
          onPreview={setPreviewPolicy}
          onUpload={handleFilePick}
          onEdit={openEdit}
          onDelete={setDeleteId}
          onDeleteMany={deleteMany}
        />
      )}

      <PolicyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing ?? EMPTY_FORM}
        mode={editing ? "edit" : "create"}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete policy?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this policy allocation? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  // Take the object with the row. Storage has no foreign key to
                  // cascade for us, so deleting only the row would leave the
                  // file paying rent forever with nothing pointing at it.
                  const doomed = items.find((x) => x.id === deleteId)?.documentPath;
                  remove(deleteId);
                  if (doomed) void deletePolicyDocument(doomed);
                  toast.success("Policy removed");
                }
                setDeleteId(null);
              }}
            >
              Delete Policy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentPreviewModal
        policy={previewPolicy}
        tenantId={currentTenantId}
        onClose={() => setPreviewPolicy(null)}
      />
    </div>
  );
};

function DocumentPreviewModal({
  policy,
  tenantId,
  onClose,
}: {
  policy: InsurancePolicy | null;
  tenantId: string | null;
  onClose: () => void;
}) {
  const open = !!policy;
  const isPdf = policy?.documentMime?.includes("pdf") || policy?.documentName?.toLowerCase().endsWith(".pdf");

  // Stage 3.3: the bucket is private, so the viewer needs a short-lived signed
  // URL rather than a value carried on the row. Pre-3.3 policies still hold an
  // inline data URL, which is fetched here — one row, only when opened.
  const [src, setSrc] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!policy) {
      setSrc(null);
      return;
    }
    setResolving(true);
    (async () => {
      let url: string | null = null;
      if (policy.documentPath) {
        url = await signedDocumentUrl(policy.documentPath);
      } else if (tenantId) {
        url = await loadLegacyDocument(tenantId, policy.id);
      }
      if (!cancelled) {
        setSrc(url);
        setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [policy, tenantId]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3 bg-card">
          <div className="min-w-0">
            <DialogTitle className="text-sm font-semibold truncate">{policy?.documentName || "Policy Document"}</DialogTitle>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {policy?.provider} · {policy?.policyNumber}
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={onClose}>
            <X className="w-3.5 h-3.5" /> Close Document Preview
          </Button>
        </div>
        <div className="bg-muted/30 h-[75vh] overflow-auto flex items-center justify-center">
          {resolving ? (
            <div className="text-sm text-muted-foreground">Loading document…</div>
          ) : src ? (
            isPdf ? (
              <iframe
                src={src}
                title={policy?.documentName}
                className="w-full h-full border-0 bg-background"
              />
            ) : (
              <img
                src={src}
                alt={policy?.documentName}
                className="max-w-full max-h-full object-contain"
              />
            )
          ) : (
            <div className="text-sm text-muted-foreground">No document attached</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <ShieldCheck className="w-8 h-8 text-primary" />
      </div>
      <h3 className="font-display text-xl font-semibold">No policies yet</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
        Add your health, life and vehicle insurance to never miss a renewal.
      </p>
      <Button onClick={onAdd} className="mt-5 gap-1.5"><Plus className="w-4 h-4" /> Add Your First Policy</Button>
    </div>
  );
}

export default Insurance;