import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** Roles that may act on a workspace's billing, weakest first. */
type Role = "viewer" | "admin" | "owner";
const ROLE_RANK: Record<Role, number> = { viewer: 0, admin: 1, owner: 2 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
  if (!token) return json({ error: "unauthorized" }, 401);

  // Service role: RLS does NOT apply below, so every workspace check here is
  // explicit. Nothing may be looked up by user_id alone (BUG-023) — a user who
  // owns two workspaces would otherwise cancel whichever subscription happened
  // to be touched most recently.
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
  const user = userRes.user;

  const envName: "sandbox" | "live" =
    (env("PADDLE_LIVE_API_KEY") && !env("PADDLE_SANDBOX_API_KEY")) ? "live" : "sandbox";

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  /**
   * Which workspace this call is about. The client sends it explicitly; the
   * fallback only resolves when the user belongs to exactly one workspace, so
   * an ambiguous call fails loudly instead of guessing.
   */
  const resolveTenant = async (): Promise<
    { tenantId: string; role: Role } | { error: string; status: number }
  > => {
    const requested =
      (body?.tenant_id as string | undefined) ??
      req.headers.get("x-tenant-id") ??
      new URL(req.url).searchParams.get("tenant_id") ??
      null;

    const { data: memberships, error } = await supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (error) return { error: "membership lookup failed", status: 500 };

    const rows = memberships ?? [];
    if (requested) {
      const hit = rows.find((m) => m.tenant_id === requested);
      // Same answer whether the workspace does not exist or the caller is not
      // in it — membership must not be probeable.
      if (!hit) return { error: "forbidden", status: 403 };
      return { tenantId: hit.tenant_id, role: hit.role as Role };
    }

    if (rows.length === 1) return { tenantId: rows[0].tenant_id, role: rows[0].role as Role };
    if (rows.length === 0) return { error: "forbidden", status: 403 };
    return { error: "tenant_id required", status: 400 };
  };

  const tenant = await resolveTenant();
  if ("error" in tenant) return json({ error: tenant.error }, tenant.status);

  /** Billing actions need more than read access; say so plainly. */
  const requireRole = (min: Role) =>
    ROLE_RANK[tenant.role] >= ROLE_RANK[min]
      ? null
      : json({ error: `only a workspace ${min} can do this` }, 403);

  const loadSubscription = async () => {
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .maybeSingle();
    return data;
  };

  try {
    if (req.method === "GET") {
      const sub = await loadSubscription();

      // Opaque pass-through: forwarded to the client as-is, never inspected here.
      let transactions: unknown[] = [];
      if (sub?.paddle_customer_id) {
        const { json: payload } = await paddleFetch(
          envName,
          `/transactions?customer_id=${sub.paddle_customer_id}&per_page=50&order_by=billed_at[DESC]`
        );
        transactions = Array.isArray(payload?.data) ? payload.data : [];
      }
      return json({
        subscription: sub,
        transactions,
        env: envName,
        tenant_id: tenant.tenantId,
        role: tenant.role,
      });
    }

    if (req.method === "POST") {
      const action = body?.action as string;

      // Spending money is an owner decision; invoices are a financial record an
      // admin may need. A viewer can see the plan but change nothing.
      const minRole: Role = action === "invoice_pdf" ? "admin" : "owner";
      const denied = requireRole(minRole);
      if (denied) return denied;

      const sub = await loadSubscription();
      if (!sub?.paddle_subscription_id) return json({ error: "no subscription" }, 400);

      if (action === "cancel") {
        const { ok, status, json: payload } = await paddleFetch(
          envName,
          `/subscriptions/${sub.paddle_subscription_id}/cancel`,
          { method: "POST", body: JSON.stringify({ effective_from: "next_billing_period" }) }
        );
        return json(payload, ok ? 200 : status);
      }
      if (action === "resume") {
        const { ok, status, json: payload } = await paddleFetch(
          envName,
          `/subscriptions/${sub.paddle_subscription_id}`,
          { method: "PATCH", body: JSON.stringify({ scheduled_change: null }) }
        );
        return json(payload, ok ? 200 : status);
      }
      if (action === "invoice_pdf") {
        const txId = body?.transaction_id as string;
        if (!txId) return json({ error: "missing transaction_id" }, 400);
        // Scoped to this workspace's Paddle customer so one workspace cannot
        // pull another's invoice by guessing a transaction id.
        const { ok, status, json: payload } = await paddleFetch(
          envName,
          `/transactions/${txId}?include=customer`
        );
        if (!ok) return json(payload, status);
        const customerId = payload?.data?.customer_id;
        if (!customerId || customerId !== sub.paddle_customer_id) {
          return json({ error: "forbidden" }, 403);
        }
        const { ok: invOk, status: invStatus, json: invoice } = await paddleFetch(
          envName,
          `/transactions/${txId}/invoice`
        );
        return json(invoice, invOk ? 200 : invStatus);
      }
      return json({ error: "unknown action" }, 400);
    }

    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  } catch (e) {
    console.error("billing-api error", e);
    return json({ error: String(e) }, 500);
  }
});