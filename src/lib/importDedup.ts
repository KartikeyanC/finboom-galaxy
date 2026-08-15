/**
 * Content hashing for imported transactions.
 *
 * Re-uploading the same statement used to duplicate every row. Each imported
 * row now carries a hash of its meaningful content, and a partial unique index
 * on (tenant_id, import_hash) makes the database reject the second copy.
 *
 * Only the importer sets this. Manual entries leave it NULL and are never
 * de-duplicated — buying the same coffee twice in a day is legitimate.
 */

export interface ImportHashInput {
  type: string;
  amount: number | string;
  currency: string;
  category: string;
  /** ISO timestamp; only the calendar date participates in the hash. */
  occurred_at: string;
  description?: string | null;
}

/**
 * Builds the canonical string that identifies a row.
 *
 * Choices that matter:
 *  - only the DATE is used, not the time. Importers synthesise times (often
 *    "now" when the source has no clock), so including them would make the same
 *    row hash differently on every upload and defeat the whole mechanism.
 *  - the amount is fixed to 2 decimals so 100, "100.0" and 100.00 agree.
 *  - text is trimmed and lowercased so incidental whitespace or casing
 *    differences between exports do not read as a different transaction.
 */
export function canonicalImportKey(row: ImportHashInput): string {
  const date = (row.occurred_at || "").slice(0, 10);
  const amount = (Number(row.amount) || 0).toFixed(2);
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  return [
    norm(row.type),
    amount,
    norm(row.currency),
    norm(row.category),
    date,
    norm(row.description),
  ].join("|");
}

/** Hex SHA-256 of the canonical key. */
export async function computeImportHash(row: ImportHashInput): Promise<string> {
  const key = canonicalImportKey(row);
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hashes a batch, and drops rows that repeat within the batch itself.
 *
 * The database catches collisions against rows already stored, but a single
 * file can also contain the same row twice — those would be sent in one
 * statement and conflict with each other, so they are removed up front.
 */
export async function withImportHashes<T extends ImportHashInput>(
  rows: readonly T[],
): Promise<{ rows: (T & { import_hash: string })[]; duplicatesInFile: number }> {
  const seen = new Set<string>();
  const out: (T & { import_hash: string })[] = [];
  let duplicatesInFile = 0;

  for (const r of rows) {
    const import_hash = await computeImportHash(r);
    if (seen.has(import_hash)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(import_hash);
    out.push({ ...r, import_hash });
  }

  return { rows: out, duplicatesInFile };
}
