import { describe, expect, it } from "vitest";
import {
  applyAccountDeltas,
  computeLiveBalances,
  deriveAccountDeltas,
  type BalanceTxn,
} from "./accountBalances";

/**
 * Stage 4.2. `dashboard_summary`'s `account_deltas` replaced a client-side
 * reduction over every transaction row. The risk in that swap is not that it
 * crashes — it is that a balance comes out quietly wrong.
 *
 * So the property that matters is PARITY: for any input, starting from
 * pre-summed deltas must land on exactly the same balances as reducing the raw
 * rows. `deriveAccountDeltas` models what the SQL does; if it and the old path
 * ever disagree, one of them has drifted.
 */

const accounts = [
  { id: "bank", openingBalance: 100000 },
  { id: "wallet", openingBalance: 5000 },
  { id: "fresh" }, // no opening balance at all
];

const tx = (o: Partial<BalanceTxn> & Pick<BalanceTxn, "type" | "amount">): BalanceTxn => ({
  description: null,
  account_id: null,
  transfer_to_account_id: null,
  ...o,
});

/** Both paths must agree, and the assertion names the scenario that broke. */
function expectParity(txns: BalanceTxn[]) {
  const viaRows = computeLiveBalances(accounts, txns);
  const viaDeltas = applyAccountDeltas(accounts, deriveAccountDeltas(txns));
  expect(viaDeltas).toEqual(viaRows);
  return viaRows;
}

describe("account deltas ↔ full reduction parity", () => {
  it("agrees on income and expense", () => {
    const b = expectParity([
      tx({ type: "income", amount: 40000, account_id: "bank" }),
      tx({ type: "expense", amount: 2500, account_id: "wallet" }),
    ]);
    expect(b.bank).toBe(140000);
    expect(b.wallet).toBe(2500);
  });

  it("agrees on a transfer moving both legs", () => {
    const b = expectParity([
      tx({ type: "transfer", amount: 20000, account_id: "bank", transfer_to_account_id: "wallet" }),
    ]);
    expect(b.bank).toBe(80000);
    expect(b.wallet).toBe(25000);
    // The point of the feature: a transfer must not change net worth.
    expect(b.bank + b.wallet).toBe(105000);
  });

  it("agrees when a transfer's other side no longer exists", () => {
    const b = expectParity([
      tx({ type: "transfer", amount: 1000, account_id: "bank", transfer_to_account_id: "deleted" }),
      tx({ type: "transfer", amount: 500, account_id: "deleted", transfer_to_account_id: "wallet" }),
    ]);
    expect(b.bank).toBe(99000);
    expect(b.wallet).toBe(5500);
    expect(b).not.toHaveProperty("deleted");
  });

  it("agrees on the legacy [Mode|accountId] description prefix", () => {
    const b = expectParity([
      tx({ type: "expense", amount: 300, description: "[UPI|wallet] chai" }),
      tx({ type: "income", amount: 700, description: "[Cash|bank] refund" }),
    ]);
    expect(b.wallet).toBe(4700);
    expect(b.bank).toBe(100700);
  });

  it("agrees that the column wins over a stale prefix", () => {
    const b = expectParity([
      tx({ type: "expense", amount: 900, account_id: "bank", description: "[UPI|wallet] old tag" }),
    ]);
    expect(b.bank).toBe(99100);
    expect(b.wallet).toBe(5000);
  });

  it("agrees that a bracketed note is not an account tag", () => {
    const b = expectParity([tx({ type: "expense", amount: 1000, description: "[urgent] pay rent" })]);
    expect(b.bank).toBe(100000);
    expect(b.wallet).toBe(5000);
  });

  it("agrees on an account with no opening balance", () => {
    const b = expectParity([tx({ type: "income", amount: 250, account_id: "fresh" })]);
    expect(b.fresh).toBe(250);
  });

  it("agrees on an empty ledger", () => {
    const b = expectParity([]);
    expect(b).toEqual({ bank: 100000, wallet: 5000, fresh: 0 });
  });

  it("agrees across many mixed rows", () => {
    const txns: BalanceTxn[] = [];
    for (let i = 0; i < 200; i++) {
      const acct = i % 2 === 0 ? "bank" : "wallet";
      if (i % 5 === 0) {
        txns.push(tx({ type: "transfer", amount: i, account_id: acct, transfer_to_account_id: acct === "bank" ? "wallet" : "bank" }));
      } else if (i % 3 === 0) {
        txns.push(tx({ type: "income", amount: i * 2, account_id: acct }));
      } else {
        txns.push(tx({ type: "expense", amount: i, description: `[UPI|${acct}] row ${i}` }));
      }
    }
    expectParity(txns);
  });
});

describe("applyAccountDeltas", () => {
  it("ignores a delta for an account the client does not have", () => {
    const b = applyAccountDeltas(accounts, [
      { account_id: "bank", delta: -500 },
      { account_id: "ghost", delta: 999999 },
    ]);
    expect(b.bank).toBe(99500);
    expect(b).not.toHaveProperty("ghost");
  });

  it("falls back to opening balances when the summary has not arrived", () => {
    expect(applyAccountDeltas(accounts, undefined)).toEqual({
      bank: 100000,
      wallet: 5000,
      fresh: 0,
    });
  });
});
