import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * OPS-010 — "unset RESEND_API_KEY → send-email no-ops; app unaffected."
 *
 * `send-email` is deliberately not deployed (BUG-005 — still an open mail
 * relay in code, mitigated only by never shipping it), so there's no live
 * endpoint to run a real integration test against without either fixing that
 * first or shipping a known vulnerability just to green a checkbox — neither
 * is in scope here.
 *
 * This instead runs the REAL source file — not a paraphrase of its logic —
 * under a minimal `Deno` global shim. Node's built-in Request/Response/fetch
 * make that possible without installing Deno. `Deno.serve` is stubbed to
 * just capture the handler instead of binding a port.
 */

type Handler = (req: Request) => Response | Promise<Response>;

let handler: Handler;
const envStore = new Map<string, string>();

beforeEach(() => {
  envStore.clear();
  vi.restoreAllMocks();
  (globalThis as unknown as { Deno: unknown }).Deno = {
    serve: (h: Handler) => {
      handler = h;
    },
    env: { get: (k: string) => envStore.get(k) },
  };
});

async function loadFunction() {
  vi.resetModules();
  await import("./index.ts");
}

describe("send-email — RESEND_API_KEY not configured", () => {
  it("no-ops instead of attempting to send, and never touches the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await loadFunction();

    const res = await handler(
      new Request("http://localhost/send-email", {
        method: "POST",
        body: JSON.stringify({ to: "someone@example.com", subject: "hi" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      skipped: true,
      reason: "RESEND_API_KEY not configured",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still answers a CORS preflight the same way with no key configured", async () => {
    await loadFunction();
    const res = await handler(new Request("http://localhost/send-email", { method: "OPTIONS" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("would attempt to send once a key IS configured (proves the guard is the reason, not a broken handler)", async () => {
    envStore.set("RESEND_API_KEY", "test_key_123");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );
    await loadFunction();

    const res = await handler(
      new Request("http://localhost/send-email", {
        method: "POST",
        body: JSON.stringify({ to: "someone@example.com", subject: "hi" }),
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toEqual({ sent: true, id: "email_1" });
  });
});
