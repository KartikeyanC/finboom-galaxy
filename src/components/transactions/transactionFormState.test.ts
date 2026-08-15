import { describe, expect, it } from "vitest";
import { encodeSplit } from "@/lib/splitMeta";
import type { Transaction } from "@/hooks/useTransactions";
import {
  composeDescription,
  hydrateFromTransaction,
  resolvedDuration,
} from "./transactionFormState";

/**
 * Stage 4.13. Opening a transaction for editing has to unwrap up to three
 * encodings layered on one description string, and pick the account link out
 * of either a real column or a legacy prefix. This is the code path BUG-088
 * broke — an edit that saved silently detached the transaction from its
 * account and moved that account's balance — so it is worth pinning.
 */

const txn = (p: Partial<Transaction>): Transaction => ({
  id: "t-1",
  type: "expense",
  amount: 250,
  currency: "INR",
  category: "Food & Dining",
  description: null,
  occurred_at: "2026-03-14T10:30:00.000Z",
  account_id: null,
  transfer_to_account_id: null,
  payment_mode: null,
  ...p,
} as Transaction);

describe("hydrateFromTransaction", () => {
  it("carries the plain fields across", () => {
    const f = hydrateFromTransaction(txn({ amount: 1234.5, currency: "USD", category: "Rent" }));
    expect(f.amount).toBe("1234.5");
    expect(f.currency).toBe("USD");
    expect(f.category).toBe("Rent");
    expect(f.activeType).toBe("expense");
  });

  it("prefers the real columns over the legacy description prefix", () => {
    // Stage 3.4 moved these into columns. A row that has both must trust the
    // column — the prefix is the stale copy.
    const f = hydrateFromTransaction(txn({
      description: "[Cash|old-account] Lunch",
      payment_mode: "UPI",
      account_id: "real-account",
    }));
    expect(f.paymentMode).toBe("UPI");
    expect(f.linkedAccountId).toBe("real-account");
    expect(f.description).toBe("Lunch");
  });

  it("falls back to the prefix for a pre-backfill row", () => {
    const f = hydrateFromTransaction(txn({ description: "[Card|acc-9] Lunch" }));
    expect(f.paymentMode).toBe("Card");
    expect(f.linkedAccountId).toBe("acc-9");
    expect(f.description).toBe("Lunch");
  });

  it("defaults to UPI and no account when the row says nothing", () => {
    const f = hydrateFromTransaction(txn({ description: "Lunch" }));
    expect(f.paymentMode).toBe("UPI");
    expect(f.linkedAccountId).toBe("none");
  });

  it("recovers a subcategory only when it names a real one", () => {
    const real = hydrateFromTransaction(txn({ description: "Outside Food · with Ravi" }));
    expect(real.subcategory).toBe("Outside Food");
    expect(real.description).toBe("with Ravi");

    // "Sent to mum" is not a subcategory, so the whole line stays the note.
    const notReal = hydrateFromTransaction(txn({ description: "Sent to mum · urgent" }));
    expect(notReal.subcategory).toBeNull();
    expect(notReal.description).toBe("Sent to mum · urgent");
  });

  it("keeps a bare subcategory with no note", () => {
    const f = hydrateFromTransaction(txn({ description: "Outside Food" }));
    expect(f.subcategory).toBe("Outside Food");
    expect(f.description).toBe("");
  });

  it("strips split metadata before anything else", () => {
    const description = encodeSplit({ mode: "owe", friend: "Rahul" }, "Outside Food · dinner");
    const f = hydrateFromTransaction(txn({ description }));
    expect(f.subcategory).toBe("Outside Food");
    expect(f.description).toBe("dinner");
  });

  it("unwraps split + payment prefix + subcategory together, in that order", () => {
    const description = encodeSplit({ mode: "paid_full", friend: "Ravi" }, "[Cash|acc-3] Outside Food · pizza");
    const f = hydrateFromTransaction(txn({ description }));
    expect(f.paymentMode).toBe("Cash");
    expect(f.linkedAccountId).toBe("acc-3");
    expect(f.subcategory).toBe("Outside Food");
    expect(f.description).toBe("pizza");
  });

  it("survives a null description", () => {
    const f = hydrateFromTransaction(txn({ description: null }));
    expect(f.description).toBe("");
    expect(f.subcategory).toBeNull();
  });

  it("normalises the timestamp to ISO", () => {
    const f = hydrateFromTransaction(txn({ occurred_at: "2026-03-14T10:30:00+05:30" }));
    expect(f.occurredAt).toBe("2026-03-14T05:00:00.000Z");
  });
});

describe("composeDescription", () => {
  it("joins subcategory and note for an expense", () => {
    expect(composeDescription("expense", "Outside Food", "pizza")).toBe("Outside Food · pizza");
  });

  it("keeps a bare subcategory when there is no note", () => {
    expect(composeDescription("expense", "Outside Food", "")).toBe("Outside Food");
  });

  it("ignores a subcategory on income — only expenses have them", () => {
    expect(composeDescription("income", "Outside Food", "March salary")).toBe("March salary");
  });

  it("returns an empty string when there is nothing to say", () => {
    expect(composeDescription("expense", null, "")).toBe("");
  });

  it("round-trips through hydrateFromTransaction", () => {
    const description = composeDescription("expense", "Outside Food", "pizza");
    const f = hydrateFromTransaction(txn({ description }));
    expect(f.subcategory).toBe("Outside Food");
    expect(f.description).toBe("pizza");
  });
});

describe("resolvedDuration", () => {
  it("uses the preset chip when one is selected", () => {
    expect(resolvedDuration(3, "12")).toBe(3);
  });

  it("falls back to the custom dropdown when the chip is Custom (0)", () => {
    expect(resolvedDuration(0, "12")).toBe(12);
  });
});
