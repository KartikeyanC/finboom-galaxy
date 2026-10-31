/**
 * Stage 7, source 2 — the Account Aggregator webhook.
 *
 * The AA vendor calls this when a consent changes state or a data session
 * finishes. For a finished session it fetches the FI data, turns every
 * transaction into the shared ingest shape and writes it through
 * ingest_transaction(), which refuses anything already recorded — from an
 * earlier delivery, from the bank SMS the phone saw, or from a bank e-mail.
 *
 *   vendor ──POST──► verify signature ──► dedup notification id
 *                         │
 *          CONSENT_STATUS_UPDATE: revoked / expired / paused → route off
 *          SESSION_STATUS_UPDATE (COMPLETED) / FI_DATA_READY → fetch FI data
 *          FI_DATA (data inline)                             → use it
 *                         │
 *          route (consentId → tenant, user) ──► normalizeIngest ──► RPC
 *
 * Kept free of Deno and the Supabase SDK — every effect comes in through
 * `AaWebhookDeps` — so `handler.test.ts` exercises the real logic. index.ts
 * wires the real dependencies.
 *
 * Signature: `x-aa-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of
 * "<t>.<raw body>">` with AA_WEBHOOK_SECRET, five-minute tolerance, compared
 * in fixed time — the payments-webhook scheme (BUG-008). If the chosen vendor
 * signs differently (Setu uses a detached JWS), adapt verifySignature() and
 * keep its tests; nothing else changes.
 */

import { fiPayloadToRawIngest } from "../_shared/ingest/aa.ts";
import type { AaVendor } from "../_shared/ingest/aa_vendor.ts";
import {
  dedupeBatch,
  ingestNormalized,
  IngestValidationError,
  normalizeIngest,
  type NormalizedTxn,
  type RpcClient,
} from "../_shared/ingest/normalize.ts";

export const SIGNATURE_HEADER = "x-aa-signature";
const TOLERANCE_SECONDS = 300;
/** FI data for a year of a busy account fits comfortably; anything larger is refused. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Consent states after which no more data may be pulled for that consent. */
const DEAD_CONSENT = new Set(["REVOKED", "EXPIRED", "PAUSED", "REJECTED"]);

export interface AaRoute {
  tenantId: string;
  userId: string;
}

export interface AaWebhookDeps {
  secret: string;
  now(): Date;
  vendor: AaVendor | null;
  rpc: RpcClient;
  /** The active route for a consent, or null. */
  findRoute(consentId: string): Promise<AaRoute | null>;
  deactivateRoute(consentId: string): Promise<void>;
  wasProcessed(notificationId: string): Promise<boolean>;
  markProcessed(notificationId: string): Promise<void>;
  log?(msg: string, meta?: Record<string, unknown>): void;
}

interface Notification {
  notificationId: string | null;
  type: string;
  consentId: string | null;
  sessionId: string | null;
  status: string | null;
  data: unknown;
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

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifySignature(
  raw: string,
  header: string | null,
  secret: string,
  now: Date,
): Promise<"ok" | "missing" | "stale" | "bad"> {
  if (!secret) return "bad"; // unconfigured: refuse everything
  if (!header) return "missing";
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = (parts.v1 ?? "").toLowerCase();
  if (!Number.isFinite(t) || !/^[0-9a-f]{64}$/.test(v1)) return "bad";
  if (Math.abs(now.getTime() / 1000 - t) > TOLERANCE_SECONDS) return "stale";
  return timingSafeEqualHex(await hmacHex(secret, `${parts.t}.${raw}`), v1) ? "ok" : "bad";
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseNotification(body: unknown): Notification | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const type = str(b.type)?.toUpperCase();
  if (!type) return null;
  const data = b.data;
  const dataObj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    notificationId: str(b.notificationId) ?? str(b.id),
    type,
    consentId: (str(b.consentId) ?? str(dataObj.consentId))?.toLowerCase() ?? null,
    sessionId: str(b.dataSessionId) ?? str(b.sessionId) ?? str(dataObj.dataSessionId),
    status: (str(b.status) ?? str(dataObj.status))?.toUpperCase() ?? null,
    data,
  };
}

export interface IngestSummary {
  inserted: number;
  duplicate: number;
  rejected: number;
}

async function ingestPayload(
  payload: unknown,
  route: AaRoute,
  deps: AaWebhookDeps,
): Promise<IngestSummary> {
  const { rows, skipped } = fiPayloadToRawIngest(payload, route);
  const summary: IngestSummary = { inserted: 0, duplicate: 0, rejected: skipped };
  const now = deps.now();

  const normalized: NormalizedTxn[] = [];
  for (const r of rows) {
    try {
      normalized.push(await normalizeIngest(r, now));
    } catch (e) {
      if (!(e instanceof IngestValidationError)) throw e;
      summary.rejected++;
    }
  }
  const { rows: unique, duplicatesInBatch } = dedupeBatch(normalized);
  summary.duplicate += duplicatesInBatch;

  // One at a time: a statement page is tens of rows, and sequential writes keep
  // the event log in statement order.
  for (const n of unique) {
    const res = await ingestNormalized(deps.rpc, n);
    summary[res.outcome]++;
  }
  return summary;
}

export async function handleAaWebhook(req: Request, deps: AaWebhookDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);

  const verdict = await verifySignature(raw, req.headers.get(SIGNATURE_HEADER), deps.secret, deps.now());
  if (verdict !== "ok") return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const n = parseNotification(body);
  if (!n) return json({ error: "not an AA notification" }, 400);

  const eventKey = n.notificationId ? `aa:${n.notificationId}` : null;
  if (eventKey && (await deps.wasProcessed(eventKey))) {
    return json({ received: true, duplicate: true });
  }

  const done = async (payload: Record<string, unknown>) => {
    // Marked only after the work succeeded, so a failed delivery is retried.
    // Ingestion is idempotent anyway; this only saves repeat work.
    if (eventKey) await deps.markProcessed(eventKey);
    return json({ received: true, ...payload });
  };

  if (n.type === "CONSENT_STATUS_UPDATE") {
    if (n.consentId && n.status && DEAD_CONSENT.has(n.status)) {
      await deps.deactivateRoute(n.consentId);
      deps.log?.("aa consent closed", { status: n.status });
      return done({ consent: "closed" });
    }
    return done({ consent: n.status ?? "unknown" });
  }

  const isSessionDone =
    (n.type === "SESSION_STATUS_UPDATE" && (n.status === "COMPLETED" || n.status === "PARTIAL")) ||
    n.type === "FI_DATA_READY";
  const isInline = n.type === "FI_DATA";
  if (!isSessionDone && !isInline) return done({ ignored: n.type });

  if (!n.consentId) return json({ error: "consentId missing" }, 400);
  const route = await deps.findRoute(n.consentId);
  // No active route: the consent was revoked here, or never belonged to us.
  // 200, so the vendor stops retrying something that will never succeed.
  if (!route) return done({ ignored: "no active route" });

  let payload: unknown = n.data;
  if (isSessionDone) {
    if (!deps.vendor) return json({ error: "AA vendor not configured" }, 503);
    if (!n.sessionId) return json({ error: "dataSessionId missing" }, 400);
    try {
      payload = await deps.vendor.fetchSessionData(n.sessionId);
    } catch (e) {
      deps.log?.("aa fetch failed", { error: String(e) });
      return json({ error: "could not fetch FI data" }, 502); // the vendor retries
    }
  }

  const summary = await ingestPayload(payload, route, deps);
  deps.log?.("aa ingested", { ...summary });
  return done({ ...summary });
}
