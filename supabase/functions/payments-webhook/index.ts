import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paddle-signature",
};

const env = (k: string) => Deno.env.get(k) ?? "";

async function verifyPaddleSignature(rawBody: string, signatureHeader: string, secret: string) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  );
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;
  const signedPayload = `${ts}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === h1;
}

function intervalLabel(billingCycle: any): string | null {
  if (!billingCycle?.interval) return null;
  const { interval, frequency } = billingCycle;
  if (frequency === 1) return interval;
  return `${frequency} ${interval}s`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const envName = url.searchParams.get("env") === "live" ? "live" : "sandbox";
  const webhookSecret =
    envName === "live" ? env("PAYMENTS_LIVE_WEBHOOK_SECRET") : env("PAYMENTS_SANDBOX_WEBHOOK_SECRET");

  const raw = await req.text();
  const sig = req.headers.get("paddle-signature") ?? "";

  const valid = await verifyPaddleSignature(raw, sig, webhookSecret);
  if (!valid) {
    console.warn("Invalid Paddle signature", { envName });
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  const type = event?.event_type as string;
  const data = event?.data ?? {};
  console.log("paddle event", type);

  try {
    if (type?.startsWith("subscription.")) {
      const userId = data?.custom_data?.user_id ?? null;
      if (!userId) {
        console.warn("subscription event without user_id in custom_data", { type, id: data?.id });
        return new Response("ok", { headers: corsHeaders });
      }
      const item = data?.items?.[0];
      const price = item?.price;
      const payload = {
        user_id: userId,
        paddle_subscription_id: data?.id,
        paddle_customer_id: data?.customer_id,
        paddle_price_id: price?.id,
        paddle_product_id: price?.product_id,
        plan_name: price?.name ?? price?.description ?? null,
        status: data?.status ?? "active",
        currency: data?.currency_code ?? "USD",
        unit_amount: price?.unit_price?.amount ? Number(price.unit_price.amount) / 100 : null,
        billing_interval: intervalLabel(price?.billing_cycle),
        current_period_start: data?.current_billing_period?.starts_at ?? null,
        current_period_end: data?.current_billing_period?.ends_at ?? null,
        cancel_at: data?.scheduled_change?.action === "cancel" ? data?.scheduled_change?.effective_at : null,
        canceled_at: data?.canceled_at ?? null,
        raw: data,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("subscriptions")
        .upsert(payload, { onConflict: "paddle_subscription_id" });
      if (error) console.error("upsert subscription error", error);
    } else if (type === "transaction.completed" || type === "transaction.payment_failed") {
      // No-op: invoices are fetched live from Paddle API on the billing page.
      console.log("transaction event noted", data?.id);
    }
  } catch (e) {
    console.error("webhook handler error", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});