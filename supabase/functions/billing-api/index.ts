import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const env = (k: string) => Deno.env.get(k) ?? "";

function paddleBase(envName: "sandbox" | "live") {
  return envName === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

function getApiCreds(envName: "sandbox" | "live") {
  const key = envName === "live" ? env("PADDLE_LIVE_API_KEY") : env("PADDLE_SANDBOX_API_KEY");
  return { key, base: paddleBase(envName) };
}

async function paddleFetch(envName: "sandbox" | "live", path: string, init: RequestInit = {}) {
  const { key, base } = getApiCreds(envName);
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const user = userRes.user;

  const envName: "sandbox" | "live" =
    (env("PADDLE_LIVE_API_KEY") && !env("PADDLE_SANDBOX_API_KEY")) ? "live" : "sandbox";

  try {
    if (req.method === "GET") {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let transactions: any[] = [];
      if (sub?.paddle_customer_id) {
        const { json } = await paddleFetch(
          envName,
          `/transactions?customer_id=${sub.paddle_customer_id}&per_page=50&order_by=billed_at[DESC]`
        );
        transactions = Array.isArray(json?.data) ? json.data : [];
      }
      return new Response(JSON.stringify({ subscription: sub, transactions, env: envName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action as string;

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub?.paddle_subscription_id) {
        return new Response(JSON.stringify({ error: "no subscription" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "cancel") {
        const { ok, status, json } = await paddleFetch(
          envName,
          `/subscriptions/${sub.paddle_subscription_id}/cancel`,
          { method: "POST", body: JSON.stringify({ effective_from: "next_billing_period" }) }
        );
        return new Response(JSON.stringify(json), {
          status: ok ? 200 : status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (action === "resume") {
        const { ok, status, json } = await paddleFetch(
          envName,
          `/subscriptions/${sub.paddle_subscription_id}`,
          { method: "PATCH", body: JSON.stringify({ scheduled_change: null }) }
        );
        return new Response(JSON.stringify(json), {
          status: ok ? 200 : status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (action === "invoice_pdf") {
        const txId = body?.transaction_id as string;
        if (!txId) {
          return new Response(JSON.stringify({ error: "missing transaction_id" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { ok, status, json } = await paddleFetch(envName, `/transactions/${txId}/invoice`);
        return new Response(JSON.stringify(json), {
          status: ok ? 200 : status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  } catch (e) {
    console.error("billing-api error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});