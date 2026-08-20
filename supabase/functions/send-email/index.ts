// send-email — BUG-005 rebuild.
//
// The original version took `to`, `subject` and `html` straight from the
// request body and forwarded them to Resend under this app's own verified
// sending domain: any signed-in user could email arbitrary HTML to any
// address, spoofed as coming from FinRoot. That is why this function has
// never been deployed. This version closes all three holes the bug named:
//
//   - template-id API      — the caller picks a template by name, never
//                             supplies subject/html itself
//   - server-resolved recipient — the address always comes from a database
//                             row this function looks up itself, never from
//                             the request body
//   - per-user rate limit  — piggybacks on `audit_log`, same mechanism
//                             po-auth's lockout already uses (BUG-006)
//
// Still no-ops gracefully when RESEND_API_KEY is not configured. Requires a
// logged-in caller (verify_jwt — no config.toml override, so it defaults on).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const env = (k: string) => Deno.env.get(k) ?? "";

type AdminClient = ReturnType<typeof createClient>;

// Same shape and same tradeoff as po-auth's logAttempt: never let audit
// logging break the actual send, and record the caller as actor_user_id so
// the rate-limit check below can count per-user, not per-recipient (a caller
// who owns several workspaces should not get a bigger budget than one who
// owns a single one).
async function logAttempt(
  admin: AdminClient,
  tenantId: string,
  callerId: string,
  entityId: string,
  outcome: "sent" | "skipped" | "failure",
  metadata: Record<string, unknown> = {},
) {
  try {
    await admin.from("audit_log").insert({
      actor_user_id: callerId,
      tenant_id: tenantId,
      action: "email.invite_sent",
      entity: "invitation",
      entity_id: entityId,
      metadata: { outcome, ...metadata },
    });
  } catch {
    /* never let audit logging break the send */
  }
}

// A legitimate admin might invite several people in one sitting; this is a
// ceiling against abuse, not a normal-use limit. Fails OPEN on a query error
// — same tradeoff po-auth's secretLockedOut makes — because a broken
// rate-limit check degrading to "no limit" is much safer here than degrading
// to "nobody can send an invite", the exact inversion of po-auth's own case
// (there, "everybody can sign in" is the dangerous failure mode; here it
// isn't, since every send below is still gated on a real invitation this
// caller is authorized to see).
const SEND_LIMIT = 20;
const SEND_WINDOW_MIN = 60;

async function rateLimited(admin: AdminClient, callerId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - SEND_WINDOW_MIN * 60_000).toISOString();
    const { count, error } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "email.invite_sent")
      .eq("actor_user_id", callerId)
      .gte("created_at", since);
    if (error) return false;
    return (count ?? 0) >= SEND_LIMIT;
  } catch {
    return false;
  }
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const key = env("RESEND_API_KEY");
  if (!key) return json({ skipped: true, reason: "RESEND_API_KEY not configured" });

  try {
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ error: "unauthorized" }, 401);
    const { data: userRes, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
    const caller = userRes.user;

    const { template, invitation_id, token } = await req.json().catch(() => ({}));

    // A closed set on purpose — adding a template means adding a case here,
    // never accepting caller-supplied subject/html. This is the one real,
    // already-partially-built feature that needs it (WorkspaceManage.tsx's
    // invite flow shows a copyable link today specifically because this
    // function wasn't safe to call; that comment is the reason this
    // template exists rather than a second, speculative one).
    if (template !== "workspace-invite") {
      return json({ error: "Unknown template" }, 400);
    }
    if (typeof invitation_id !== "string" || typeof token !== "string" || !token) {
      return json({ error: "invitation_id and token required" }, 400);
    }

    const { data: inv, error: invErr } = await admin
      .from("invitations")
      .select("id, tenant_id, email, role, token_hash, invited_by, expires_at, accepted_at, revoked_at")
      .eq("id", invitation_id)
      .maybeSingle<Invitation>();
    // One message for a bad id, a bad token, and a dead invitation alike —
    // same reasoning accept_invitation already uses: a distinct answer per
    // case is a free oracle for probing which invitations exist.
    const notFound = () => json({ error: "No such invitation" }, 404);
    if (invErr || !inv) return notFound();
    if ((await sha256Hex(token)) !== inv.token_hash) return notFound();
    if (inv.accepted_at || inv.revoked_at || new Date(inv.expires_at) < new Date()) return notFound();

    // Explicit authorization check — service_role bypasses RLS, so this
    // function is the gate, the same way billing-api's own comment explains
    // for itself (BUG-023). Whoever created the invite, or any current owner
    // of the workspace, may (re)send it; nobody else.
    let authorized = inv.invited_by === caller.id;
    if (!authorized) {
      const { data: membership } = await admin
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", inv.tenant_id)
        .eq("user_id", caller.id)
        .eq("status", "active")
        .maybeSingle<{ role: string }>();
      authorized = membership?.role === "owner";
    }
    if (!authorized) return json({ error: "unauthorized" }, 403);

    if (await rateLimited(admin, caller.id)) {
      return json({ error: `Too many invite emails sent. Try again in ${SEND_WINDOW_MIN} minutes.` }, 429);
    }

    const { data: tenant } = await admin
      .from("tenants")
      .select("name")
      .eq("id", inv.tenant_id)
      .maybeSingle<{ name: string }>();

    const appUrl = env("APP_URL") || req.headers.get("origin") || "";
    if (!appUrl) return json({ error: "APP_URL not configured" }, 500);
    const inviteLink = `${appUrl.replace(/\/$/, "")}/invite/${token}`;
    const workspaceName = tenant?.name || "a FinRoot workspace";

    const subject = `You've been invited to ${workspaceName} on FinRoot`;
    const html =
      `<p>You've been invited to join <strong>${workspaceName}</strong> on FinRoot as a${inv.role === "admin" ? "n" : ""} ${inv.role}.</p>` +
      `<p><a href="${inviteLink}">Accept the invitation</a></p>` +
      `<p>This link expires ${new Date(inv.expires_at).toUTCString()}. If you weren't expecting this, you can ignore it.</p>`;

    const from = env("EMAIL_FROM") || "FinRoot <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: inv.email, subject, html }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      await logAttempt(admin, inv.tenant_id, caller.id, inv.id, "failure", { resendError: out?.message });
      return json({ error: out?.message ?? "send failed" }, 502);
    }

    await logAttempt(admin, inv.tenant_id, caller.id, inv.id, "sent");
    return json({ sent: true, id: out?.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
