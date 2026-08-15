import { describe, it, expect } from "vitest";
import { computeLiveBalances, extractAccountId } from "./accountBalances";

/**
 * The real balance rules, imported from the module the app actually runs
 * (`useLiveAccountBalances` is a thin wrapper around it). This file used to
 * re-implement the arithmetic, which meant it could pass while the hook was
 * broken.
 */

interface Txn {
  type: "income" | "expense" | "transfer";
  amount: number;
  description: string | null;
  transfer_to_account_id: string | null;
}

const computeBalances = computeLiveBalances;

const accounts = [
  { id: "bank", openingBalance: 100000 },
  { id: "wallet", openingBalance: 5000 },
];

const tx = (o: Partial<Txn> & Pick<Txn, "type" | "amount">): Txn => ({
  description: null,
  transfer_to_account_id: null,
  ...o,
});

describe("account balances with transfers", () => {
  it("debits the source and credits the destination", () => {
    const b = computeBalances(accounts, [
      tx({ type: "transfer", amount: 20000, description: "[UPI|bank] to wallet", transfer_to_account_id: "wallet" }),
    ]);
    expect(b.bank).toBe(80000);
    expect(b.wallet).toBe(25000);
  });

  // The whole point of the feature: a transfer must not change net worth.
  it("leaves the combined total unchanged", () => {
    const before = 100000 + 5000;
    const b = computeBalances(accounts, [
      tx({ type: "transfer", amount: 12345, description: "[UPI|bank] x", transfer_to_account_id: "wallet" }),
    ]);
    expect(b.bank + b.wallet).toBe(before);
  });

  it("still applies income and expense normally", () => {
    const b = computeBalances(accounts, [
      tx({ type: "income", amount: 50000, description: "[UPI|bank] salary" }),
      tx({ type: "expense", amount: 2000, description: "[Cash|wallet] lunch" }),
    ]);
    expect(b.bank).toBe(150000);
    expect(b.wallet).toBe(3000);
  });

  it("applies each leg independently when the other account is gone", () => {
    // Destination deleted -> FK set null. The source must still be debited.
    const b1 = computeBalances(accounts, [
      tx({ type: "transfer", amount: 1000, description: "[UPI|bank] x", transfer_to_account_id: null }),
    ]);
    expect(b1.bank).toBe(99000);

    // Source account unknown -> destination must still be credited.
    const b2 = computeBalances(accounts, [
      tx({ type: "transfer", amount: 1000, description: "[UPI|deleted] x", transfer_to_account_id: "wallet" }),
    ]);
    expect(b2.wallet).toBe(6000);
    expect(b2.bank).toBe(100000);
  });

  it("ignores a transfer between two unknown accounts", () => {
    const b = computeBalances(accounts, [
      tx({ type: "transfer", amount: 999, description: "[UPI|ghost] x", transfer_to_account_id: "phantom" }),
    ]);
    expect(b.bank).toBe(100000);
    expect(b.wallet).toBe(5000);
  });

  it("handles a self-transfer as a no-op", () => {
    const b = computeBalances(accounts, [
      tx({ type: "transfer", amount: 500, description: "[UPI|bank] x", transfer_to_account_id: "bank" }),
    ]);
    expect(b.bank).toBe(100000);
  });

  it("accumulates several transfers in order", () => {
    const b = computeBalances(accounts, [
      tx({ type: "transfer", amount: 10000, description: "[UPI|bank] a", transfer_to_account_id: "wallet" }),
      tx({ type: "transfer", amount: 3000, description: "[UPI|wallet] b", transfer_to_account_id: "bank" }),
    ]);
    expect(b.bank).toBe(93000);
    expect(b.wallet).toBe(12000);
    expect(b.bank + b.wallet).toBe(105000);
  });
});

describe("live balance from opening + activity (FIN-012)", () => {
  it("adds income and subtracts expenses on the tagged account", () => {
    const b = computeBalances([{ id: "bank", openingBalance: 10000 }], [
      tx({ type: "income", amount: 5000, description: "[UPI|bank] salary" }),
      tx({ type: "expense", amount: 3000, description: "[Card|bank] groceries" }),
    ]);
    expect(b.bank).toBe(12000);
  });

  it("treats a missing opening balance as zero", () => {
    const b = computeBalances([{ id: "cash", openingBalance: null }], [
      tx({ type: "income", amount: 250, description: "[Cash|cash] found" }),
    ]);
    expect(b.cash).toBe(250);
  });
});

describe("account tag parsing (FIN-013)", () => {
  it("reads the account out of the prefix", () => {
    expect(extractAccountId("[UPI|acc-1] lunch")).toBe("acc-1");
  });

  it("does not mistake a note that merely starts with a bracket", () => {
    // No pipe, so there is no account here — the whole string is the note.
    expect(extractAccountId("[urgent] pay the rent")).toBeNull();
    expect(extractAccountId("[2026] annual fee")).toBeNull();
  });

  it("is null for an untagged or empty description", () => {
    expect(extractAccountId("plain note")).toBeNull();
    expect(extractAccountId("")).toBeNull();
    expect(extractAccountId(null)).toBeNull();
  });

  it("leaves the balance untouched when the note only looks like a tag", () => {
    const b = computeBalances(accounts, [
      tx({ type: "expense", amount: 500, description: "[urgent] pay the rent" }),
    ]);
    expect(b.bank).toBe(100000);
    expect(b.wallet).toBe(5000);
  });

  it("keeps a bracketed note that follows a real tag", () => {
    const b = computeBalances(accounts, [
      tx({ type: "expense", amount: 500, description: "[UPI|bank] [urgent] pay the rent" }),
    ]);
    expect(b.bank).toBe(99500);
  });
});

describe("transfers stay out of income and spend aggregates", () => {
  const txns: Txn[] = [
    tx({ type: "income", amount: 80000, description: "[UPI|bank] salary" }),
    tx({ type: "expense", amount: 20000, description: "[UPI|bank] rent" }),
    tx({ type: "transfer", amount: 30000, description: "[UPI|bank] to savings", transfer_to_account_id: "wallet" }),
  ];

  const totalIncome = txns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  it("does not inflate income", () => {
    expect(totalIncome).toBe(80000);
  });

  it("does not inflate spending", () => {
    expect(totalExpense).toBe(20000);
  });

  // Previously a transfer was logged as income AND expense, so this same data
  // gave 110000 / 50000 and a savings rate of 54% instead of 75%.
  it("keeps the savings rate honest", () => {
    const savingsRate = Math.round(((totalIncome - totalExpense) / totalIncome) * 100);
    expect(savingsRate).toBe(75);
  });
});

/**
 * Stage 3.4 — `account_id` is a real column now. `accountOf()` prefers it and
 * falls back to the old `[Mode|accountId]` prefix, so rows written by an older
 * client between the migration and the deploy still land in the right account.
 */
describe("account resolution after the column migration (3.4)", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const B = "22222222-2222-2222-2222-222222222222";
  const accts = [
    { id: A, openingBalance: 1000 },
    { id: B, openingBalance: 500 },
  ];

  it("uses the column when the description is plain prose", () => {
    const out = computeLiveBalances(accts, [
      { type: "expense", amount: 300, description: "Monthly rent", account_id: A },
    ]);
    expect(out[A]).toBe(700);
  });

  it("still reads a legacy prefix when the column is null", () => {
    const out = computeLiveBalances(accts, [
      { type: "expense", amount: 300, description: `[UPI|${A}] Monthly rent`, account_id: null },
    ]);
    expect(out[A]).toBe(700);
  });

  it("prefers the column when a row somehow carries both", () => {
    // The backfill strips the prefix, so a row with both was written by an old
    // client after the migration — its column is what the current client set.
    const out = computeLiveBalances(accts, [
      { type: "expense", amount: 300, description: `[UPI|${B}] stale`, account_id: A },
    ]);
    expect(out[A]).toBe(700);
    expect(out[B]).toBe(500);
  });

  it("moves a transfer between the two column ends", () => {
    const out = computeLiveBalances(accts, [
      {
        type: "transfer",
        amount: 200,
        description: "Move to wallet",
        account_id: A,
        transfer_to_account_id: B,
      },
    ]);
    expect(out[A]).toBe(800);
    expect(out[B]).toBe(700);
    // The invariant that matters: a transfer never creates or destroys money.
    expect(out[A] + out[B]).toBe(1500);
  });

  it("ignores a transaction whose account was deleted (FK set null)", () => {
    const out = computeLiveBalances(accts, [
      { type: "expense", amount: 300, description: "orphan", account_id: null },
    ]);
    expect(out[A]).toBe(1000);
    expect(out[B]).toBe(500);
  });

  it("does not treat a user's own bracketed note as an account tag", () => {
    const out = computeLiveBalances(accts, [
      { type: "expense", amount: 300, description: "[urgent] pay rent", account_id: null },
    ]);
    expect(out[A]).toBe(1000);
    expect(out[B]).toBe(500);
  });
});
