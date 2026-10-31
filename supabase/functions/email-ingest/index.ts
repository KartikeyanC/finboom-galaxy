import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleEmailIngest } from "./handler.ts";

// Stage 7 — inbound e-mail parser webhook. Server-to-server only: no CORS
// headers. Deploy with --no-verify-jwt; each call carries its route's secret
// as a Bearer token instead (see handler.ts).
//
// Optional secret: EMAIL_INGEST_ALLOWED_DOMAINS — comma-separated sender
// domains to accept on top of the built-in bank list.

const env = (k: string) => Deno.env.get(k) ?? "";

Deno.serve(async (req) => {
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  try {
    return await handleEmailIngest(req, {
      now: () => new Date(),
      // Never detach .rpc from its client (CLAUDE.md).
      rpc: { rpc: (fn, args) => supabase.rpc(fn, args) },
      findRoute: async (routeKey) => {
        const { data, error } = await supabase
          .from("ingest_routes")
          .select("tenant_id, user_id, secret_hash")
          .eq("source", "email")
          .eq("route_key", routeKey)
          .eq("active", true)
          .maybeSingle();
        if (error) throw new Error(`route lookup failed: ${error.message}`);
        return data?.secret_hash
          ? { tenantId: data.tenant_id, userId: data.user_id, secretHash: data.secret_hash }
          : null;
      },
      wasProcessed: async (id) => {
        const { data, error } = await supabase
          .from("processed_webhooks")
          .select("event_id")
          .eq("event_id", id)
          .maybeSingle();
        if (error) throw new Error(`dedup lookup failed: ${error.message}`);
        return !!data;
      },
      markProcessed: async (id) => {
        const { error } = await supabase.from("processed_webhooks").insert({ event_id: id });
        if (error && error.code !== "23505") throw new Error(`dedup insert failed: ${error.message}`);
      },
      extraDomains: env("EMAIL_INGEST_ALLOWED_DOMAINS").split(",").filter(Boolean),
      // Counts only — never amounts, senders' addresses or message text.
      log: (msg, meta) => console.log(msg, meta ?? {}),
    });
  } catch (e) {
    console.error("email-ingest error", String(e));
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
