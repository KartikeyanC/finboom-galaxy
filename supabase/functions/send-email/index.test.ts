import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * BUG-005 rebuild — send-email went from "any signed-in user can email
 * arbitrary HTML to any address" to a closed template API with a
 * server-resolved recipient, an explicit authorization check, and a
 * per-caller rate limit. These tests exist to prove those three things
 * actually hold, not just that the handler runs.
 *
 * Same technique as the original: run the REAL source file under a minimal
 * `Deno` global shim (Node's Request/Response/fetch stand in for Deno's),
 * plus a fake Supabase client substituted for the real `createClient` import
 * so the tests never touch a network or a real project. The fake implements
 * only the exact query shapes this function actually calls — enough to
 * exercise the authorization and rate-limit logic for real, not a paraphrase
 * of it.
 */

type Handler = (req: Request) => Response | Promise<Response>;

let handler: Handler;
const envStore = new Map<string, string>();

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const INVITATION_ID = "22222222-2222-2222-2222-222222222222";
const OWNER_ID = "33333333-3333-3333-3333-333333333333";
const INVITER_ID = "44444444-4444-4444-4444-444444444444";
const OUTSIDER_ID = "55555555-5555-5555-5555-555555555555";
const TOKEN = "the-real-one-time-token";

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Invitation = {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  token_hash: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

let invitation: Invitation;
let auditRows: Array<{ actor_user_id: string; action: string; created_at: string }>;
let currentUserId: string | null;

function freshInvitation(): Invitation {
  return {
    id: INVITATION_ID,
    tenant_id: TENANT_ID,
    email: "invitee@example.com",
    role: "viewer",
    token_hash: "",
    invited_by: INVITER_ID,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    accepted_at: null,
    revoked_at: null,
  };
}

// A tiny fluent builder implementing only what this function's queries need:
// .select().eq().eq()...maybeSingle(), and .insert() for audit_log.
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
      if (name === "invitations") {
        if (filters.id !== invitation.id) return { data: null, error: null };
        return { data: invitation, error: null };
      }
      if (name === "tenant_members") {
        if (filters.user_id === OWNER_ID && filters.status === "active") {
          return { data: { role: "owner" }, error: null };
        }
        return { data: null, error: null };
      }
      if (name === "tenants") {
        return { data: { name: "Acme Workspace" }, error: null };
      }
      return { data: null, error: null };
    },
    // audit_log rate-limit count query — count: "exact", head: true
    then: (resolve: (v: unknown) => void) => {
      const relevant = auditRows.filter(
        (r) => r.action === filters.action && r.actor_user_id === filters.actor_user_id,
      );
      resolve({ count: relevant.length, error: null });
    },
    insert: async (row: { actor_user_id: string; action: string }) => {
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
  auditRows = [];
  invitation = freshInvitation();
  currentUserId = INVITER_ID;
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

function req(body: unknown, auth = "Bearer test-token") {
  return new Request("http://localhost/send-email", {
    method: "POST",
    headers: { Authorization: auth, origin: "https://app.example.com" },
    body: JSON.stringify(body),
  });
}

describe("send-email — RESEND_API_KEY not configured", () => {
  it("no-ops instead of attempting to send, and never touches the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await loadFunction();

    const res = await handler(req({ template: "workspace-invite", invitation_id: INVITATION_ID, token: TOKEN }));

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
});

describe("send-email — with RESEND_API_KEY configured", () => {
  beforeEach(() => {
    envStore.set("RESEND_API_KEY", "test_key_123");
    envStore.set("APP_URL", "https://app.example.com");
    invitation.token_hash = "";
  });

  async function withHash() {
    invitation.token_hash = await sha256Hex(TOKEN);
  }

  it("rejects a request with no Authorization header before touching anything else", async () => {
    await loadFunction();
    const res = await handler(
      req({ template: "workspace-invite", invitation_id: INVITATION_ID, token: TOKEN }, ""),
    );
    expect(res.status).toBe(401);
  });

  it("rejects anything other than the one known template", async () => {
    await loadFunction();
    const res = await handler(req({ template: "arbitrary-marketing-blast", invitation_id: INVITATION_ID }));
    expect(res.status).toBe(400);
  });

  it("rejects a caller-supplied 'to' or 'html' silently — the request shape has no such fields to begin with", async () => {
    // The old vulnerable contract took {to, subject, html} directly. Proving
    // the fix isn't "the field is ignored" but "the field doesn't exist":
    // sending it alongside a valid request must not change who receives it.
    await withHash();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );
    await loadFunction();
    await handler(
      req({
        template: "workspace-invite",
        invitation_id: INVITATION_ID,
        token: TOKEN,
        to: "attacker-chosen@evil.example",
        html: "<script>steal()</script>",
      }),
    );
    const [, init] = fetchSpy.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.to).toBe("invitee@example.com"); // the DB row's email, not the request's
    expect(sentBody.html).not.toContain("<script>");
  });

  it("returns a generic 404 for a wrong token, not a distinct error that would confirm the invitation exists", async () => {
    invitation.token_hash = await sha256Hex("a-different-token");
    await loadFunction();
    const res = await handler(req({ template: "workspace-invite", invitation_id: INVITATION_ID, token: TOKEN }));
    expect(res.status).toBe(404);
  });

  it("returns 404 for an already-accepted invitation rather than sending", async () => {
    await withHash();
    invitation.accepted_at = new Date().toISOString();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await loadFunction();
    const res = await handler(req({ template: "workspace-invite", invitation_id: INVITATION_ID, token: TOKEN }));
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets the original inviter send it", async () => {
    await withHash();
    currentUserId = INVITER_ID;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );
    await loadFunction();
    const res = await handler(req({ template: "workspace-invite", invitation_id: INVITATION_ID, token: TOKEN }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ sent: true });
  });

  it("lets a current workspace owner send it, even if they weren't the one who created it", async () => {
    await withHash();
    currentUserId = OWNER_ID;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email_2" }), { status: 200 }),
    );
    await loadFunction();
    const res = await handler(req({ template: "workspace-invite", invitation_id: INVITATION_ID, token: TOKEN }));
    expect(res.status).toBe(200);
  });

  it("refuses anyone who is neither the inviter nor an owner of the workspace", async () => {
    await withHash();
    currentUserId = OUTSIDER_ID;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await loadFunction();
    const res = await handler(req({ template: "workspace-invite", invitation_id: INVITATION_ID, token: TOKEN }));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rate-limits a caller who has already hit the send cap in the last hour", async () => {
    await withHash();
    currentUserId = INVITER_ID;
    for (let i = 0; i < 20; i++) {
      auditRows.push({ actor_user_id: INVITER_ID, action: "email.invite_sent", created_at: new Date().toISOString() });
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await loadFunction();
    const res = await handler(req({ template: "workspace-invite", invitation_id: INVITATION_ID, token: TOKEN }));
    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("records a real audit_log row for a successful send, attributed to the caller", async () => {
    await withHash();
    currentUserId = INVITER_ID;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email_3" }), { status: 200 }),
    );
    await loadFunction();
    await handler(req({ template: "workspace-invite", invitation_id: INVITATION_ID, token: TOKEN }));
    expect(auditRows).toContainEqual(
      expect.objectContaining({ actor_user_id: INVITER_ID, action: "email.invite_sent" }),
    );
  });
});
