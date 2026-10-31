/**
 * Stage 7, source 3 — the inbound e-mail webhook.
 *
 * Each person who switches this on gets a private inbound address
 * (`create_ingest_route('email')` → `fr-3f9c…@<inbound domain>`) and a secret
 * shown once. Bank alert e-mails, e-receipts and statements sent or forwarded
 * there are read by an e-mail parser (Parseur, a SendGrid Inbound Parse
 * worker, a Postfix script…), which POSTs the extracted transactions here as
 * JSON. FinRoot never receives or stores the e-mail itself.
 *
 *   parser ──POST + route secret──► route (address → tenant, user)
 *            ──► sender checks ──► map fields ──► normalizeIngest ──► RPC
 *
 * Trust, in order:
 *   1. the per-route secret (Bearer token) proves the call comes from the
 *      parser this person configured — compared as SHA-256 against
 *      ingest_routes.secret_hash, in fixed time;
 *   2. the sender's domain must be a bank's (EMAIL_INGEST_ALLOWED_DOMAINS
 *      adds to the built-in list), so a stranger who learns the address
 *      cannot drop fake "debits" into someone's ledger by mailing it;
 *   3. a parser that reports SPF / DKIM results is held to them: an explicit
 *      "fail" is refused. From-addresses are forgeable — pick a parser that
 *      checks DKIM.
 *
 * Accepted body (field names are lenient; parsers name things differently):
 *   {
 *     "to": "fr-3f9c…@in.example", "from": "alerts@hdfcbank.net",
 *     "message_id": "<…>", "authentication": { "dkim": "pass", "spf": "pass" },
 *     "transactions": [ { "type": "debit", "amount": "1,234.50",
 *        "occurred_at": "31/10/2026 14:05", "account": "XX5678",
 *        "merchant": "SWIGGY", "reference": "430412345678", "mode": "UPI" } ]
 *   }
 * or the fields of a single transaction at the top level (an e-receipt).
 *
 * Free of Deno and the SDK — effects come in through `EmailIngestDeps` — so
 * handler.test.ts runs the real logic; index.ts wires real dependencies.
 */

import {
  dedupeBatch,
  ingestNormalized,
  IngestValidationError,
  normalizeIngest,
  type NormalizedTxn,
  type RawIngestTxn,
  type RpcClient,
} from "../_shared/ingest/normalize.ts";

const MAX_BODY_BYTES = 1024 * 1024;
/** A monthly statement of a busy account; more than this is not a real payload. */
const MAX_TRANSACTIONS = 1000;

/**
 * Sender domains of Indian banks' alert and statement mail (and their
 * subdomains). EMAIL_INGEST_ALLOWED_DOMAINS (comma-separated) extends it.
 */
export const BANK_DOMAINS = [
  "hdfcbank.net", "hdfcbank.com", "sbi.co.in", "onlinesbi.com", "icicibank.com",
  "axisbank.com", "kotak.com", "kotakbank.com", "yesbank.in", "idfcfirstbank.com",
  "indusind.com", "pnb.co.in", "bankofbaroda.com", "bankofbaroda.co.in",
  "canarabank.com", "canarabank.in", "unionbankofindia.co.in", "federalbank.co.in",
  "aubank.in", "iob.in", "sc.com", "paytmbank.com", "airtelbank.com", "rblbank.com",
  "bandhanbank.com", "dbs.com", "hsbc.co.in", "citi.com",
];

export interface EmailRoute {
  tenantId: string;
  userId: string;
  /** Hex SHA-256 of the route's secret. */
  secretHash: string;
}

export interface EmailIngestDeps {
  now(): Date;
  rpc: RpcClient;
  /** The ACTIVE email route with this key, or null. */
  findRoute(routeKey: string): Promise<EmailRoute | null>;
  wasProcessed(id: string): Promise<boolean>;
  markProcessed(id: string): Promise<void>;
  /** Extra allowed sender domains. */
  extraDomains?: string[];
  log?(msg: string, meta?: Record<string, unknown>): void;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** "Alerts <alerts@HDFCBank.net>" → "hdfcbank.net"; null if there is no address. */
export function senderDomain(from: string): string | null {
  const m = from.match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})>?\s*$/);
  return m ? m[1].toLowerCase() : null;
}

export function isBankDomain(domain: string, extra: readonly string[] = []): boolean {
  return [...BANK_DOMAINS, ...extra.map((d) => d.trim().toLowerCase()).filter(Boolean)].some(
    (b) => domain === b || domain.endsWith(`.${b}`),
  );
}

/** "fr-3f9c…@in.example" or "Me <fr-3f9c…@in.example>" → "fr-3f9c…". */
export function routeKeyFrom(to: string): string | null {
  const m = to.match(/<?([a-z0-9][a-z0-9._-]{5,63})@[A-Za-z0-9.-]+>?/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Indian statements write dates day-first and often without a zone. Turns
 * what parsers send into something Date understands, in IST unless a zone is
 * given:
 *   "31/10/2026 14:05" · "31-10-26" · "2026-10-31" · "31 Oct 2026, 2:05 PM"
 */
export function toIsoIst(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Already ISO with a time and zone: leave it alone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;

  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  let y: number, mo: number, d: number;
  let rest: string;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/))) {
    [y, mo, d, rest] = [+m[1], +m[2], +m[3], m[4]];
  } else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)(.*)$/))) {
    [d, mo, y, rest] = [+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3], m[4]];
  } else if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s,-]+(\d{4}|\d{2})(?!\d)(.*)$/))) {
    const mon = months[m[2].toLowerCase()];
    if (!mon) return null;
    [d, mo, y, rest] = [+m[1], mon, m[3].length === 2 ? 2000 + +m[3] : +m[3], m[4]];
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  let hh = 0, mm = 0, ss = 0;
  const t = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (t) {
    hh = +t[1];
    mm = +t[2];
    ss = t[3] ? +t[3] : 0;
    const ap = t[4]?.toLowerCase();
    if (ap) {
      if (hh < 1 || hh > 12) return null;
      if (ap === "pm" && hh !== 12) hh += 12;
      if (ap === "am" && hh === 12) hh = 0;
    }
    if (hh > 23 || mm > 59 || ss > 59) return null;
  }
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const iso = `${p(y, 4)}-${p(mo)}-${p(d)}T${p(hh)}:${p(mm)}:${p(ss)}+05:30`;
  // Reject 31-02 and friends rather than letting Date roll them over.
  const check = new Date(iso);
  const ist = new Date(check.getTime() + 330 * 60_000);
  if (Number.isNaN(check.getTime()) || ist.getUTCDate() !== d || ist.getUTCMonth() + 1 !== mo) return null;
  return iso;
}

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const text = (v: unknown) => (v === undefined ? null : String(v));

/** Normalises the e-mail's payment mode wording to FinRoot's. */
function modeOf(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s.includes("UPI")) return "UPI";
  if (s.includes("CARD") || s === "POS" || s === "ECOM") return "Card";
  if (["NEFT", "IMPS", "RTGS", "NETBANKING", "NET BANKING", "FT"].includes(s)) return "Net Banking";
  if (s.includes("CHEQUE") || s.includes("CHQ")) return "Cheque";
  if (s === "ATM" || s === "CASH") return "Cash";
  if (s.includes("WALLET")) return "Wallet";
  return null;
}

/** One parsed line → the loose shape normalizeIngest() takes, or why not. */
export function mapEmailTxn(
  t: Record<string, unknown>,
  who: { tenantId: string; userId: string },
): RawIngestTxn | string {
  const rawTime = pick(t, "occurred_at", "occurredAt", "timestamp", "datetime", "date", "transaction_date", "txn_date");
  const time = pick(t, "time", "txn_time");
  if (rawTime === undefined) return "no date";
  const joined = time !== undefined && !/\d:\d/.test(String(rawTime)) ? `${rawTime} ${time}` : String(rawTime);
  const occurredAt = toIsoIst(joined);
  if (!occurredAt) return "unreadable date";

  const type = pick(t, "type", "direction", "txn_type", "transaction_type", "dr_cr", "drcr");
  const amount = pick(t, "amount", "amt", "value", "transaction_amount");
  if (type === undefined) return "no type";
  if (amount === undefined) return "no amount";

  return {
    source: "email",
    tenantId: who.tenantId,
    userId: who.userId,
    type: String(type),
    amount: typeof amount === "number" ? amount : String(amount),
    occurredAt,
    currency: text(pick(t, "currency")),
    account: text(pick(t, "account", "account_number", "account_no", "card", "card_number", "masked_account")),
    merchant: text(pick(t, "merchant", "payee", "counterparty", "description", "narration")),
    externalRef: text(pick(t, "reference", "ref", "utr", "rrn", "ref_no", "transaction_id")),
    paymentMode: modeOf(pick(t, "mode", "payment_mode", "channel")),
  };
}

export interface IngestSummary {
  inserted: number;
  duplicate: number;
  rejected: number;
}

export async function handleEmailIngest(req: Request, deps: EmailIngestDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return json({ error: "payload too large" }, 413);
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);

  // The secret travels as a Bearer token (Parseur and most parsers can set a
  // header). Read before anything else; no secret, no further work.
  const auth = req.headers.get("authorization") ?? "";
  const secret = auth.match(/^Bearer\s+(\S{32,128})$/i)?.[1] ?? null;
  if (!secret) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const routeKey =
    (typeof body.route_key === "string" ? body.route_key.toLowerCase() : null) ??
    routeKeyFrom(String(pick(body, "to", "recipient", "envelope_to") ?? ""));
  // Same answer for "no such route" and "wrong secret": the endpoint must not
  // confirm which addresses exist.
  const route = routeKey ? await deps.findRoute(routeKey) : null;
  if (!route || !timingSafeEqualHex(await sha256Hex(secret), route.secretHash)) {
    return json({ error: "unauthorized" }, 401);
  }

  const messageId = typeof body.message_id === "string" ? body.message_id.trim().slice(0, 200) : null;
  // Hashed: processed_webhooks is declared free of personal data
  // (src/lib/dataExport.ts), and a raw Message-ID plus route key is not.
  const eventKey = messageId ? `email:${await sha256Hex(`${routeKey}\n${messageId}`)}` : null;
  if (eventKey && (await deps.wasProcessed(eventKey))) {
    return json({ received: true, duplicate: true });
  }
  const done = async (payload: Record<string, unknown>) => {
    if (eventKey) await deps.markProcessed(eventKey);
    return json({ received: true, ...payload });
  };

  // ---- sender checks: refused mail is acknowledged (200) so the parser does
  // not retry it forever, and nothing is written.
  const domain = senderDomain(String(pick(body, "from", "sender") ?? ""));
  if (!domain || !isBankDomain(domain, deps.extraDomains)) {
    deps.log?.("email refused: sender not a bank");
    return done({ refused: "sender is not a known bank" });
  }
  const authn = (body.authentication ?? {}) as Record<string, unknown>;
  for (const k of ["dkim", "spf", "dmarc"]) {
    if (String(authn[k] ?? "").toLowerCase() === "fail") {
      deps.log?.("email refused: authentication failed", { check: k });
      return done({ refused: `${k} failed` });
    }
  }

  const lines: unknown[] = Array.isArray(body.transactions) ? body.transactions : [body];
  if (lines.length > MAX_TRANSACTIONS) return json({ error: "too many transactions" }, 413);

  const summary: IngestSummary = { inserted: 0, duplicate: 0, rejected: 0 };
  const reasons: Record<string, number> = {};
  const reject = (why: string) => {
    summary.rejected++;
    reasons[why] = (reasons[why] ?? 0) + 1;
  };

  const now = deps.now();
  const normalized: NormalizedTxn[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      reject("not an object");
      continue;
    }
    const mapped = mapEmailTxn(line as Record<string, unknown>, route);
    if (typeof mapped === "string") {
      reject(mapped);
      continue;
    }
    try {
      normalized.push(await normalizeIngest(mapped, now));
    } catch (e) {
      if (!(e instanceof IngestValidationError)) throw e;
      reject(`invalid ${e.field}`);
    }
  }

  const { rows, duplicatesInBatch } = dedupeBatch(normalized);
  summary.duplicate += duplicatesInBatch;
  for (const n of rows) {
    const res = await ingestNormalized(deps.rpc, n);
    summary[res.outcome]++;
  }

  deps.log?.("email ingested", { ...summary });
  return done({ ...summary, ...(summary.rejected ? { reasons } : {}) });
}
