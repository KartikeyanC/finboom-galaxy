/**
 * Stage 5.9 — count every call to an edge function, for cost alerting.
 *
 *   Deno.serve(metered("live-price", async (req) => { ... }));
 *
 * Each call is recorded by `record_edge_call` (migration 20261105120000),
 * which keeps an hourly count per function and notifies the platform admins
 * when one goes over its limit or starts failing.
 *
 * Recording must never cost the caller anything: it runs after the response
 * is produced, is handed to `EdgeRuntime.waitUntil` when the runtime has it
 * (so the response is not held), swallows every error, and gives up after a
 * short timeout. A monitoring outage must not become a product outage.
 */

type Handler = (req: Request) => Response | Promise<Response>;

export type Recorder = (fn: string, status: number) => Promise<void>;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Server error = the function's own fault; 4xx is the caller's. */
export const isServerError = (status: number) => status >= 500;

export function metered(fn: string, handler: Handler, record: Recorder = recordViaRest): Handler {
  return async (req: Request) => {
    let status = 500;
    try {
      const res = await handler(req);
      status = res.status;
      return res;
    } finally {
      // CORS preflights are not work worth counting.
      if (req.method !== "OPTIONS") {
        const p = record(fn, status).catch(() => {});
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
      }
    }
  };
}

/** Calls the RPC over REST with the service role; never throws. */
export const recordViaRest: Recorder = async (fn, status) => {
  const env = (k: string) => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? "";
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/rpc/record_edge_call`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_fn: fn, p_status: status }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* monitoring is best effort */
  }
};
