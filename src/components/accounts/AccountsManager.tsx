import { useMemo, useState } from "react";
import {
  Wallet,
  Landmark,
  CreditCard,
  Coins,
  TrendingUp,
  Shield,
  Smartphone,
  Banknote,
  Plus,
  Trash2,
  Archive,
  Check,
  CalendarIcon,
  Pencil,
  X,
  Users,
  Lock,
  ChevronDown,
  ChevronUp,
  Mail,
  ShieldCheck,
  Eye,
  AlertTriangle,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AccountType =
  | "bank"
  | "debit"
  | "credit"
  | "wallet"
  | "cash"
  | "investment"
  | "other";

const ACCOUNT_TYPES: { id: AccountType; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "bank", label: "Bank Account", icon: Landmark, hint: "Savings / Current" },
  { id: "debit", label: "Debit Card", icon: CreditCard, hint: "Linked to bank" },
  { id: "credit", label: "Credit Card", icon: CreditCard, hint: "Revolving credit" },
  { id: "wallet", label: "Digital Wallet / UPI", icon: Smartphone, hint: "Paytm, PhonePe…" },
  { id: "cash", label: "Cash", icon: Banknote, hint: "Physical in hand" },
  { id: "investment", label: "Investment / Demat", icon: TrendingUp, hint: "MF, Stocks" },
  { id: "other", label: "Other Asset", icon: Shield, hint: "Custom bucket" },
];

const COLORS = [
  { id: "emerald", label: "Deep Emerald", from: "#0f3a2d", to: "#1f8a5f" },
  { id: "navy", label: "Midnight Navy", from: "#0b1530", to: "#1e3a8a" },
  { id: "copper", label: "Brushed Copper", from: "#3a1f10", to: "#b87333" },
  { id: "violet", label: "Matte Violet", from: "#2a1648", to: "#7c3aed" },
  { id: "crimson", label: "Crimson", from: "#3a0a15", to: "#b91c4b" },
  { id: "charcoal", label: "Charcoal", from: "#0c0c0e", to: "#3a3a44" },
] as const;

type ColorId = (typeof COLORS)[number]["id"];

const ICONS: { id: string; icon: LucideIcon }[] = [
  { id: "wallet", icon: Wallet },
  { id: "landmark", icon: Landmark },
  { id: "card", icon: CreditCard },
  { id: "coins", icon: Coins },
  { id: "trend", icon: TrendingUp },
  { id: "shield", icon: Shield },
];

const DEFAULT_PURPOSES = [
  "Home Expenses",
  "Financial Goals",
  "Emergency Fund",
  "Domestic Investment",
  "Global Investment",
];

const BANKS = [
  "HDFC Bank",
  "ICICI Bank",
  "State Bank of India",
  "Axis Bank",
  "Kotak Mahindra",
  "Yes Bank",
  "IDFC First",
  "Other",
];

type FormState = {
  type: AccountType;
  name: string;
  holder: string;
  bank: string;
  bankCustom: string;
  last4: string;
  expMonth: string;
  expYear: string;
  branch: string;
  openingBalance: string;
  openingDate: Date | undefined;
  color: ColorId;
  icon: string;
  purposes: string[];
  collaborators: Collaborator[];
  dateLockEnabled: boolean;
  lockStart: Date | undefined;
  lockEnd: Date | undefined;
};

export type CollaboratorRole = "admin" | "viewer";
export type Collaborator = {
  id: string;
  name: string;
  email: string;
  role: CollaboratorRole;
  menuAccess: string[];
};

export const ACCESS_MENUS: { id: string; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
  { id: "investments", label: "Investments" },
  { id: "budget", label: "Budget" },
  { id: "goals", label: "Goals" },
  { id: "reminders", label: "Reminders" },
  { id: "calculator", label: "Calculator" },
  { id: "bill-scan", label: "Bill Scan" },
  { id: "import", label: "Import" },
];
const ALL_MENU_IDS = ACCESS_MENUS.map((m) => m.id);

const emptyForm = (): FormState => ({
  type: "bank",
  name: "",
  holder: "",
  bank: "",
  bankCustom: "",
  last4: "",
  expMonth: "",
  expYear: "",
  branch: "",
  openingBalance: "",
  openingDate: undefined,
  color: "emerald",
  icon: "wallet",
  purposes: [],
  collaborators: [],
  dateLockEnabled: false,
  lockStart: undefined,
  lockEnd: undefined,
});

type SavedAccount = FormState & { id: string };

function colorStyle(id: ColorId): React.CSSProperties {
  const c = COLORS.find((x) => x.id === id)!;
  return { background: `linear-gradient(135deg, ${c.from}, ${c.to})` };
}

function AccountPreviewCard({ form }: { form: FormState }) {
  const IconComp = ICONS.find((i) => i.id === form.icon)?.icon ?? Wallet;
  const bank = form.bank === "Other" ? form.bankCustom : form.bank;
  const showCard = form.type === "debit" || form.type === "credit";
  const balance = form.openingBalance ? Number(form.openingBalance) : 0;
  return (
    <div
      className="relative aspect-[1.6/1] w-full max-w-md rounded-2xl p-5 text-white shadow-xl overflow-hidden"
      style={colorStyle(form.color)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
            <IconComp className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-70">
              {ACCOUNT_TYPES.find((t) => t.id === form.type)?.label}
            </div>
            <div className="text-sm font-medium">{form.name || "Account Name"}</div>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest opacity-80">
          {bank || "BANK NAME"}
        </div>
      </div>

      <div className="relative mt-6">
        <div className="text-[10px] uppercase tracking-widest opacity-70">Balance</div>
        <div className="text-2xl font-semibold tracking-tight">
          ₹{balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </div>
      </div>

      <div className="relative mt-4 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest opacity-70">
            {showCard ? "Card Number" : "Account"}
          </div>
          <div className="font-mono text-base tracking-[0.25em]">
            •••• {form.last4.padEnd(4, "0").slice(0, 4) || "0000"}
          </div>
        </div>
        {showCard && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest opacity-70">Expires</div>
            <div className="font-mono text-sm">
              {(form.expMonth || "MM").padStart(2, "0")}/{(form.expYear || "YY").slice(-2)}
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-3 text-[11px] opacity-80 truncate">
        {form.holder || "CARDHOLDER NAME"}
      </div>
    </div>
  );
}

export default function AccountsManager() {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [purposeOptions, setPurposeOptions] = useState<string[]>(DEFAULT_PURPOSES);
  const [adding, setAdding] = useState(false);
  const [newPurpose, setNewPurpose] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("viewer");

  const addCollaborator = () => {
    const name = inviteName.trim();
    const email = inviteEmail.trim();
    if (!name || !email) {
      toast.error("Enter name and email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Invalid email address");
      return;
    }
    if (form.collaborators.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
      toast.error("This email is already a collaborator");
      return;
    }
    setForm((f) => ({
      ...f,
      collaborators: [
        ...f.collaborators,
        { id: crypto.randomUUID(), name, email, role: inviteRole, menuAccess: [...ALL_MENU_IDS] },
      ],
    }));
    setInviteName("");
    setInviteEmail("");
    setInviteRole("viewer");
    toast.success(`Invited ${name} as ${inviteRole}`);
  };

  const removeCollaborator = (id: string) =>
    setForm((f) => ({ ...f, collaborators: f.collaborators.filter((c) => c.id !== id) }));

  const updateCollaboratorRole = (id: string, role: CollaboratorRole) =>
    setForm((f) => ({
      ...f,
      collaborators: f.collaborators.map((c) => (c.id === id ? { ...c, role } : c)),
    }));

  const toggleCollaboratorMenu = (id: string, menuId: string) =>
    setForm((f) => ({
      ...f,
      collaborators: f.collaborators.map((c) =>
        c.id === id
          ? {
              ...c,
              menuAccess: c.menuAccess.includes(menuId)
                ? c.menuAccess.filter((m) => m !== menuId)
                : [...c.menuAccess, menuId],
            }
          : c,
      ),
    }));

  const setCollaboratorMenuAll = (id: string, all: boolean) =>
    setForm((f) => ({
      ...f,
      collaborators: f.collaborators.map((c) =>
        c.id === id ? { ...c, menuAccess: all ? [...ALL_MENU_IDS] : [] } : c,
      ),
    }));

  const lockInvalid =
    form.dateLockEnabled &&
    form.lockStart &&
    form.lockEnd &&
    form.lockStart > form.lockEnd;

  const addPurpose = () => {
    const v = newPurpose.trim();
    if (!v) return;
    if (purposeOptions.some((p) => p.toLowerCase() === v.toLowerCase())) {
      toast.error("Purpose already exists");
      return;
    }
    setPurposeOptions((p) => [...p, v]);
    setNewPurpose("");
    setAdding(false);
    toast.success("Purpose added");
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
    if (purposeOptions.some((p) => p.toLowerCase() === v.toLowerCase() && p !== editing)) {
      toast.error("Purpose already exists");
      return;
    }
    setPurposeOptions((opts) => opts.map((x) => (x === editing ? v : x)));
    setForm((f) => ({
      ...f,
      purposes: f.purposes.map((x) => (x === editing ? v : x)),
    }));
    setAccounts((a) =>
      a.map((acc) => ({
        ...acc,
        purposes: acc.purposes.map((x) => (x === editing ? v : x)),
      })),
    );
    setEditing(null);
  };

  const deletePurpose = (p: string) => {
    setPurposeOptions((opts) => opts.filter((x) => x !== p));
    setForm((f) => ({ ...f, purposes: f.purposes.filter((x) => x !== p) }));
    setAccounts((a) =>
      a.map((acc) => ({ ...acc, purposes: acc.purposes.filter((x) => x !== p) })),
    );
    toast.success("Purpose removed");
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const togglePurpose = (p: string) =>
    setForm((f) => ({
      ...f,
      purposes: f.purposes.includes(p)
        ? f.purposes.filter((x) => x !== p)
        : [...f.purposes, p],
    }));

  const isCard = form.type === "debit" || form.type === "credit";
  const isAccountLike = form.type === "bank" || form.type === "investment";
  const isSimple = form.type === "cash" || form.type === "wallet" || form.type === "other";

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => String(y + i).slice(-2));
  }, []);

  const save = () => {
    if (!form.name.trim()) {
      toast.error("Please enter an account name");
      return;
    }
    if (form.dateLockEnabled) {
      if (!form.lockStart || !form.lockEnd) {
        toast.error("Pick both start and end dates for the work window");
        return;
      }
      if (form.lockStart > form.lockEnd) {
        toast.error("Start date must be before end date");
        return;
      }
    }
    if (editingAccountId) {
      setAccounts((a) =>
        a.map((x) => (x.id === editingAccountId ? { ...form, id: editingAccountId } : x)),
      );
      toast.success("Account updated");
      setEditingAccountId(null);
    } else {
      setAccounts((a) => [...a, { ...form, id: crypto.randomUUID() }]);
      toast.success("Account added");
    }
    setForm(emptyForm());
  };

  const remove = (id: string) => {
    setAccounts((a) => a.filter((x) => x.id !== id));
    if (editingAccountId === id) {
      setEditingAccountId(null);
      setForm(emptyForm());
    }
  };

  const startEditAccount = (acc: SavedAccount) => {
    const { id, ...rest } = acc;
    setForm(rest);
    setEditingAccountId(id);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const cancelEditAccount = () => {
    setEditingAccountId(null);
    setForm(emptyForm());
  };

  return (
    <div className="space-y-6 px-5 sm:px-8 lg:px-12 mx-auto">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Accounts & Wallets</h1>
        <p className="text-sm text-muted-foreground">
          Add and track all your financial storage buckets in one place.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-6">
        {/* LEFT: Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingAccountId ? "Edit Account" : "New Account"}
            </CardTitle>
            <CardDescription>
              {editingAccountId
                ? "Update the details below and save your changes."
                : "Configure the account details below."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Type selector */}
            <div className="space-y-2">
              <Label>Account Type</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {ACCOUNT_TYPES.map((t) => {
                  const Active = form.type === t.id;
                  const I = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => set("type", t.id)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all",
                        Active
                          ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                          : "border-border/60 hover:border-border bg-card/40"
                      )}
                    >
                      <I className="h-4 w-4 mb-1.5 text-primary" />
                      <div className="text-xs font-medium">{t.label}</div>
                      <div className="text-[10px] text-muted-foreground">{t.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Account Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={isSimple ? "Wallet Name" : "e.g. Primary Savings"}
                />
              </div>

              {(isCard || isAccountLike) && (
                <>
                  <div className="space-y-1.5">
                    <Label>{isCard ? "Cardholder Name" : "Account Holder"}</Label>
                    <Input
                      value={form.holder}
                      onChange={(e) => set("holder", e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{form.type === "investment" ? "Platform" : "Bank Name"}</Label>
                    <Select value={form.bank} onValueChange={(v) => set("bank", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {BANKS.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.bank === "Other" && (
                      <Input
                        className="mt-2"
                        value={form.bankCustom}
                        onChange={(e) => set("bankCustom", e.target.value)}
                        placeholder="Enter name"
                      />
                    )}
                  </div>
                </>
              )}

              {isCard && (
                <>
                  <div className="space-y-1.5">
                    <Label>Last 4 Digits</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={form.last4}
                      onChange={(e) =>
                        set("last4", e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="0000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expiry (MM/YY)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={form.expMonth} onValueChange={(v) => set("expMonth", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="MM" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) =>
                            String(i + 1).padStart(2, "0")
                          ).map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={form.expYear} onValueChange={(v) => set("expYear", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="YY" />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((y) => (
                            <SelectItem key={y} value={y}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {isAccountLike && (
                <>
                  <div className="space-y-1.5">
                    <Label>Account Number (Last 4)</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={form.last4}
                      onChange={(e) =>
                        set("last4", e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="0000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{form.type === "investment" ? "Platform Name" : "Branch"}</Label>
                    <Input
                      value={form.branch}
                      onChange={(e) => set("branch", e.target.value)}
                      placeholder={form.type === "investment" ? "Zerodha, Groww…" : "Branch / IFSC"}
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Opening Balance</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.openingBalance}
                  onChange={(e) => set("openingBalance", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Opening Balance Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !form.openingDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.openingDate ? format(form.openingDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.openingDate}
                      onSelect={(d) => set("openingDate", d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label>Color Tag</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set("color", c.id)}
                    title={c.label}
                    className={cn(
                      "h-9 w-9 rounded-full border-2 transition-all flex items-center justify-center",
                      form.color === c.id
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    )}
                    style={colorStyle(c.id)}
                  >
                    {form.color === c.id && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon */}
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(({ id, icon: I }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => set("icon", id)}
                    className={cn(
                      "h-10 w-10 rounded-lg border flex items-center justify-center transition-all",
                      form.icon === id
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 hover:border-border text-muted-foreground"
                    )}
                  >
                    <I className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Purposes */}
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
                {purposeOptions.map((p) => {
                  const checked = form.purposes.includes(p);
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
                      onClick={() => togglePurpose(p)}
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
                            deletePurpose(p);
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
                {purposeOptions.length === 0 && !adding && (
                  <p className="text-xs text-muted-foreground">
                    No purposes yet. Add one to tag your accounts.
                  </p>
                )}
              </div>
            </div>

            {/* Account Share & Permissions Center */}
            <div className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
              <button
                type="button"
                onClick={() => setShareOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium">Account Share & Permissions Center</div>
                    <div className="text-[11px] text-muted-foreground">
                      {form.collaborators.length} collaborator
                      {form.collaborators.length === 1 ? "" : "s"}
                      {form.dateLockEnabled ? " · Date-lock active" : ""}
                    </div>
                  </div>
                </div>
                {shareOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {shareOpen && (
                <div className="border-t border-border/60 p-4 space-y-5 animate-fade-in">
                  {/* Invite member */}
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Invite Member
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px_auto] gap-2">
                      <Input
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="Collaborator name"
                      />
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="email@domain.com"
                          className="pl-8"
                        />
                      </div>
                      <Select
                        value={inviteRole}
                        onValueChange={(v) => setInviteRole(v as CollaboratorRole)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            <span className="inline-flex items-center gap-2">
                              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Admin
                            </span>
                          </SelectItem>
                          <SelectItem value="viewer">
                            <span className="inline-flex items-center gap-2">
                              <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Viewer
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="button" onClick={addCollaborator}>
                        <Plus className="h-4 w-4" /> Invite
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Admins can edit & log transactions. Viewers can only see balances.
                    </p>
                  </div>

                  {/* Collaborator list */}
                  {form.collaborators.length > 0 && (
                    <div className="space-y-2">
                      {form.collaborators.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-2.5"
                        >
                          <div
                            className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold",
                              c.role === "admin"
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{c.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {c.email}
                            </div>
                          </div>
                          <Select
                            value={c.role}
                            onValueChange={(v) =>
                              updateCollaboratorRole(c.id, v as CollaboratorRole)
                            }
                          >
                            <SelectTrigger className="h-8 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Menu Access</span>
                                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                  {c.menuAccess.length}/{ALL_MENU_IDS.length}
                                </Badge>
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-64 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-medium">
                                  Menus accessible to {c.name.split(" ")[0]}
                                </div>
                              </div>
                              <div className="flex items-center justify-between mb-2 gap-2">
                                <button
                                  type="button"
                                  className="text-[11px] text-primary hover:underline"
                                  onClick={() => setCollaboratorMenuAll(c.id, true)}
                                >
                                  Select all
                                </button>
                                <button
                                  type="button"
                                  className="text-[11px] text-muted-foreground hover:underline"
                                  onClick={() => setCollaboratorMenuAll(c.id, false)}
                                >
                                  Clear
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-auto">
                                {ACCESS_MENUS.map((m) => {
                                  const checked = c.menuAccess.includes(m.id);
                                  return (
                                    <label
                                      key={m.id}
                                      className={cn(
                                        "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer transition-colors",
                                        checked
                                          ? "border-primary/60 bg-primary/10 text-primary"
                                          : "border-border/60 hover:border-border",
                                      )}
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={() => toggleCollaboratorMenu(c.id, m.id)}
                                      />
                                      <span className="truncate">{m.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <p className="mt-2 text-[10px] text-muted-foreground">
                                Controls which sidebar menus this collaborator can open for this account.
                              </p>
                            </PopoverContent>
                          </Popover>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeCollaborator(c.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Date lock window */}
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-primary" />
                        <div>
                          <div className="text-sm font-medium">
                            Enforce Date-Restricted Work Window
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Block transactions outside the approved dates.
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={form.dateLockEnabled}
                        onCheckedChange={(v) => set("dateLockEnabled", v)}
                      />
                    </div>

                    {form.dateLockEnabled && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "justify-start text-left font-normal",
                                  !form.lockStart && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {form.lockStart ? format(form.lockStart, "PPP") : "Start date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={form.lockStart}
                                onSelect={(d) => set("lockStart", d)}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "justify-start text-left font-normal",
                                  !form.lockEnd && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {form.lockEnd ? format(form.lockEnd, "PPP") : "End date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={form.lockEnd}
                                onSelect={(d) => set("lockEnd", d)}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        {lockInvalid && (
                          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-2 text-xs">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>
                              This account ledger is locked for editing outside the specified
                              operational dates. Start date must be before end date.
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {editingAccountId ? (
                <>
                  <Button variant="outline" onClick={cancelEditAccount}>
                    Cancel
                  </Button>
                  <Button onClick={save}>
                    <Check className="h-4 w-4" /> Save Changes
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setForm(emptyForm())}>
                    Reset
                  </Button>
                  <Button onClick={save}>
                    <Plus className="h-4 w-4" /> Add Account
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Preview + Grid */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Live Preview</CardTitle>
              <CardDescription>Updates as you type.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <AccountPreviewCard form={form} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Accounts</CardTitle>
              <CardDescription>
                {accounts.length} active {accounts.length === 1 ? "account" : "accounts"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                  No accounts yet. Add one from the form to see it here.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {accounts.map((a) => {
                    const I = ICONS.find((i) => i.id === a.icon)?.icon ?? Wallet;
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg border bg-card/40 p-3 overflow-hidden transition-colors",
                          editingAccountId === a.id
                            ? "border-primary/60 ring-1 ring-primary/40"
                            : "border-border/60",
                        )}
                      >
                        <div
                          className="absolute left-0 top-0 h-full w-1.5"
                          style={colorStyle(a.color)}
                        />
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0 ml-2"
                          style={colorStyle(a.color)}
                        >
                          <I className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium truncate">{a.name}</div>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              •••• {a.last4 || "0000"}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {a.purposes.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground">
                                No purpose tags
                              </span>
                            ) : (
                              a.purposes.map((p) => (
                                <Badge key={p} variant="secondary" className="text-[10px]">
                                  {p}
                                </Badge>
                              ))
                            )}
                            {a.collaborators.map((c) => (
                              <Badge
                                key={c.id}
                                variant="outline"
                                className={cn(
                                  "text-[10px] gap-1",
                                  c.role === "admin"
                                    ? "border-primary/40 text-primary bg-primary/10"
                                    : "border-border/60 text-muted-foreground"
                                )}
                                title={`${c.email} · ${c.role}`}
                              >
                                <Users className="h-2.5 w-2.5" />
                                {c.role === "admin" ? "Co-Admin" : "Viewer"}: {c.name.split(" ")[0]}
                              </Badge>
                            ))}
                            {a.dateLockEnabled && a.lockStart && a.lockEnd && (
                              <Badge
                                variant="outline"
                                className="text-[10px] gap-1 border-amber-500/40 text-amber-400 bg-amber-500/10"
                                title={`Locked ${format(a.lockStart, "PP")} → ${format(a.lockEnd, "PP")}`}
                              >
                                <CalendarIcon className="h-2.5 w-2.5" />
                                {format(a.lockStart, "dd MMM")} – {format(a.lockEnd, "dd MMM")}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold tabular-nums">
                            ₹
                            {Number(a.openingBalance || 0).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </div>
                          <div className="mt-1 flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => startEditAccount(a)}
                              aria-label="Edit account"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => toast.message("Archived (mock)")}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => remove(a.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}