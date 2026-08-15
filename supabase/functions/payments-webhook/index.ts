import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paddle-signature",
};

const env = (k: string) => Deno.env.get(k) ?? "";

// BUG-008 — three independent gaps closed here:
//   (a) `hex === h1` short-circuits on the first differing byte, so response
//       timing leaks how many leading hex digits an attacker's guess got
//       right. Compared with a fixed-time XOR-accumulate instead.
//   (b) no `ts` freshness check at all, so a signature captured once (e.g.
//       from a compromised logging pipe, or a MITM before TLS termination)
//       stayed valid forever and could be replayed indefinitely.
//   (c) no dedup, so even a *fresh* replay within the ts window re-applied
//       the same subscription event repeatedly — harmless for an idempotent
//       upsert today, but the field this fixes is the trust boundary, not
//       today's specific handler.
// Paddle's own webhook docs recommend a 5-minute tolerance window.
const TS_TOLERANCE_SECONDS = 300;

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyPaddleSignature(rawBody: string, signatureHeader: string, secret: string) {
  if (!signatureHeader || !secret) return { valid: false as const };
  const parts = Object.fromEntries(
    signatureHeader.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  );
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return { valid: false as const };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > TS_TOLERANCE_SECONDS) {
    return { valid: false as const, reason: "stale-ts" as const };
  }

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
  return { valid: timingSafeEqualHex(hex, h1) };
}

// Structural types for the subset of the Paddle webhook payload we read.
// Everything is optional: Paddle sends different shapes per event type.
interface PaddleBillingCycle {
  interval?: string;
  frequency?: number;
}

interface PaddlePrice {
  id?: string;
  name?: string;
  description?: string;
  product_id?: string;
  unit_price?: { amount?: string | number };
  billing_cycle?: PaddleBillingCycle;
}

interface PaddleEventData {
  id?: string;
  custom_data?: { user_id?: string | null; tenant_id?: string | null } | null;
  items?: Array<{ price?: PaddlePrice }>;
  status?: string;
  currency_code?: string;
  customer_id?: string;
  current_billing_period?: { starts_at?: string | null; ends_at?: string | null } | null;
  scheduled_change?: { action?: string; effective_at?: string | null } | null;
  canceled_at?: string | null;
  [key: string]: unknown;
}

interface PaddleEvent {
  event_id?: string;
  event_type?: string;
  data?: PaddleEventData;
}

function intervalLabel(billingCycle: PaddleBillingCycle | null | undefined): string | null {
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

  const verification = await verifyPaddleSignature(raw, sig, webhookSecret);
  if (!verification.valid) {
    console.warn("Invalid Paddle signature", { envName, reason: verification.reason ?? "bad-signature" });
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(raw) as PaddleEvent;
  } catch {
    return new Response("bad json", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  // Dedup AFTER the signature is verified (an unauthenticated caller must
  // never get to poison this table) and BEFORE any side effect. Paddle can
  // and does redeliver a genuinely fresh, validly-signed event on its own
  // retry schedule; `event_id` is the only thing that tells two deliveries
  // of the SAME event apart from two different events sent within the same
  // ts window.
  const eventId = event?.event_id;
  if (eventId) {
    const { error: dedupError } = await supabase
      .from("processed_webhooks")
      .insert({ event_id: eventId });
    if (dedupError) {
      // Unique violation = already processed; anything else is a real
      // failure and should not be swallowed as "duplicate".
      if (dedupError.code === "23505") {
        console.log("duplicate webhook ignored", { eventId });
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("processed_webhooks insert error", dedupError);
      return new Response("error", { status: 500, headers: corsHeaders });
    }
  }

  const type = event?.event_type as string;
  const data = event?.data ?? {};
  console.log("paddle event", type);

  try {
    if (type?.startsWith("subscription.")) {
      const userId = data?.custom_data?.user_id ?? null;
      let tenantId = data?.custom_data?.tenant_id ?? null;

      // Resolve the tenant from custom_data, else from the user's owner membership.
      if (!tenantId && userId) {
        const { data: m } = await supabase
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", userId)
          .eq("role", "owner")
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        tenantId = m?.tenant_id ?? null;
      }
      if (!tenantId) {
        console.warn("subscription event without resolvable tenant", { type, id: data?.id });
        return new Response("ok", { headers: corsHeaders });
      }

      const item = data?.items?.[0];
      const price = item?.price;

      // Map the Paddle price id to one of our plans (if configured).
      let planId: string | null = null;
      let planName: string | null = price?.name ?? price?.description ?? null;
      if (price?.id) {
        const { data: plan } = await supabase
          .from("plans")
          .select("id, name")
          .eq("paddle_price_id", price.id)
          .maybeSingle();
        if (plan) {
          planId = plan.id;
          planName = plan.name;
        }
      }

      const payload = {
        tenant_id: tenantId,
        user_id: userId,
        plan_id: planId,
        provider: "paddle",
        paddle_subscription_id: data?.id,
        paddle_customer_id: data?.customer_id,
        paddle_price_id: price?.id,
        paddle_product_id: price?.product_id,
        plan_name: planName,
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

      // One row per tenant: the signup Free row is upgraded in place.
      const { error } = await supabase
        .from("subscriptions")
        .upsert(payload, { onConflict: "tenant_id" });
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