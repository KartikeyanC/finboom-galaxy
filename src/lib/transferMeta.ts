/**
 * How a transfer stores its two ends (BUG-025, revised by Stage 3.4).
 *
 * A transfer is ONE row. Both ends are now real columns — `account_id` is the
 * source and `transfer_to_account_id` the destination. A paired-row model would
 * let half a transfer be deleted and silently unbalance both accounts.
 *
 * What remains here is READ-ONLY legacy support. Until 3.4 the source rode in a
 * `[Transfer|<uuid>]` description prefix; the backfill removed those, but a row
 * written by an older client between the migration and the deploy could still
 * carry one, so the parsers stay. **The encoder is deliberately gone** — there
 * is no supported way to write the prefix again, and `transferMeta.test.ts`
 * asserts no source file builds one.
 */

/** `transactions.category` is free text; every transfer uses this value. */
export const TRANSFER_CATEGORY = "Transfer";

/** Mode slug written into the prefix, so a transfer is recognisable in raw data. */
export const TRANSFER_MODE = "Transfer";

const PREFIX = /^\[([^\]|]+)(?:\|([^\]]*))?\] ?/;

/** LEGACY READ ONLY: source account id out of an old description prefix. */
export function transferSourceId(description: string | null | undefined): string | null {
  const m = description?.match(PREFIX);
  return m?.[2] || null;
}

/** The note a transfer carries, without the encoded source prefix. */
export function transferNote(description: string | null | undefined): string {
  if (!description) return "";
  return description.replace(PREFIX, "").trim();
}
