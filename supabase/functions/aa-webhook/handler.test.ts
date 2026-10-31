import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAaWebhook, hmacHex, SIGNATURE_HEADER, verifySignature, type AaWebhookDeps } from "./handler";
import { SetuAaVendor, aaVendorFromEnv, type AaVendor } from "../_shared/ingest/aa_vendor";

const SECRET = "whsec_test_only";
const NOW = new Date("2026-10-31T12:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);
const CONSENT = "c0a8f3e2-1111-4abc-9def-000000000001";
const ROUTE = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
};

const fi = (txns: unknown[]) => ({
  fips: [{ accounts: [{ maskedAccNumber: "XXXXXXXX5678", data: { account: { transactions: { transaction: txns } } } }] }],
});
const debit = {
  txnId: "M1",
  type: "DEBIT",
  mode: "UPI",
  amount: "1234.50",
  transactionTimestamp: "2026-10-31T14:05:42+05:30",
  narration: "UPI/430412345678/SWIGGY/swiggy@icici/Payment",
  reference: "430412345678",
};
const credit = { ...debit, txnId: "M2", type: "CREDIT", amount: "500", reference: "430499990000" };

let routes: Map<string, typeof ROUTE>;
let processed: Set<string>;
let stored: Set<string>;
let deps: AaWebhookDeps;
let vendor: AaVendor & { fetchSessionData: ReturnType<typeof vi.fn> };

beforeEach(() => {
  routes = new Map([[CONSENT, ROUTE]]);
  processed = new Set();
  stored = new Set();
  vendor = { name: "fake", fetchSessionData: vi.fn(async () => fi([debit, credit])) };
  deps = {
    secret: SECRET,
    now: () => NOW,
    vendor,
    // A stand-in for ingest_transaction(): the hash decides.
    rpc: {
      rpc: vi.fn(async (_fn: string, args: Record<string, unknown>) => {
        const h = args.p_raw_payload_hash as string;
        const outcome = stored.has(h) ? "duplicate" : "inserted";
        stored.add(h);
        return { data: [{ transaction_id: `t-${h.slice(0, 6)}`, outcome }], error: null };
      }),
    },
    findRoute: vi.fn(async (id: string) => routes.get(id) ?? null),
    deactivateRoute: vi.fn(async (id: string) => {
      routes.delete(id);
    }),
    wasProcessed: vi.fn(async (id: string) => processed.has(id)),
    markProcessed: vi.fn(async (id: string) => {
      processed.add(id);
    }),
  };
});

async function signed(body: unknown, opts: { t?: number; secret?: string; header?: string | null } = {}) {
  const raw = JSON.stringify(body);
  const t = opts.t ?? T;
  const sig = `t=${t},v1=${await hmacHex(opts.secret ?? SECRET, `${t}.${raw}`)}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  const h = opts.header === undefined ? sig : opts.header;
  if (h !== null) headers[SIGNATURE_HEADER] = h;
  return new Request("http://local/aa-webhook", { method: "POST", headers, body: raw });
}

const session = (over: Record<string, unknown> = {}) => ({
  type: "SESSION_STATUS_UPDATE",
  notificationId: "n-1",
  consentId: CONSENT,
  dataSessionId: "sess-0001",
  data: { status: "COMPLETED" },
  ...over,
});

describe("signature", () => {
  it("accepts a fresh, correct signature", async () => {
    const raw = "{}";
    const header = `t=${T},v1=${await hmacHex(SECRET, `${T}.${raw}`)}`;
    expect(await verifySignature(raw, header, SECRET, NOW)).toBe("ok");
  });

  it("refuses everything while the secret is unset", async () => {
    const res = await handleAaWebhook(await signed(session()), { ...deps, secret: "" });
    expect(res.status).toBe(401);
    expect(deps.rpc.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", { header: null }],
    ["wrong secret", { secret: "someone-else" }],
    ["stale (6 minutes old)", { t: T - 360 }],
    ["garbage", { header: "t=abc,v1=zz" }],
  ])("rejects a %s signature with 401 and no side effects", async (_why, opts) => {
    const res = await handleAaWebhook(await signed(session(), opts), deps);
    expect(res.status).toBe(401);
    expect(vendor.fetchSessionData).not.toHaveBeenCalled();
    expect(deps.wasProcessed).not.toHaveBeenCalled();
  });

  it("rejects a body changed after signing", async () => {
    const good = await signed(session());
    const tampered = new Request(good.url, {
      method: "POST",
      headers: good.headers,
      body: JSON.stringify(session({ consentId: "attacker" })),
    });
    expect((await handleAaWebhook(tampered, deps)).status).toBe(401);
  });
});

describe("data sessions", () => {
  it("fetches the session, ingests every transaction, and reports counts", async () => {
    const res = await handleAaWebhook(await signed(session()), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, inserted: 2, duplicate: 0, rejected: 0 });
    expect(vendor.fetchSessionData).toHaveBeenCalledWith("sess-0001");
    const args = (deps.rpc.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(args).toMatchObject({
      p_tenant_id: ROUTE.tenantId,
      p_user_id: ROUTE.userId,
      p_source: "aa",
      p_type: "expense",
      p_amount: 1234.5,
      p_account_last4: "5678",
      p_external_ref: "430412345678",
    });
    expect(processed.has("aa:n-1")).toBe(true);
  });

  it("a redelivered notification is skipped before any work", async () => {
    await handleAaWebhook(await signed(session()), deps);
    const res = await handleAaWebhook(await signed(session()), deps);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(vendor.fetchSessionData).toHaveBeenCalledTimes(1);
  });

  it("a new notification for overlapping data stores nothing twice", async () => {
    await handleAaWebhook(await signed(session()), deps);
    const res = await handleAaWebhook(await signed(session({ notificationId: "n-2" })), deps);
    expect(await res.json()).toMatchObject({ inserted: 0, duplicate: 2 });
    expect(stored.size).toBe(2);
  });

  it("drops repeats inside one payload and counts unusable rows", async () => {
    vendor.fetchSessionData.mockResolvedValueOnce(
      fi([debit, { ...debit, txnId: "M1-again" }, { type: "DEBIT", amount: "5" }, { ...debit, amount: "-3" }]),
    );
    const res = await handleAaWebhook(await signed(session()), deps);
    expect(await res.json()).toMatchObject({ inserted: 1, duplicate: 1, rejected: 2 });
  });

  it("accepts data pushed inline (FI_DATA) without a fetch", async () => {
    const res = await handleAaWebhook(
      await signed({ type: "FI_DATA", notificationId: "n-3", consentId: CONSENT, data: fi([credit]) }),
      deps,
    );
    expect(await res.json()).toMatchObject({ inserted: 1 });
    expect(vendor.fetchSessionData).not.toHaveBeenCalled();
  });

  it("503 when a fetch is needed but no vendor is configured — and not marked done", async () => {
    const res = await handleAaWebhook(await signed(session()), { ...deps, vendor: null });
    expect(res.status).toBe(503);
    expect(processed.size).toBe(0);
  });

  it("502 when the vendor fetch fails, so the vendor retries", async () => {
    vendor.fetchSessionData.mockRejectedValueOnce(new Error("timeout"));
    const res = await handleAaWebhook(await signed(session()), deps);
    expect(res.status).toBe(502);
    expect(processed.size).toBe(0);
  });

  it("an unknown or revoked consent is acknowledged and ignored", async () => {
    const res = await handleAaWebhook(await signed(session({ consentId: "c-unknown-0001" })), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "no active route" });
    expect(vendor.fetchSessionData).not.toHaveBeenCalled();
  });

  it("a session that is still running is ignored", async () => {
    const res = await handleAaWebhook(await signed(session({ data: { status: "PENDING" } })), deps);
    expect(await res.json()).toMatchObject({ ignored: "SESSION_STATUS_UPDATE" });
    expect(vendor.fetchSessionData).not.toHaveBeenCalled();
  });
});

describe("consent updates", () => {
  it.each(["REVOKED", "EXPIRED", "PAUSED", "REJECTED"])("%s switches the route off", async (status) => {
    const res = await handleAaWebhook(
      await signed({ type: "CONSENT_STATUS_UPDATE", notificationId: `c-${status}`, consentId: CONSENT, data: { status } }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(deps.deactivateRoute).toHaveBeenCalledWith(CONSENT);
    // Data arriving after revocation is not ingested.
    await handleAaWebhook(await signed(session({ notificationId: `after-${status}` })), deps);
    expect(deps.rpc.rpc).not.toHaveBeenCalled();
  });

  it("ACTIVE changes nothing", async () => {
    await handleAaWebhook(
      await signed({ type: "CONSENT_STATUS_UPDATE", notificationId: "c-a", consentId: CONSENT, data: { status: "ACTIVE" } }),
      deps,
    );
    expect(deps.deactivateRoute).not.toHaveBeenCalled();
  });
});

describe("request hygiene", () => {
  it("POST only", async () => {
    const res = await handleAaWebhook(new Request("http://local/aa-webhook"), deps);
    expect(res.status).toBe(405);
  });

  it("refuses an oversized body before reading it", async () => {
    const req = new Request("http://local/aa-webhook", {
      method: "POST",
      headers: { "content-length": String(3 * 1024 * 1024) },
      body: "{}",
    });
    expect((await handleAaWebhook(req, deps)).status).toBe(413);
  });

  it("400 for signed JSON that is not a notification", async () => {
    expect((await handleAaWebhook(await signed([1, 2]), deps)).status).toBe(400);
  });
});

describe("vendor configuration", () => {
  const envOf = (vars: Record<string, string>) => (k: string) => vars[k] ?? "";
  const setu = {
    AA_VENDOR: "setu",
    AA_BASE_URL: "https://fiu-sandbox.example",
    AA_CLIENT_ID: "id",
    AA_CLIENT_SECRET: "secret",
    AA_PRODUCT_INSTANCE_ID: "pi",
  };

  it("is off unless fully configured over https", () => {
    expect(aaVendorFromEnv(envOf({}))).toBeNull();
    expect(aaVendorFromEnv(envOf({ ...setu, AA_CLIENT_SECRET: "" }))).toBeNull();
    expect(aaVendorFromEnv(envOf({ ...setu, AA_BASE_URL: "http://insecure.example" }))).toBeNull();
    expect(aaVendorFromEnv(envOf(setu))).toBeInstanceOf(SetuAaVendor);
  });

  it("Setu: one GET with the credential headers; errors surface", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sess-0001" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("nope", { status: 401 }));
    const v = aaVendorFromEnv(envOf(setu), fetchFn)!;
    expect(await v.fetchSessionData("sess-0001")).toEqual({ id: "sess-0001" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://fiu-sandbox.example/v2/sessions/sess-0001");
    expect(init.headers).toMatchObject({ "x-client-id": "id", "x-product-instance-id": "pi" });
    await expect(v.fetchSessionData("sess-0001")).rejects.toThrow(/401/);
    await expect(v.fetchSessionData("../../etc")).rejects.toThrow(/bad session id/);
  });
});
