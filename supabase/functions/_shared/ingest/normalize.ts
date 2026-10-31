/**
 * Stage 7 — the one normalisation + de-duplication path every automated
 * source goes through before it reaches `transactions`.
 *
 *   SMS / notification (phone)  ┐
 *   Account Aggregator webhook  ├─► normalizeIngest() ─► ingest_transaction() RPC
 *   Inbound e-mail webhook      ┘        (this file)      (20261031120000)
 *
 * Pure TypeScript with Web Crypto only — no Deno or Node globals — so the edge
 * functions import it directly and vitest runs it for real
 * (`normalize.test.ts`). The mobile app carries a Dart twin; the canonical
 * string below is the contract between them, and the test vectors pin it.
 *
 * De-dup key (user's spec): SHA-256 of
 *   user_id | amount (2 dp) | type | occurred_at truncated to the UTC minute | account_last4
 * The minute is UTC so a phone in IST and a webhook in UTC agree. A missing
 * last-4 is an empty field, not "null", so the string stays stable.
 */

export const INGEST_SOURCES = ["sms", "notification", "aa", "email"] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];
export type IngestType = "income" | "expense";

/** What an adapter hands over — loose, as each source words things its own way. */
export interface RawIngestTxn {
  source: IngestSource | string;
  tenantId: string;
  userId: string;
  /** "debit" / "DR" / "spent" / "expense" / "credit" / "CR" / "received" / "income" … */
  type: string;
  /** 1234.5, "1,234.50", "Rs. 1,234.50", "INR 1234.5", "₹1,234" */
  amount: number | string;
  /** ISO string, epoch milliseconds or a Date. */
  occurredAt: string | number | Date;
  currency?: string | null;
  /** "XX1234", "A/c no. XXXXXX5678", "card ending 4321", "1234" */
  account?: string | null;
  merchant?: string | null;
  note?: string | null;
  /** UPI RRN / bank reference / AA txnId. */
  externalRef?: string | null;
  paymentMode?: string | null;
  category?: string | null;
}

export interface NormalizedTxn {
  source: IngestSource;
  tenantId: string;
  userId: string;
  type: IngestType;
  /** Rounded to 2 dp. */
  amount: number;
  currency: string;
  /** ISO 8601, UTC, full precision (the hash uses the minute only). */
  occurredAt: string;
  accountLast4: string | null;
  category: string;
  description: string | null;
  externalRef: string | null;
  paymentMode: string | null;
  rawPayloadHash: string;
}

export class IngestValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "IngestValidationError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 999_999_999_999.99;
/** A phone clock a little ahead of the server is normal; a year ahead is not. */
const FUTURE_SLACK_MS = 10 * 60 * 1000;

const EXPENSE_WORDS = [
  "expense", "debit", "debited", "dr", "spent", "paid", "sent", "withdrawn",
  "withdrawal", "purchase",
];
const INCOME_WORDS = [
  "income", "credit", "credited", "cr", "received", "deposited", "deposit",
  "refund", "refunded",
];

/** Maps each source's wording to income / expense, or throws. */
export function normalizeType(raw: string): IngestType {
  const t = (raw ?? "").trim().toLowerCase();
  if (EXPENSE_WORDS.includes(t)) return "expense";
  if (INCOME_WORDS.includes(t)) return "income";
  throw new IngestValidationError("type", `Unrecognised transaction type: "${raw}"`);
}

/** Strips currency marks and Indian / Western grouping; positive, 2 dp. */
export function parseAmount(raw: number | string): number {
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else {
    const cleaned = (raw ?? "")
      .replace(/(?:rs\.?|inr|₹)/gi, "")
      .replace(/[,\s]/g, "")
      .replace(/\/-$/, "");
    if (!/^\d+(?:\.\d+)?$/.test(cleaned)) {
      throw new IngestValidationError("amount", `Unreadable amount: "${raw}"`);
    }
    n = Number(cleaned);
  }
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) {
    throw new IngestValidationError("amount", `Amount out of range: ${raw}`);
  }
  return Math.round(n * 100) / 100;
}

/** The last four digits named in an account / card string, or null. */
export function normalizeLast4(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Any accepted timestamp → Date, rejecting nonsense and the far future. */
export function parseOccurredAt(raw: string | number | Date, now: Date = new Date()): Date {
  const d = raw instanceof Date ? new Date(raw.getTime()) : new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new IngestValidationError("occurredAt", `Unreadable timestamp: "${String(raw)}"`);
  }
  if (d.getTime() > now.getTime() + FUTURE_SLACK_MS) {
    throw new IngestValidationError("occurredAt", "Timestamp is in the future");
  }
  return d;
}

/** "2026-10-31T08:35Z" — the minute the hash is bucketed on. */
export function utcMinute(d: Date): string {
  return d.toISOString().slice(0, 16) + "Z";
}

export interface DedupKeyInput {
  userId: string;
  amount: number;
  type: IngestType;
  occurredAt: Date;
  accountLast4: string | null;
}

/**
 * The canonical string. Changing anything here re-keys every ingested row and
 * lets the next copy of each payment through — change the Dart twin and the
 * test vectors in the same commit, or not at all.
 */
export function canonicalDedupKey(k: DedupKeyInput): string {
  return [
    k.userId.trim().toLowerCase(),
    k.amount.toFixed(2),
    k.type,
    utcMinute(k.occurredAt),
    k.accountLast4 ?? "",
  ].join("|");
}

/** Hex SHA-256 of [canonicalDedupKey]. */
export async function computeRawPayloadHash(k: DedupKeyInput): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalDedupKey(k));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clean(s: string | null | undefined, max: number): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function isSource(s: string): s is IngestSource {
  return (INGEST_SOURCES as readonly string[]).includes(s);
}

/**
 * Validates and normalises one payload from any source and attaches its
 * de-dup hash. Throws [IngestValidationError] — adapters turn that into a 422,
 * never a half-written row.
 */
export async function normalizeIngest(
  raw: RawIngestTxn,
  now: Date = new Date(),
): Promise<NormalizedTxn> {
  const source = (raw.source ?? "").trim().toLowerCase();
  if (!isSource(source)) {
    throw new IngestValidationError("source", `Unknown source: "${raw.source}"`);
  }
  if (!UUID.test(raw.tenantId ?? "")) {
    throw new IngestValidationError("tenantId", "tenantId must be a uuid");
  }
  if (!UUID.test(raw.userId ?? "")) {
    throw new IngestValidationError("userId", "userId must be a uuid");
  }

  const type = normalizeType(raw.type);
  const amount = parseAmount(raw.amount);
  const occurred = parseOccurredAt(raw.occurredAt, now);
  const accountLast4 = normalizeLast4(raw.account);
  // Not clean(…, 3): truncating would turn "RUPEES" into a valid-looking "RUP".
  const currency = (clean(raw.currency, 10) ?? "INR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new IngestValidationError("currency", `Bad currency code: "${raw.currency}"`);
  }

  // The merchant leads, so the ledger reads "Swiggy · …" like a typed entry.
  const merchant = clean(raw.merchant, 120);
  const note = clean(raw.note, 300);
  const description = [merchant, note].filter(Boolean).join(" · ") || null;

  const rawPayloadHash = await computeRawPayloadHash({
    userId: raw.userId,
    amount,
    type,
    occurredAt: occurred,
    accountLast4,
  });

  return {
    source,
    tenantId: raw.tenantId.toLowerCase(),
    userId: raw.userId.toLowerCase(),
    type,
    amount,
    currency,
    occurredAt: occurred.toISOString(),
    accountLast4,
    category: clean(raw.category, 80) ?? "Other",
    description,
    externalRef: clean(raw.externalRef, 120),
    paymentMode: clean(raw.paymentMode, 40),
    rawPayloadHash,
  };
}

/**
 * Drops payloads that repeat inside one batch (an AA page or a forwarded
 * e-mail with the same line twice) before they reach the database, where they
 * would only produce extra 'duplicate' events.
 */
export function dedupeBatch(rows: readonly NormalizedTxn[]): {
  rows: NormalizedTxn[];
  duplicatesInBatch: number;
} {
  const seen = new Set<string>();
  const out: NormalizedTxn[] = [];
  for (const r of rows) {
    if (seen.has(r.rawPayloadHash)) continue;
    seen.add(r.rawPayloadHash);
    out.push(r);
  }
  return { rows: out, duplicatesInBatch: rows.length - out.length };
}

/** The RPC's named arguments, exactly as ingest_transaction() declares them. */
export function toIngestRpcArgs(n: NormalizedTxn) {
  return {
    p_tenant_id: n.tenantId,
    p_user_id: n.userId,
    p_source: n.source,
    p_raw_payload_hash: n.rawPayloadHash,
    p_type: n.type,
    p_amount: n.amount,
    p_occurred_at: n.occurredAt,
    p_currency: n.currency,
    p_category: n.category,
    p_description: n.description,
    p_account_last4: n.accountLast4,
    p_external_ref: n.externalRef,
    p_payment_mode: n.paymentMode,
  };
}

/** The slice of a supabase-js client this needs — keeps tests free of the SDK. */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export type IngestOutcome = "inserted" | "duplicate";

export interface IngestResult {
  rawPayloadHash: string;
  outcome: IngestOutcome;
  transactionId: string | null;
}

/**
 * Writes one normalised row through ingest_transaction(). Call it as
 * `ingestNormalized(supabase, n)` — never detach `supabase.rpc` from its client
 * (CLAUDE.md: `const rpc = supabase.rpc` dies on `this`).
 */
export async function ingestNormalized(
  client: RpcClient,
  n: NormalizedTxn,
): Promise<IngestResult> {
  const { data, error } = await client.rpc("ingest_transaction", toIngestRpcArgs(n));
  if (error) throw new Error(`ingest_transaction failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { transaction_id?: string | null; outcome?: string }
    | undefined;
  const outcome = row?.outcome === "inserted" ? "inserted" : "duplicate";
  return {
    rawPayloadHash: n.rawPayloadHash,
    outcome,
    transactionId: row?.transaction_id ?? null,
  };
}
