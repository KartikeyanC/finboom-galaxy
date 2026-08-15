import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Stage 0.10 — the REST client the SEC suite is written against.
 *
 * SEC-T01…T20 are almost all "role X calls Y directly and is refused". None of
 * them can go through the app: the app is the thing whose checks are being
 * bypassed. They need a raw PostgREST client carrying a specific role's JWT,
 * which is what this is.
 *
 * Nothing here throws on a non-2xx. A refusal IS the expected result for most
 * of these cases, so the status code is data, not an error — a client that
 * threw would turn every passing security test into a catch block.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(file: string): Record<string, string> {
  const p = resolve(ROOT, file);
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2].trim()]),
  );
}

const dev = readEnvFile(".env.development");
export const SUPABASE_URL = process.env.SUPABASE_URL || dev.VITE_SUPABASE_URL || "";
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY || dev.VITE_SUPABASE_PUBLISHABLE_KEY || "";

/** The harness roles, once `scripts/test-harness.mjs provision` has run. */
export type HarnessRole = "owner-a" | "admin-a" | "viewer-a" | "owner-b" | "multi" | "po";

const harness = readEnvFile(".env.harness");

/** True when the Stage 0.10 accounts exist. Specs should `test.skip` on this. */
export const harnessReady = ["owner-a", "admin-a", "viewer-a"].every(
  (r) => !!harness[`PW_${r.toUpperCase().replace(/-/g, "_")}`],
);

export type RestResult<T = unknown> = { status: number; ok: boolean; body: T };

async function call<T>(
  path: string,
  { method = "GET", token, body, prefer }: {
    method?: string;
    token?: string;
    body?: unknown;
    prefer?: string;
  } = {},
): Promise<RestResult<T>> {
  const res = await fetch(SUPABASE_URL + path, {
    method,
    headers: {
      apikey: ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* PostgREST returns text on some errors; keep it as-is */
  }
  return { status: res.status, ok: res.ok, body: parsed as T };
}

/** Exchange a password for a role JWT. Returns null rather than throwing. */
export async function tokenFor(role: HarnessRole): Promise<string | null> {
  const pw = harness[`PW_${role.toUpperCase().replace(/-/g, "_")}`];
  if (!pw) return null;
  const r = await call<{ access_token?: string }>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: `finroot-harness+${role}@example.com`, password: pw },
  });
  return r.body?.access_token ?? null;
}

/** Sign in with an arbitrary credential — used to prove the client itself works. */
export async function tokenForCredentials(email: string, password: string): Promise<string | null> {
  const r = await call<{ access_token?: string }>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  return r.body?.access_token ?? null;
}

/**
 * A PostgREST client bound to one identity. Pass no token for the anonymous
 * case, which several SEC cases need.
 */
export function rest(token?: string) {
  return {
    /** `select("transactions", "select=id&limit=5")` */
    select: <T = unknown[]>(table: string, query = "select=*") =>
      call<T>(`/rest/v1/${table}?${query}`, { token }),

    insert: <T = unknown>(table: string, rows: unknown) =>
      call<T>(`/rest/v1/${table}`, {
        method: "POST",
        token,
        body: rows,
        prefer: "return=representation",
      }),

    /** `patch("subscriptions", "id=eq.123", { plan_id: "pro" })` */
    patch: <T = unknown>(table: string, query: string, body: unknown) =>
      call<T>(`/rest/v1/${table}?${query}`, {
        method: "PATCH",
        token,
        body,
        prefer: "return=representation",
      }),

    del: <T = unknown>(table: string, query: string) =>
      call<T>(`/rest/v1/${table}?${query}`, { method: "DELETE", token, prefer: "return=representation" }),

    rpc: <T = unknown>(name: string, args: Record<string, unknown> = {}) =>
      call<T>(`/rest/v1/rpc/${name}`, { method: "POST", token, body: args }),
  };
}

/** The `sub` claim, for asserting a token really belongs to who you think. */
export function subject(jwt: string): string {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString()).sub;
}
