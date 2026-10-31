import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleEmailIngest,
  isBankDomain,
  mapEmailTxn,
  routeKeyFrom,
  senderDomain,
  sha256Hex,
  toIsoIst,
  type EmailIngestDeps,
} from "./handler";
import { normalizeIngest } from "../_shared/ingest/normalize";

const NOW = new Date("2026-10-31T12:00:00Z");
const KEY = "fr-3f9c0a1b2c3d4e5f60";
const SECRET = "a".repeat(64);
const WHO = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
};

const alert = {
  type: "debit",
  amount: "1,234.50",
  occurred_at: "31/10/2026 14:05",
  account: "XX5678",
  merchant: "SWIGGY",
  reference: "430412345678",
  mode: "UPI",
};

let routes: Map<string, { tenantId: string; userId: string; secretHash: string }>;
let processed: Set<string>;
let stored: Set<string>;
let deps: EmailIngestDeps;

beforeEach(async () => {
  routes = new Map([[KEY, { ...WHO, secretHash: await sha256Hex(SECRET) }]]);
  processed = new Set();
  stored = new Set();
  deps = {
    now: () => NOW,
    rpc: {
      rpc: vi.fn(async (_fn: string, args: Record<string, unknown>) => {
        const h = args.p_raw_payload_hash as string;
        const outcome = stored.has(h) ? "duplicate" : "inserted";
        stored.add(h);
        return { data: [{ transaction_id: "t", outcome }], error: null };
      }),
    },
    findRoute: vi.fn(async (k: string) => routes.get(k) ?? null),
    wasProcessed: vi.fn(async (id: string) => processed.has(id)),
    markProcessed: vi.fn(async (id: string) => {
      processed.add(id);
    }),
  };
});

const post = (body: unknown, secret: string | null = SECRET) =>
  new Request("http://local/email-ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  });

const mail = (over: Record<string, unknown> = {}) => ({
  to: `FinRoot <${KEY}@in.example>`,
  from: "HDFC Bank InstaAlerts <alerts@hdfcbank.net>",
  message_id: "<m1@hdfcbank.net>",
  authentication: { dkim: "pass", spf: "pass" },
  transactions: [alert],
  ...over,
});

describe("auth", () => {
  it("ingests with the route's secret", async () => {
    const res = await handleEmailIngest(post(mail()), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ inserted: 1, duplicate: 0, rejected: 0 });
  });

  it.each([
    ["no secret", null],
    ["a wrong secret", "b".repeat(64)],
    ["a too-short secret", "short"],
  ])("401 with %s, nothing written", async (_why, secret) => {
    const res = await handleEmailIngest(post(mail(), secret), deps);
    expect(res.status).toBe(401);
    expect(deps.rpc.rpc).not.toHaveBeenCalled();
  });

  it("the same 401 for an address that does not exist (no enumeration)", async () => {
    const res = await handleEmailIngest(post(mail({ to: "fr-nobody00000@in.example" })), deps);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("another route's secret cannot write into this route", async () => {
    routes.set("fr-otherperson01", { ...WHO, userId: "33333333-3333-3333-3333-333333333333", secretHash: await sha256Hex("c".repeat(64)) });
    const res = await handleEmailIngest(post(mail(), "c".repeat(64)), deps);
    expect(res.status).toBe(401);
  });
});

describe("sender checks", () => {
  it("refuses mail that is not from a bank, acknowledged so it is not retried", async () => {
    const res = await handleEmailIngest(post(mail({ from: "Prize Dept <win@lucky-draw.example>" })), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refused: "sender is not a known bank" });
    expect(deps.rpc.rpc).not.toHaveBeenCalled();
  });

  it("does not accept a look-alike domain", async () => {
    const res = await handleEmailIngest(post(mail({ from: "alerts@hdfcbank.net.evil.example" })), deps);
    expect(await res.json()).toMatchObject({ refused: expect.any(String) });
  });

  it("accepts bank subdomains and configured extra domains", async () => {
    expect(isBankDomain("alerts.icicibank.com")).toBe(true);
    expect(isBankDomain("mybank.example", ["mybank.example"])).toBe(true);
    expect(isBankDomain("evilhdfcbank.net")).toBe(false);
  });

  it.each(["dkim", "spf", "dmarc"])("refuses an explicit %s fail", async (k) => {
    const res = await handleEmailIngest(post(mail({ authentication: { [k]: "fail" } })), deps);
    expect(await res.json()).toMatchObject({ refused: `${k} failed` });
    expect(deps.rpc.rpc).not.toHaveBeenCalled();
  });
});

describe("payloads", () => {
  it("a whole statement: rows ingested, bad ones counted with reasons", async () => {
    const res = await handleEmailIngest(
      post(
        mail({
          transactions: [
            alert,
            { ...alert, type: "credit", amount: 25000, occurred_at: "2026-10-30", reference: "N1" },
            { ...alert, occurred_at: "not a date" },
            { ...alert, type: undefined },
            { ...alert, amount: "-5", occurred_at: "29-10-26" },
            "junk",
          ],
        }),
      ),
      deps,
    );
    expect(await res.json()).toMatchObject({
      inserted: 2,
      rejected: 4,
      reasons: { "unreadable date": 1, "no type": 1, "invalid amount": 1, "not an object": 1 },
    });
  });

  it("a single e-receipt with the fields at the top level", async () => {
    const { transactions: _t, ...rest } = mail();
    const res = await handleEmailIngest(post({ ...rest, ...alert, message_id: "<r1@x>" }), deps);
    expect(await res.json()).toMatchObject({ inserted: 1 });
  });

  it("the RPC gets the email source and the mapped fields", async () => {
    await handleEmailIngest(post(mail()), deps);
    expect((deps.rpc.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({
      p_source: "email",
      p_tenant_id: WHO.tenantId,
      p_user_id: WHO.userId,
      p_type: "expense",
      p_amount: 1234.5,
      p_account_last4: "5678",
      p_external_ref: "430412345678",
      p_payment_mode: "UPI",
      p_description: "SWIGGY",
      p_occurred_at: "2026-10-31T08:35:00.000Z",
    });
  });

  it("a re-sent message is skipped; a forwarded copy stores nothing twice", async () => {
    await handleEmailIngest(post(mail()), deps);
    expect(await (await handleEmailIngest(post(mail()), deps)).json()).toEqual({ received: true, duplicate: true });
    const fwd = await handleEmailIngest(post(mail({ message_id: "<fwd@gmail.com>" })), deps);
    expect(await fwd.json()).toMatchObject({ inserted: 0, duplicate: 1 });
  });

  it("refuses absurd batch sizes and bodies", async () => {
    const many = Array.from({ length: 1001 }, () => alert);
    expect((await handleEmailIngest(post(mail({ transactions: many })), deps)).status).toBe(413);
    const big = new Request("http://local/email-ingest", {
      method: "POST",
      headers: { "content-length": String(2 * 1024 * 1024), authorization: `Bearer ${SECRET}` },
      body: "{}",
    });
    expect((await handleEmailIngest(big, deps)).status).toBe(413);
  });

  it("POST only; JSON objects only", async () => {
    expect((await handleEmailIngest(new Request("http://local/email-ingest"), deps)).status).toBe(405);
    expect((await handleEmailIngest(post([1, 2]), deps)).status).toBe(400);
  });
});

describe("helpers", () => {
  it.each([
    ["31/10/2026 14:05", "2026-10-31T14:05:00+05:30"],
    ["31-10-26", "2026-10-31T00:00:00+05:30"],
    ["2026-10-31", "2026-10-31T00:00:00+05:30"],
    ["2026-10-31 13:59:59", "2026-10-31T13:59:59+05:30"],
    ["31 Oct 2026, 2:05 PM", "2026-10-31T14:05:00+05:30"],
    ["31-Oct-26 12:10 am", "2026-10-31T00:10:00+05:30"],
    ["2026-10-31T08:35:00Z", "2026-10-31T08:35:00Z"],
    ["31/02/2026", null],
    ["31/10/2026 25:00", null],
    ["13:00 PM 31/10/2026", null],
    ["yesterday", null],
  ])("toIsoIst(%s) → %s", (raw, want) => expect(toIsoIst(raw)).toBe(want));

  it("routeKeyFrom / senderDomain", () => {
    expect(routeKeyFrom(`Me <${KEY.toUpperCase()}@in.example>`)).toBe(KEY);
    expect(routeKeyFrom("nobody")).toBeNull();
    expect(senderDomain("HDFC <alerts@HDFCBank.net>")).toBe("hdfcbank.net");
    expect(senderDomain("no address")).toBeNull();
  });

  it("joins a separate time column onto a date", () => {
    const m = mapEmailTxn({ type: "DR", amount: "10", date: "31/10/2026", time: "14:05" }, WHO);
    expect(typeof m === "object" && m.occurredAt).toBe("2026-10-31T14:05:00+05:30");
  });

  it("an e-mail row hashes like the bank SMS for the same payment", async () => {
    const fromMail = mapEmailTxn(alert, WHO);
    if (typeof fromMail === "string") throw new Error(fromMail);
    const a = await normalizeIngest(fromMail, NOW);
    const b = await normalizeIngest(
      { source: "sms", ...WHO, type: "debited", amount: "Rs.1,234.50", occurredAt: "2026-10-31T14:05:40+05:30", account: "A/c XX5678" },
      NOW,
    );
    expect(a.rawPayloadHash).toBe(b.rawPayloadHash);
  });
});
