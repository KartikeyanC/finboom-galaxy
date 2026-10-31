/**
 * Stage 7, source 2 — reading Account Aggregator FI data.
 *
 * An AA hands over each account's statement in the ReBIT FI schema: one
 * `account` with a `maskedAccNumber` and `transactions.transaction[]`, each
 * transaction carrying `txnId`, `type` (DEBIT / CREDIT), `mode`, `amount`,
 * `transactionTimestamp`, `valueDate`, `narration` and `reference`.
 *
 * Vendors wrap that differently — Setu nests it under
 * `fips[].accounts[].data.account`, others under `data[].decryptedFI.account`,
 * some FIPs capitalise `Transactions` / `Transaction`. Rather than one parser
 * per wrapper, this walks the payload and takes every transaction-shaped
 * object, remembering the nearest `maskedAccNumber` above it. Pure: no
 * network, no Deno — `aa.test.ts` runs it under vitest.
 *
 * The output is `RawIngestTxn`, so AA rows go through exactly the same
 * normalizeIngest() + ingest_transaction() path as SMS and e-mail.
 */

import type { RawIngestTxn } from "./normalize.ts";

/** One FI transaction as the ReBIT schema describes it (all optional — FIPs vary). */
export interface FiTransaction {
  txnId?: string;
  type?: string;
  mode?: string;
  amount?: string | number;
  transactionTimestamp?: string;
  valueDate?: string;
  narration?: string;
  reference?: string;
}

export interface AaTxn {
  maskedAccNumber: string | null;
  txn: FiTransaction;
}

const MAX_DEPTH = 12;

function lowerKeys(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k.toLowerCase()] = v;
  return out;
}

function looksLikeTxn(o: Record<string, unknown>): boolean {
  const l = lowerKeys(o);
  const type = String(l.type ?? "").toUpperCase();
  return (type === "DEBIT" || type === "CREDIT") && l.amount !== undefined;
}

function asTxn(o: Record<string, unknown>): FiTransaction {
  const l = lowerKeys(o);
  const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
  return {
    txnId: s(l.txnid),
    type: s(l.type),
    mode: s(l.mode),
    amount: l.amount as string | number,
    transactionTimestamp: s(l.transactiontimestamp),
    valueDate: s(l.valuedate),
    narration: s(l.narration),
    reference: s(l.reference),
  };
}

/** Every transaction in an FI payload, each with its account's masked number. */
export function collectFiTransactions(payload: unknown): AaTxn[] {
  const out: AaTxn[] = [];
  const walk = (node: unknown, masked: string | null, depth: number) => {
    if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, masked, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;
    if (looksLikeTxn(o)) {
      out.push({ maskedAccNumber: masked, txn: asTxn(o) });
      return;
    }
    const l = lowerKeys(o);
    const here = typeof l.maskedaccnumber === "string" ? (l.maskedaccnumber as string) : masked;
    for (const v of Object.values(o)) walk(v, here, depth + 1);
  };
  walk(payload, null, 0);
  return out;
}

/** AA `mode` → FinRoot's payment modes (UPI / Cash / Card / Net Banking / Wallet / Cheque). */
export function paymentModeOf(mode: string | undefined): string | null {
  switch ((mode ?? "").toUpperCase()) {
    case "UPI":
      return "UPI";
    case "CARD":
      return "Card";
    case "ATM":
    case "CASH":
      return "Cash";
    case "FT":
    case "NEFT":
    case "IMPS":
    case "RTGS":
      return "Net Banking";
    case "CHEQUE":
      return "Cheque";
    default:
      return null;
  }
}

/** A UPI RRN — the 12-digit number an SMS alert quotes as its reference. */
const RRN = /(?<!\d)(\d{12})(?!\d)/;

/**
 * The reference that can match the same payment from another source: the
 * RRN when there is one (SMS alerts and e-mails quote it), else the FIP's own
 * reference. Never txnId alone — it means nothing outside this FIP.
 */
export function externalRefOf(t: FiTransaction): string | null {
  const ref = (t.reference ?? "").trim();
  if (RRN.test(ref) && ref.replace(/\D/g, "").length === 12) return ref.replace(/\D/g, "");
  const inNarration = (t.narration ?? "").match(RRN);
  if (inNarration) return inNarration[1];
  return ref || null;
}

const NOISE = new Set([
  "UPI", "NEFT", "IMPS", "RTGS", "POS", "ATM", "ECOM", "DR", "CR", "P2A", "P2M",
  "PAYMENT", "PAY", "TRANSFER", "SENT", "RECEIVED", "FROM", "TO", "INB", "MB", "NA",
]);
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * The counterparty in a bank narration, best effort:
 *   "UPI/430412345678/SWIGGY/swiggy@icici/Payment" → "SWIGGY"
 *   "UPI-ZOMATO LTD-ZOMATO@HDFCBANK-HDFC0000001-430498765432-PAY" → "ZOMATO LTD"
 *   "NEFT-ACME CORP-N123456789" → "ACME CORP"
 * Null when nothing name-like is there. Never decisive for de-dup.
 */
export function merchantFromNarration(narration: string | undefined): string | null {
  const parts = (narration ?? "")
    .split(/[/|-]/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    const up = p.toUpperCase();
    if (NOISE.has(up) || IFSC.test(up)) continue;
    if (p.includes("@")) continue; // the VPA; the name usually precedes it
    if (!/[A-Za-z]{2,}/.test(p)) continue; // references, amounts
    if (/^[A-Z]?\d{6,}$/i.test(p)) continue; // N123456789-style refs
    return p.slice(0, 120);
  }
  return null;
}

/** When the transaction happened: its timestamp, else its value date at IST midnight. */
export function occurredAtOf(t: FiTransaction): string | null {
  if (t.transactionTimestamp) return t.transactionTimestamp;
  if (t.valueDate && /^\d{4}-\d{2}-\d{2}$/.test(t.valueDate)) return `${t.valueDate}T00:00:00+05:30`;
  return null;
}

/**
 * FI payload → the loose rows normalizeIngest() takes. Rows without a usable
 * time are dropped here (counted by the caller as rejected); amounts and types
 * are validated by normalizeIngest(), not second-guessed.
 */
export function fiPayloadToRawIngest(
  payload: unknown,
  who: { tenantId: string; userId: string },
): { rows: RawIngestTxn[]; skipped: number } {
  const rows: RawIngestTxn[] = [];
  let skipped = 0;
  for (const { maskedAccNumber, txn } of collectFiTransactions(payload)) {
    const occurredAt = occurredAtOf(txn);
    if (!occurredAt || txn.amount === undefined || !txn.type) {
      skipped++;
      continue;
    }
    rows.push({
      source: "aa",
      tenantId: who.tenantId,
      userId: who.userId,
      type: txn.type,
      amount: txn.amount,
      occurredAt,
      account: maskedAccNumber,
      merchant: merchantFromNarration(txn.narration),
      externalRef: externalRefOf(txn),
      paymentMode: paymentModeOf(txn.mode),
    });
  }
  return { rows, skipped };
}
