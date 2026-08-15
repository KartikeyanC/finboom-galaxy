import { findGroupForSub } from "@/lib/expenseSubcategories";
import { parseSplit } from "@/lib/splitMeta";
import type { Transaction, TxnType } from "@/hooks/useTransactions";

/**
 * Recovering a transaction's form values from a stored row — split out of
 * TransactionDialog.tsx in Stage 4.13.
 *
 * This is the most fragile thirty lines in the dialog. A stored description
 * may carry, in order: split metadata, a legacy `[Mode|accountId]` prefix, and
 * a `Sub · note` subcategory prefix — three encodings layered on one string by
 * three different features. Getting the unwrapping wrong is exactly how
 * BUG-088 moved money: the edit path silently dropped the account link and the
 * transaction fell out of its account's balance.
 *
 * It is pure, so it is now tested (transactionFormState.test.ts) instead of
 * only being reachable by opening a dialog.
 */

export type TransactionFormValues = {
  activeType: TxnType;
  amount: string;
  currency: string;
  category: string;
  subcategory: string | null;
  description: string;
  paymentMode: string;
  linkedAccountId: string;
  occurredAt: string;
};

/** Matches the legacy `[Mode]` / `[Mode|accountId]` description prefix. */
const PAYMENT_PREFIX_RE = /^\[([^\]|]+)(?:\|([^\]]*))?\] /;

export function hydrateFromTransaction(initial: Transaction): TransactionFormValues {
  // Strip the split metadata first — it wraps everything else.
  const { clean: descClean } = parseSplit(initial.description);

  // Stage 3.4: prefer the real columns. The `[Mode|accountId]` prefix is only
  // still parsed for rows an older client wrote after the backfill.
  const pmMatch = descClean.match(PAYMENT_PREFIX_RE);
  const desc = pmMatch ? descClean.slice(pmMatch[0].length) : descClean;

  // A leading "Sub · " is a subcategory only if it names a real one; otherwise
  // it is just the user's own words and must survive untouched.
  const sepIdx = desc.indexOf(" · ");
  const candidate = sepIdx > -1 ? desc.slice(0, sepIdx) : desc;
  const isSub = Boolean(candidate) && Boolean(findGroupForSub(candidate));

  return {
    activeType: initial.type,
    amount: String(initial.amount),
    currency: initial.currency,
    category: initial.category,
    subcategory: isSub ? candidate : null,
    description: isSub ? (sepIdx > -1 ? desc.slice(sepIdx + 3) : "") : desc,
    paymentMode: initial.payment_mode ?? pmMatch?.[1] ?? "UPI",
    linkedAccountId: initial.account_id ?? pmMatch?.[2] ?? "none",
    occurredAt: new Date(initial.occurred_at).toISOString(),
  };
}

/**
 * Compose the description that gets stored: `Sub · note`, or whichever half
 * exists. Expenses are the only type that carries a subcategory.
 */
export function composeDescription(
  type: TxnType,
  subcategory: string | null,
  description: string,
) {
  if (type === "expense" && subcategory) {
    return description ? `${subcategory} · ${description}` : subcategory;
  }
  return description || "";
}

/** The repayment length in months: a preset chip, or the custom dropdown when the chip is "Custom" (0). */
export const resolvedDuration = (preset: number, custom: string) =>
  preset > 0 ? preset : Number(custom);
