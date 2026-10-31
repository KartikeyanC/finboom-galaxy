import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aaVendorFromEnv } from "../_shared/ingest/aa_vendor.ts";
import { handleAaWebhook } from "./handler.ts";

// Stage 7 — Account Aggregator webhook. Server-to-server only: no CORS
// headers, no browser ever calls this. Deploy with --no-verify-jwt (the vendor
// has no Supabase session); the HMAC signature is the gate.
//
// Secrets: AA_WEBHOOK_SECRET (required — without it every call is 401), and
// for data fetches AA_VENDOR=setu, AA_BASE_URL, AA_CLIENT_ID,
// AA_CLIENT_SECRET, AA_PRODUCT_INSTANCE_ID. Unset = AA switched off.

const env = (k: string) => Deno.env.get(k) ?? "";

Deno.serve(async (req) => {
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  try {
    return await handleAaWebhook(req, {
      secret: env("AA_WEBHOOK_SECRET"),
      now: () => new Date(),
      vendor: aaVendorFromEnv(env),
      // Never detach .rpc from its client (CLAUDE.md).
      rpc: { rpc: (fn, args) => supabase.rpc(fn, args) },
      findRoute: async (consentId) => {
        const { data, error } = await supabase
          .from("ingest_routes")
          .select("tenant_id, user_id")
          .eq("source", "aa")
          .eq("route_key", consentId)
          .eq("active", true)
          .maybeSingle();
        if (error) throw new Error(`route lookup failed: ${error.message}`);
        return data ? { tenantId: data.tenant_id, userId: data.user_id } : null;
      },
      deactivateRoute: async (consentId) => {
        const { error } = await supabase
          .from("ingest_routes")
          .update({ active: false, revoked_at: new Date().toISOString() })
          .eq("source", "aa")
          .eq("route_key", consentId)
          .eq("active", true);
        if (error) throw new Error(`route deactivate failed: ${error.message}`);
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
        // 23505: a concurrent delivery got there first — the work is done either way.
        if (error && error.code !== "23505") throw new Error(`dedup insert failed: ${error.message}`);
      },
      // Counts and states only — never amounts, narrations or account numbers.
      log: (msg, meta) => console.log(msg, meta ?? {}),
    });
  } catch (e) {
    console.error("aa-webhook error", String(e));
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
