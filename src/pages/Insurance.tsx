import { useEffect, useMemo, useState } from "react";
import { Plus, Paperclip, ShieldCheck, AlertTriangle, Trash2, Pencil, FileText, X, CalendarIcon, Clock, Heart, HeartPulse, Car, Smartphone, Package } from "lucide-react";
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
  daysUntil,
  useInsurance,
  PAY_STRUCTURES,
  PAYMENT_FREQUENCIES,
  FREQUENCY_MULTIPLIER,
  type InsuranceCategory,
  type InsurancePolicy,
  type PayStructure,
  type PaymentFrequency,
} from "@/lib/insuranceStore";
import { formatMoney } from "@/lib/finance";

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
          {subline && <span className={cn("text-[10px] font-semibold", `text-${tone === "destructive" ? "destructive" : tone + "-500"}`)}>{subline}</span>}
        </div>
      </div>
    </div>
  );
}

const CATEGORY_ICON: Record<InsuranceCategory, { Icon: typeof HeartPulse; wrap: string }> = {
  health: { Icon: HeartPulse, wrap: "bg-teal-500/15 text-teal-500 dark:text-teal-400" },
  life: { Icon: Heart, wrap: "bg-sky-500/15 text-sky-500 dark:text-sky-400" },
  vehicle: { Icon: Car, wrap: "bg-amber-500/15 text-amber-500 dark:text-amber-400" },
  gadget: { Icon: Smartphone, wrap: "bg-violet-500/15 text-violet-500 dark:text-violet-400" },
  other: { Icon: Package, wrap: "bg-muted text-muted-foreground" },
};

function CountdownRing({ days }: { days: number }) {
  const overdue = days < 0;
  const urgent = days >= 0 && days < 15;
  const max = 90;
  const clamped = Math.max(0, Math.min(max, days));
  const pct = (clamped / max) * 100;
  const tone = overdue
    ? "text-destructive"
    : urgent
      ? "text-amber-500"
      : "text-emerald-500";
  const trackTone = overdue
    ? "stroke-destructive/20"
    : urgent
      ? "stroke-amber-500/20"
      : "stroke-emerald-500/20";
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
        <circle cx="28" cy="28" r={r} className={cn("fill-none stroke-[4]", trackTone)} />
        <circle
          cx="28"
          cy="28"
          r={r}
          className={cn("fill-none stroke-[4] transition-all", tone.replace("text-", "stroke-"))}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className={cn("absolute inset-0 flex flex-col items-center justify-center", tone)}>
        <span className="text-sm font-bold leading-none">{overdue ? "!" : days}</span>
        <span className="text-[8px] uppercase tracking-wider opacity-70">{overdue ? "due" : "days"}</span>
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
              <Input type="number" value={form.sumInsured || ""} onChange={(e) => setForm({ ...form, sumInsured: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Premium Amount (₹)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={form.premium || ""}
                onChange={(e) => setForm({ ...form, premium: Number(e.target.value) })}
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
  const { items, add, update, remove } = useInsurance();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InsurancePolicy | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewPolicy, setPreviewPolicy] = useState<InsurancePolicy | null>(null);

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

  const handleFilePick = (policy: InsurancePolicy) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        update(policy.id, {
          documentName: file.name,
          documentDataUrl: String(reader.result),
          documentMime: file.type,
        });
        toast.success(`Attached ${file.name}`);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const grouped = useMemo(() => {
    const g: Record<InsuranceCategory, InsurancePolicy[]> = {
      health: [], life: [], vehicle: [], gadget: [], other: [],
    };
    items.forEach((p) => g[p.category].push(p));
    return g;
  }, [items]);

  const overdueCount = items.filter((p) => daysUntil(p.dueDate) < 0).length;
  const urgentCount = items.filter((p) => { const d = daysUntil(p.dueDate); return d >= 0 && d < 15; }).length;

  return (
    <div className="px-6 sm:px-10 py-10 space-y-12 max-w-[1400px] mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">Management</span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Insurance Center</h1>
          <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
            Monitor active coverage, renewal timelines, and policy documentation across your entire financial portfolio.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 px-5 py-2.5 font-semibold shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Add New Policy
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <KpiCard
          label="Active Policies"
          value={pad2(items.length)}
          icon={<ShieldCheck className="w-6 h-6" />}
          tone="emerald"
        />
        <KpiCard
          label="Renewing Soon"
          value={pad2(urgentCount)}
          icon={<Clock className="w-6 h-6" />}
          tone="amber"
          subline="IN 15 DAYS"
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
        <div className="space-y-12">
          {CATEGORY_ORDER.filter((c) => grouped[c].length > 0).map((cat) => {
            const meta = CATEGORY_META[cat];
            const { Icon, wrap } = CATEGORY_ICON[cat];
            return (
              <section key={cat}>
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center", wrap)}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <h2 className="text-lg font-semibold font-display">{meta.label} Insurance</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground uppercase tracking-wider">
                    {grouped[cat].length} Active
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {grouped[cat].map((p) => {
                    const d = daysUntil(p.dueDate);
                    const overdue = d < 0;
                    const urgent = !overdue && d < 15;
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "group relative rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20",
                          overdue
                            ? "border-destructive/40 shadow-lg shadow-destructive/5"
                            : urgent
                              ? "border-amber-500/40 ring-1 ring-amber-500/20"
                              : "border-border hover:border-border/80",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3 mb-6">
                          <div className="min-w-0">
                            <h3 className="text-lg font-bold text-foreground leading-tight truncate">{p.provider}</h3>
                            <p className="text-[11px] text-muted-foreground font-mono tracking-tight mt-1 truncate">{p.policyNumber}</p>
                          </div>
                          {overdue ? (
                            <div className="w-12 h-12 rounded-full border-2 border-destructive flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-black text-destructive tracking-wider">DUE</span>
                            </div>
                          ) : (
                            <CountdownRing days={d} />
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-y-4 gap-x-2 mb-6">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Sum Insured</div>
                            <div className="text-sm font-semibold text-foreground">{formatMoney(p.sumInsured)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Premium</div>
                            <div className="text-sm font-semibold text-foreground">{formatMoney(p.premium)}</div>
                          </div>
                          <div className="col-span-2 pt-3 border-t border-border/60">
                            <div className={cn(
                              "text-[10px] uppercase tracking-wider font-bold mb-1",
                              overdue ? "text-destructive" : urgent ? "text-amber-500" : "text-muted-foreground",
                            )}>Premium Due Date</div>
                            <div className={cn(
                              "text-sm font-bold",
                              overdue ? "text-destructive" : "text-foreground",
                            )}>{new Date(p.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                          </div>
                        </div>
                        {overdue && (
                          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                            <div className="min-w-0">
                              <div className="text-[10px] font-bold text-destructive uppercase leading-none mb-1">Action Required</div>
                              <div className="text-xs text-destructive/90">Renew Premium</div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {p.documentDataUrl ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5 h-9 text-xs font-semibold border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                              onClick={() => setPreviewPolicy(p)}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              View Document
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1 gap-1.5 h-9 text-xs font-semibold"
                              onClick={() => handleFilePick(p)}
                            >
                              <Paperclip className="w-3.5 h-3.5" /> Upload Doc
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={() => openEdit(p)}
                            aria-label="Edit policy"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteId(p.id)}
                            aria-label="Delete policy"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
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
                  remove(deleteId);
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

      <DocumentPreviewModal policy={previewPolicy} onClose={() => setPreviewPolicy(null)} />
    </div>
  );
};

function DocumentPreviewModal({ policy, onClose }: { policy: InsurancePolicy | null; onClose: () => void }) {
  const open = !!policy;
  const isPdf = policy?.documentMime?.includes("pdf") || policy?.documentName?.toLowerCase().endsWith(".pdf");
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
          {policy?.documentDataUrl ? (
            isPdf ? (
              <iframe
                src={policy.documentDataUrl}
                title={policy.documentName}
                className="w-full h-full border-0 bg-background"
              />
            ) : (
              <img
                src={policy.documentDataUrl}
                alt={policy.documentName}
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