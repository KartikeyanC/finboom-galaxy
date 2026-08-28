import { describe, it, expect } from "vitest";
import {
  computeLiveBalances,
  deriveAccountDeltas,
  type BalanceTxn,
} from "./accountBalances";

/**
 * 🔴 THE MONEY INVARIANT: a tracker is a label, and a label cannot move money.
 *
 * This is the single promise the Trackers feature rests on — "your ₹40,00,000
 * stays in your accounts; creating T-Home Construction does not move it".
 * Today it holds for a structural reason rather than a defended one:
 * `BalanceTxn` (accountBalances.ts:22-29) is a narrow structural type that
 * does not mention `tracker_id`, and `deriveAccountDeltas` reads only
 * `account_id`, `transfer_to_account_id`, `type` and `amount`.
 *
 * That makes these tests look trivial, and that is exactly why they are worth
 * writing: they turn an accident of the current shape into a pinned
 * invariant, so the day somebody "helpfully" teaches balance derivation about
 * trackers, a test says no rather than a user's net worth quietly changing.
 */

const txn = (o: Partial<BalanceTxn> & Pick<BalanceTxn, "type" | "amount">): BalanceTxn => ({
  description: null,
  account_id: "cash",
  transfer_to_account_id: null,
  ...o,
});

/** The same rows, every one of them tagged to a tracker. */
const tagged = (rows: BalanceTxn[]) =>
  rows.map((r) => ({ ...r, tracker_id: "11111111-1111-1111-1111-111111111111" }));

describe("assigning a tracker never changes a balance", () => {
  const rows: BalanceTxn[] = [
    txn({ type: "expense", amount: 18600 }),
    txn({ type: "income", amount: 250000, account_id: "sbi" }),
    txn({ type: "transfer", amount: 5000, account_id: "sbi", transfer_to_account_id: "cash" }),
    txn({ type: "expense", amount: 12500, account_id: "hdfc" }),
  ];

  it("derives identical deltas with and without a tracker on every row", () => {
    expect(deriveAccountDeltas(tagged(rows))).toEqual(deriveAccountDeltas(rows));
  });

  it("derives identical live balances with and without a tracker", () => {
    const accounts = [
      { id: "cash", openingBalance: 4000000 },
      { id: "sbi", openingBalance: 100000 },
      { id: "hdfc", openingBalance: 50000 },
    ];
    expect(computeLiveBalances(accounts, tagged(rows))).toEqual(
      computeLiveBalances(accounts, rows),
    );
  });

  it("is unchanged when only SOME rows carry a tracker", () => {
    const mixed = rows.map((r, i) => (i % 2 === 0 ? { ...r, tracker_id: "abc" } : r));
    expect(deriveAccountDeltas(mixed)).toEqual(deriveAccountDeltas(rows));
  });

  it("is unchanged when the tracker is removed again", () => {
    const untagged = tagged(rows).map(({ ...r }) => ({ ...r, tracker_id: null }));
    expect(deriveAccountDeltas(untagged)).toEqual(deriveAccountDeltas(rows));
  });

  it("keeps the worked example from the spec honest", () => {
    // ₹40,00,000 in cash, one ₹18,600 labour expense tagged to the tracker.
    // Cash must read ₹39,81,400 — the tracker holds none of it.
    const accounts = [{ id: "cash", openingBalance: 4000000 }];
    const one = tagged([txn({ type: "expense", amount: 18600 })]);
    expect(computeLiveBalances(accounts, one).cash).toBe(4000000 - 18600);
  });
});
