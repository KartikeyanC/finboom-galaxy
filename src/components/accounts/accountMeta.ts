import {
  Banknote,
  Coins,
  CreditCard,
  Landmark,
  Shield,
  Smartphone,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { StoredAccount, AccountType as StoreAccountType } from "@/lib/accountsStore";

/**
 * Account vocabulary and the form ⇄ store mapping, lifted out of
 * AccountsManager in Stage 4.13.
 *
 * Two different reasons for the split. The catalogues below are inert data that
 * only made the component longer. The mappers are the opposite — they are the
 * one place a saved account's fields can silently go missing, and they were
 * buried a thousand lines into a component where nothing could reach them.
 * Out here they are covered by `accountMeta.test.ts`.
 */

export type AccountType =
  | "bank"
  | "debit"
  | "credit"
  | "wallet"
  | "cash"
  | "investment"
  | "other";

export const ACCOUNT_TYPES: { id: AccountType; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "bank", label: "Bank Account", icon: Landmark, hint: "Savings / Current" },
  { id: "debit", label: "Debit Card", icon: CreditCard, hint: "Linked to bank" },
  { id: "credit", label: "Credit Card", icon: CreditCard, hint: "Revolving credit" },
  { id: "wallet", label: "Digital Wallet / UPI", icon: Smartphone, hint: "Paytm, PhonePe…" },
  { id: "cash", label: "Cash", icon: Banknote, hint: "Physical in hand" },
  { id: "investment", label: "Investment / Demat", icon: TrendingUp, hint: "MF, Stocks" },
  { id: "other", label: "Other Asset", icon: Shield, hint: "Custom bucket" },
];

export const COLORS = [
  { id: "emerald", label: "Deep Emerald", from: "#0f3a2d", to: "#1f8a5f" },
  { id: "navy", label: "Midnight Navy", from: "#0b1530", to: "#1e3a8a" },
  { id: "copper", label: "Brushed Copper", from: "#3a1f10", to: "#b87333" },
  { id: "violet", label: "Matte Violet", from: "#2a1648", to: "#7c3aed" },
  { id: "crimson", label: "Crimson", from: "#3a0a15", to: "#b91c4b" },
  { id: "charcoal", label: "Charcoal", from: "#0c0c0e", to: "#3a3a44" },
] as const;

export type ColorId = (typeof COLORS)[number]["id"];

export const ICONS: { id: string; icon: LucideIcon }[] = [
  { id: "wallet", icon: Wallet },
  { id: "landmark", icon: Landmark },
  { id: "card", icon: CreditCard },
  { id: "coins", icon: Coins },
  { id: "trend", icon: TrendingUp },
  { id: "shield", icon: Shield },
];

export const DEFAULT_PURPOSES = [
  "Home Expenses",
  "Financial Goals",
  "Emergency Fund",
  "Domestic Investment",
  "Global Investment",
];

export const BANKS = [
  "HDFC Bank",
  "ICICI Bank",
  "State Bank of India",
  "Axis Bank",
  "Kotak Mahindra",
  "Yes Bank",
  "IDFC First",
  "Other",
];

export type FormState = {
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
};

export const emptyForm = (): FormState => ({
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
});

export type SavedAccount = FormState & { id: string };

export function colorStyle(id: ColorId): React.CSSProperties {
  const c = COLORS.find((x) => x.id === id)!;
  return { background: `linear-gradient(135deg, ${c.from}, ${c.to})` };
}

/**
 * Store row → form. Every optional column falls back to "" rather than
 * undefined, because a controlled input handed `undefined` switches to
 * uncontrolled and React warns once, then silently stops tracking the field.
 */
export function fromStored(s: StoredAccount): SavedAccount {
  return {
    id: s.id,
    type: s.type as AccountType,
    name: s.name ?? "",
    holder: s.holder ?? "",
    bank: s.bank ?? "",
    bankCustom: s.bankCustom ?? "",
    last4: s.last4 ?? "",
    expMonth: s.expMonth ?? "",
    expYear: s.expYear ?? "",
    branch: s.branch ?? "",
    openingBalance: s.openingBalance ?? "",
    openingDate: s.openingDateISO ? new Date(s.openingDateISO) : undefined,
    color: (s.color as ColorId) ?? "emerald",
    icon: s.icon ?? "wallet",
    purposes: s.purposes ?? [],
  };
}

/** Form → store row. The date is the only field that changes shape. */
export function toStored(a: SavedAccount): StoredAccount {
  return {
    id: a.id,
    type: a.type as StoreAccountType,
    name: a.name,
    holder: a.holder,
    bank: a.bank,
    bankCustom: a.bankCustom,
    last4: a.last4,
    expMonth: a.expMonth,
    expYear: a.expYear,
    branch: a.branch,
    openingBalance: a.openingBalance,
    openingDateISO: a.openingDate ? a.openingDate.toISOString() : undefined,
    color: a.color,
    icon: a.icon,
    purposes: a.purposes,
  };
}
