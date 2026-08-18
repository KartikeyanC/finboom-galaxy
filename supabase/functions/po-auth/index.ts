// po-auth — Product Owner authentication helper.
//   mode "resolve": identifier (email/username/mobile) -> email of a PO account,
//                   so the client can signInWithPassword.
//   mode "secret":  identifier + 16-digit secret -> verifies against the hashed
//                   secret, then mints a one-time magiclink token the client
//                   exchanges via supabase.auth.verifyOtp({ token_hash, type:'magiclink' }).
// Public function (verify_jwt = false). Uses the service-role key server-side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const env = (k: string) => Deno.env.get(k) ?? "";

// BUG-109: no PO sign-in attempt, success or failure, was ever audited —
// po-auth never wrote to audit_log. Inserted directly (service_role has ALL
// on the table) rather than via the log_audit() RPC, because that RPC stamps
// actor_user_id from auth.uid(), which is empty in a service-role context;
// the resolved user_id from po_resolve_identifier/po_verify_secret is the
// only place that identity is actually known here. tenant_id is always NULL
// (po-auth is platform-level), which restricts visibility of these rows to
// platform admins under audit_select's RLS policy.
type AdminClient = ReturnType<typeof createClient>;
async function logAttempt(
  admin: AdminClient,
  step: "resolve" | "secret",
  identifier: string,
  outcome: "success" | "failure",
  userId?: string,
) {
  try {
    await admin.from("audit_log").insert({
      actor_user_id: userId ?? null,
      tenant_id: null,
      action: `po.auth.${step}`,
      entity: "platform_admin",
      entity_id: userId ?? identifier,
      metadata: { outcome, identifier },
    });
  } catch {
    // Never let audit logging break sign-in.
  }
}

// BUG-006: po_verify_secret had no rate limit, no lockout, no attempt
// counter of any kind — a 16-digit secret that grants platform admin was
// brute-forceable (confirmed live three times: BUG-006/007's original code
// audit, AUTH-021/BUG-101's 20-attempt run against signInWithPassword, and
// PO-004's 30-attempt run against this exact endpoint, 22s, zero throttling).
// Piggybacks on BUG-109's audit_log rows rather than a new table: every
// failed "secret" attempt is already logged with the identifier in
// `metadata`, so counting recent failures for one identifier is a single
// read. Fails OPEN on a query error, matching logAttempt's own tradeoff —
// a broken lockout check should degrade to "no lockout", never to
// "nobody can sign in".
const SECRET_LOCKOUT_THRESHOLD = 5;
const SECRET_LOCKOUT_WINDOW_MIN = 15;

async function secretLockedOut(admin: AdminClient, identifier: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - SECRET_LOCKOUT_WINDOW_MIN * 60_000).toISOString();
    const { count, error } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "po.auth.secret")
      .eq("metadata->>outcome", "failure")
      .eq("metadata->>identifier", identifier)
      .gte("created_at", since);
    if (error) return false;
    return (count ?? 0) >= SECRET_LOCKOUT_THRESHOLD;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { mode, identifier, secret } = await req.json().catch(() => ({}));

    if (!identifier || typeof identifier !== "string") {
      return json({ error: "Identifier required" }, 400);
    }

    if (mode === "resolve") {
      const { data, error } = await admin.rpc("po_resolve_identifier", { p_identifier: identifier });
      if (error) return json({ error: error.message }, 500);
      const row = Array.isArray(data) ? data[0] : data;
      // BUG-007 — a PO identifier used to get 200 + email, anything else a
      // 404 with a distinct body: a free, scriptable oracle for "is this
      // identifier a Product Owner" with no secret required at all. Both
      // branches now return the same status and the same shape; the caller
      // (PoLogin.tsx) already treats a falsy `email` as failure uniformly,
      // so nothing downstream needed to change to make this safe.
      if (!row?.email) {
        await logAttempt(admin, "resolve", identifier, "failure");
        return json({ email: null });
      }
      await logAttempt(admin, "resolve", identifier, "success", row.user_id);
      return json({ email: row.email });
    }

    if (mode === "secret") {
      if (!/^[0-9]{16}$/.test(secret ?? "")) {
        return json({ error: "Secret must be 16 digits" }, 400);
      }
      if (await secretLockedOut(admin, identifier)) {
        return json(
          { error: `Too many failed attempts. Try again in ${SECRET_LOCKOUT_WINDOW_MIN} minutes.` },
          429,
        );
      }
      const { data, error } = await admin.rpc("po_verify_secret", {
        p_identifier: identifier,
        p_secret: secret,
      });
      if (error) return json({ error: error.message }, 500);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.email) {
        await logAttempt(admin, "secret", identifier, "failure");
        return json({ error: "Invalid secret access code" }, 401);
      }
      await logAttempt(admin, "secret", identifier, "success", row.user_id);

      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: row.email,
      });
      if (linkErr) return json({ error: linkErr.message }, 500);
      return json({
        email: row.email,
        token_hash: link?.properties?.hashed_token,
      });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
