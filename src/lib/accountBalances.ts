/**
 * Live account balances — the money rules, with no React or Supabase in sight
 * so they can be tested directly.
 *
 * Live balance = openingBalance
 *              + income linked to the account
 *              − expenses linked to the account
 *              − transfers out of it
 *              + transfers into it
 *
 * Transfers are the only type that touches two accounts: the source is
 * `account_id` and the destination `transfer_to_account_id`. Amounts are always
 * positive — direction is carried by which side of the move an account sits on,
 * never by a sign.
 *
 * Stage 3.4 replaced the `[Mode|accountId]` description prefix with the real
 * `account_id` column. `accountOf()` still falls back to parsing the prefix, so
 * a row written by an older client between the migration and the deploy is not
 * silently dropped out of its account's balance.
 */

export interface BalanceTxn {
  type: string;
  amount: number;
  description: string | null;
  /** Stage 3.4. Preferred over the description prefix. */
  account_id?: string | null;
  transfer_to_account_id?: string | null;
}

export interface BalanceAccount {
  id: string;
  /** Optional: an account created without one starts at zero. */
  openingBalance?: number | string | null;
}

/**
 * Account id out of a `[Mode|accountId]` description prefix.
 *
 * A note that merely starts with a bracket (`[urgent] pay rent`) has no `|`,
 * so it yields null rather than being mistaken for an account tag.
 */
export function extractAccountId(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const m = desc.match(/^\[([^\]|]+)\|([^\]]+)\]/);
  return m ? m[2] : null;
}

/**
 * Which account a transaction belongs to: the real column when it is set,
 * otherwise the legacy description prefix.
 *
 * The column wins even when both are present — the backfill strips the prefix,
 * so a row carrying both was written by an old client and its column is what a
 * current client just set.
 */
export function accountOf(txn: BalanceTxn): string | null {
  return txn.account_id ?? extractAccountId(txn.description);
}

/**
 * Net movement for one account, as returned by `dashboard_summary`.
 * Opening balances are not the server's to know — accounts are a client store.
 */
export interface AccountDelta {
  account_id: string;
  delta: number;
}

/**
 * Stage 4.2. The same arithmetic as `computeLiveBalances`, but starting from
 * per-account sums the server already computed instead of from every row.
 *
 * A delta for an account the client does not have is ignored, matching
 * `computeLiveBalances`, which only ever touches ids already in its map —
 * that is what keeps a transfer to a since-deleted account from inventing one.
 */
export function applyAccountDeltas(
  accounts: BalanceAccount[],
  deltas: AccountDelta[] | null | undefined,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const a of accounts) map[a.id] = Number(a.openingBalance || 0);

  for (const d of deltas ?? []) {
    if (!(d.account_id in map)) continue;
    map[d.account_id] += Number(d.delta) || 0;
  }
  return map;
}

/**
 * Derive the same deltas client-side. This exists so the SQL in
 * `dashboard_summary` can be held to the rules below by test rather than by
 * hope: `applyAccountDeltas(accts, deriveAccountDeltas(txns))` must equal
 * `computeLiveBalances(accts, txns)` for any input.
 */
export function deriveAccountDeltas(txns: BalanceTxn[]): AccountDelta[] {
  const sums = new Map<string, number>();
  const add = (id: string | null | undefined, v: number) => {
    if (!id) return;
    sums.set(id, (sums.get(id) ?? 0) + v);
  };

  for (const txn of txns) {
    const amount = Number(txn.amount) || 0;
    const accId = accountOf(txn);
    if (txn.type === "transfer") {
      add(accId, -amount);
      add(txn.transfer_to_account_id, amount);
    } else if (txn.type === "expense") {
      add(accId, -amount);
    } else if (txn.type === "income") {
      add(accId, amount);
    }
  }

  return Array.from(sums, ([account_id, delta]) => ({ account_id, delta }));
}

export function computeLiveBalances(
  accounts: BalanceAccount[],
  txns: BalanceTxn[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const a of accounts) map[a.id] = Number(a.openingBalance || 0);

  for (const txn of txns) {
    const amount = Number(txn.amount) || 0;
    const accId = accountOf(txn);

    if (txn.type === "transfer") {
      // Each leg is applied independently: a transfer to or from an account
      // that no longer exists still moves the surviving side correctly.
      if (accId && accId in map) map[accId] -= amount;
      const toId = txn.transfer_to_account_id;
      if (toId && toId in map) map[toId] += amount;
      continue;
    }

    if (!accId || !(accId in map)) continue;
    if (txn.type === "expense") map[accId] -= amount;
    else if (txn.type === "income") map[accId] += amount;
  }
  return map;
}
