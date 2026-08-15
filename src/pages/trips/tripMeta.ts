import {
  Banknote,
  CreditCard,
  Flag,
  Home,
  Landmark,
  Smartphone,
  User,
  Users,
  Wallet,
} from "lucide-react";
import {
  BUCKET_META,
  CASH_ACCOUNT_ID,
  type StoredAccount,
  type TripBucket,
} from "@/lib/accountsStore";
import type { TripKind } from "@/lib/tripsStore";

/**
 * Trip vocabulary — kinds, spend categories and the four payment buckets a
 * trip's costs are allocated across. Split out of Trips.tsx in Stage 4.13.
 *
 * `CASH_ACCOUNT` and `fallbackAccount` are here rather than in the page because
 * they exist to keep a trip renderable when the account behind an allocation
 * has been deleted — a data-shape concern, not a layout one.
 */

export const KIND_META: Record<TripKind, { label: string; icon: typeof User; tint: string }> = {
  solo: { label: "Solo Trip", icon: User, tint: "text-chart-2" },
  friends: { label: "Friends Trip", icon: Users, tint: "text-chart-4" },
  family: { label: "Family Trip", icon: Home, tint: "text-chart-3" },
  other: { label: "Other", icon: Flag, tint: "text-chart-5" },
};

export const CATEGORIES = ["Food", "Stay", "Travel", "Activity", "Shopping", "Other"];

export const BUCKET_ORDER: TripBucket[] = ["bank", "credit", "wallet", "cash"];
export const BUCKET_ICON: Record<TripBucket, typeof Wallet> = {
  bank: Landmark,
  credit: CreditCard,
  wallet: Smartphone,
  cash: Banknote,
};
export const BUCKET_ROW_TITLE: Record<TripBucket, string> = {
  bank: "🏦 Bank Accounts / Debit Cards",
  credit: "💳 Credit Cards",
  wallet: "📱 Digital Wallets & UPI Channels",
  cash: "💵 Physical Cash on Hand",
};

/** Build the virtual cash account (the only one in the cash bucket). */
export const CASH_ACCOUNT: StoredAccount = {
  id: CASH_ACCOUNT_ID,
  type: "cash",
  name: "Physical Cash",
  color: "copper",
  icon: "coins",
};

export function bucketGradient(b: TripBucket): React.CSSProperties {
  const g = BUCKET_META[b].gradient;
  return { background: `linear-gradient(135deg, ${g.from}, ${g.to})` };
}

/** Used when displaying expenses from legacy trips whose accountId no longer exists. */
export function fallbackAccount(id: string): StoredAccount {
  if (id === "_legacy_card")
    return { id, type: "credit", name: "Card (legacy)" };
  if (id === "_legacy_wallet")
    return { id, type: "wallet", name: "Wallet (legacy)" };
  if (id === CASH_ACCOUNT_ID) return CASH_ACCOUNT;
  return { id, type: "other", name: "Removed account" };
}
