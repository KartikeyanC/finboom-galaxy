import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Real receipt scanning (previously BillScan.tsx's `// Simulated AI
 * parsing` — a fixed sample array, regardless of what was uploaded).
 * Same technique as send-email/index.test.ts: run the real source file
 * under a minimal `Deno` global shim, with `createClient` and `fetch`
 * substituted so these tests never touch a network or a real project —
 * enough to exercise authorization, rate-limiting and response validation
 * for real, not a paraphrase of it.
 */

type Handler = (req: Request) => Response | Promise<Response>;

let handler: Handler;
const envStore = new Map<string, string>();

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const OUTSIDER_ID = "33333333-3333-3333-3333-333333333333";

let currentUserId: string | null;
let membershipActive: boolean;
let auditRows: Array<{ actor_user_id: string; tenant_id: string; action: string; metadata: unknown; created_at: string }>;

function table(name: string) {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    },
    gte: () => builder,
    maybeSingle: async () => {
      if (name === "tenant_members") {
        if (filters.tenant_id === TENANT_ID && filters.user_id === USER_ID && membershipActive) {
          return { data: { role: "owner" }, error: null };
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
    // audit_log rate-limit count query — count: "exact", head: true
    then: (resolve: (v: unknown) => void) => {
      const relevant = auditRows.filter(
        (r) => r.action === filters.action && r.tenant_id === filters.tenant_id,
      );
      resolve({ count: relevant.length, error: null });
    },
    insert: async (row: typeof auditRows[number]) => {
      auditRows.push({ ...row, created_at: new Date().toISOString() });
      return { error: null };
    },
  };
  return builder;
}

vi.mock("https://esm.sh/@supabase/supabase-js@2.45.0", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        if (!token || !currentUserId) return { data: { user: null }, error: new Error("no user") };
        return { data: { user: { id: currentUserId } }, error: null };
      },
    },
    from: (name: string) => table(name),
  }),
}));

beforeEach(() => {
  envStore.clear();
  envStore.set("GEMINI_API_KEY", "test-key");
  auditRows = [];
  currentUserId = USER_ID;
  membershipActive = true;
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

function req(body: unknown, token: string | null = "a-valid-token") {
  return new Request("http://local/scan-receipt", {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ONE_IMAGE = [{ data: "aGVsbG8=", mimeType: "image/jpeg" }];

function geminiOk(payload: unknown) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
    { status: 200 },
  );
}

const VALID_RECEIPT = {
  merchant: "Oudh 1590",
  date: "2021-02-13",
  currency: "INR",
  subtotal: 1860,
  items: [
    { name: "Awadhi Handi Biryani Full", qty: 2, unit: "pc", unitPrice: 395, amount: 790, category: "Food & Dining" },
    { name: "Galawati Kabab (Mutton)", qty: 1, unit: "pc", unitPrice: 350, amount: 350, category: "Food & Dining" },
    { name: "Gosht Roghan Josh", qty: 1, unit: "pc", unitPrice: 340, amount: 340, category: "Food & Dining" },
    { name: "Phirni", qty: 3, unit: "pc", unitPrice: 90, amount: 270, category: "Food & Dining" },
    { name: "Soda Sikanji", qty: 1, unit: "pc", unitPrice: 110, amount: 110, category: "Food & Dining" },
  ],
  taxLines: [
    { label: "CGST 2.5%", amount: 46.5 },
    { label: "SGST 2.5%", amount: 46.5 },
  ],
  total: 1953,
};

describe("scan-receipt", () => {
  it("rejects an unauthenticated request", async () => {
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: ONE_IMAGE }, null));
    expect(res.status).toBe(401);
  });

  it("rejects a request with no tenant_id", async () => {
    await loadFunction();
    const res = await handler(req({ images: ONE_IMAGE }));
    expect(res.status).toBe(400);
  });

  it("rejects a request with no images", async () => {
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects more than 5 images", async () => {
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: Array(6).fill(ONE_IMAGE[0]) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at most 5/i);
  });

  it("rejects a non-member of the workspace — same status whether the tenant exists or not (BUG-023's own principle)", async () => {
    membershipActive = false;
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: ONE_IMAGE }));
    expect(res.status).toBe(403);
  });

  it("rejects an unsupported image type", async () => {
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: [{ data: "aGVsbG8=", mimeType: "application/pdf" }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsupported image type/i);
  });

  it("never calls Gemini once a structural check has already failed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await loadFunction();
    await handler(req({ tenant_id: TENANT_ID, images: [] }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("extracts real line items and the real total from a real receipt shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiOk(VALID_RECEIPT));
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: ONE_IMAGE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.merchant).toBe("Oudh 1590");
    expect(body.items).toHaveLength(5);
    expect(body.items[0]).toMatchObject({ name: "Awadhi Handi Biryani Full", qty: 2, unitPrice: 395, amount: 790 });
    expect(body.taxLines.reduce((s: number, t: { amount: number }) => s + t.amount, 0)).toBeCloseTo(93);
    expect(body.total).toBe(1953);
  });

  it("sends every image, in the order given, plus the instruction text", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiOk(VALID_RECEIPT));
    await loadFunction();
    const threeImages = [
      { data: "aW1nMQ==", mimeType: "image/jpeg" },
      { data: "aW1nMg==", mimeType: "image/png" },
      { data: "aW1nMw==", mimeType: "image/webp" },
    ];
    await handler(req({ tenant_id: TENANT_ID, images: threeImages }));
    const [, init] = fetchSpy.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    const parts = sentBody.contents[0].parts;
    expect(parts).toHaveLength(4); // 3 images + the prompt text
    expect(parts[0].inlineData.data).toBe("aW1nMQ==");
    expect(parts[1].inlineData.data).toBe("aW1nMg==");
    expect(parts[2].inlineData.data).toBe("aW1nMw==");
    expect(typeof parts[3].text).toBe("string");
  });

  it("defaults an out-of-enum unit or category instead of passing it through raw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiOk({
        merchant: "Test Store",
        currency: "INR",
        items: [{ name: "Mystery item", qty: 1, unit: "barrel", unitPrice: 10, amount: 10, category: "Not A Real Category" }],
        taxLines: [],
        total: 10,
      }),
    );
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: ONE_IMAGE }));
    const body = await res.json();
    expect(body.items[0].unit).toBe("pc");
    expect(body.items[0].category).toBe("Shopping");
  });

  it("returns 422 rather than a crash when Gemini's response can't be validated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiOk({ not: "a receipt" }));
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: ONE_IMAGE }));
    expect(res.status).toBe(422);
  });

  it("returns 500 with a clear message when the server has no GEMINI_API_KEY configured", async () => {
    envStore.delete("GEMINI_API_KEY");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: ONE_IMAGE }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enforces the daily per-workspace limit and blocks the 31st scan", async () => {
    const since = new Date().toISOString();
    for (let i = 0; i < 30; i++) {
      auditRows.push({ actor_user_id: USER_ID, tenant_id: TENANT_ID, action: "billscan.request", metadata: {}, created_at: since });
    }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiOk(VALID_RECEIPT));
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: ONE_IMAGE }));
    expect(res.status).toBe(429);
  });

  it("does not rate-limit a different workspace's requests", async () => {
    const since = new Date().toISOString();
    for (let i = 0; i < 30; i++) {
      auditRows.push({ actor_user_id: USER_ID, tenant_id: "some-other-tenant", action: "billscan.request", metadata: {}, created_at: since });
    }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiOk(VALID_RECEIPT));
    await loadFunction();
    const res = await handler(req({ tenant_id: TENANT_ID, images: ONE_IMAGE }));
    expect(res.status).toBe(200);
  });

  it("logs the scan without leaking merchant, amount, or category into audit_log", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiOk(VALID_RECEIPT));
    await loadFunction();
    await handler(req({ tenant_id: TENANT_ID, images: ONE_IMAGE }));
    const row = auditRows.find((r) => r.action === "billscan.request");
    expect(row).toBeTruthy();
    const meta = row!.metadata as Record<string, unknown>;
    expect(meta).toEqual({ image_count: 1, item_count: 5 });
    expect(JSON.stringify(meta)).not.toMatch(/Oudh|Biryani|1953/);
  });
});
