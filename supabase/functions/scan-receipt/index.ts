// scan-receipt — reads one or more receipt/invoice photos (already ordered by
// the caller, for a receipt shot across several images) and returns
// structured line items via Gemini vision. Requires a signed-in user
// (verify_jwt = true); the client never sees GEMINI_API_KEY.
//
// Rate-limited per workspace via audit_log, same pattern as po-auth's
// secretLockedOut(): fails OPEN on a query error (a broken limiter should
// degrade to "allow", never "nobody can scan a receipt").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Kept in sync by hand with src/lib/categories.ts's EXPENSE_COLORS keys and
// BillScan.tsx's UNITS — this is a separate Deno runtime, it cannot import
// those files directly.
const CATEGORIES = [
  "Food & Dining", "Travel & Transport", "Transport", "Shopping", "Healthcare",
  "Education", "Travel", "Subscriptions", "Utilities", "Rent", "Personal Care", "Entertainment",
] as const;
const UNITS = ["pc", "pk", "kg", "g", "L", "ml"] as const;

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ~8MB raw per image, before base64 overhead
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const DAILY_LIMIT = 30;

type AdminClient = ReturnType<typeof createClient>;

async function scanRateLimited(admin: AdminClient, tenantId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "billscan.request")
      .eq("tenant_id", tenantId)
      .gte("created_at", since);
    if (error) return false;
    return (count ?? 0) >= DAILY_LIMIT;
  } catch {
    return false;
  }
}

async function logScan(admin: AdminClient, tenantId: string, userId: string, imageCount: number, itemCount: number | null) {
  try {
    // Deliberately no merchant/amount/category here — audit_log is readable
    // by platform admins, and CLAUDE.md's own rule is "PO reads aggregates
    // only, never an amount, description or category." A request footprint
    // (counts only) is enough to run the rate limiter and debug abuse.
    await admin.from("audit_log").insert({
      actor_user_id: userId,
      tenant_id: tenantId,
      action: "billscan.request",
      entity: "receipt_scan",
      entity_id: null,
      metadata: { image_count: imageCount, item_count: itemCount },
    });
  } catch {
    // Never let audit logging break a scan.
  }
}

const GEMINI_MODEL = "gemini-2.5-flash";

function buildSchema() {
  return {
    type: "OBJECT",
    properties: {
      merchant: { type: "STRING" },
      date: { type: "STRING", nullable: true, description: "YYYY-MM-DD if printed, else null" },
      currency: { type: "STRING", description: "3-letter code, e.g. INR" },
      subtotal: { type: "NUMBER", nullable: true },
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            qty: { type: "NUMBER" },
            unit: { type: "STRING", enum: [...UNITS] },
            unitPrice: { type: "NUMBER" },
            amount: { type: "NUMBER" },
            category: { type: "STRING", enum: [...CATEGORIES] },
          },
          required: ["name", "qty", "unit", "unitPrice", "amount", "category"],
        },
      },
      taxLines: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { label: { type: "STRING" }, amount: { type: "NUMBER" } },
          required: ["label", "amount"],
        },
      },
      total: { type: "NUMBER" },
    },
    required: ["merchant", "currency", "items", "taxLines", "total"],
  };
}

const PROMPT = `You are reading a shopping or restaurant receipt / tax invoice. The images given are sequential parts of ONE single receipt, in the order provided (if there is only one image, it is the whole receipt).

Extract every line item exactly as printed — do not invent items that are not printed, and do not skip any printed item. For each item:
- name: the item's description as printed, cleaned of stray OCR artifacts.
- qty: the quantity as a number. If not explicit, use 1.
- unit: your best guess of the unit of measure, using ONLY one of: pc, pk, kg, g, L, ml. Use "pc" for countable items (dishes, packaged/counted goods) unless the receipt clearly states a weight or volume.
- unitPrice: price per unit as printed. If only a line total is printed, compute unitPrice = amount / qty.
- amount: the line total as printed.
- category: the SINGLE best-matching category, using one of these exact strings (choose the closest match; default to "Shopping" only if truly unclear): ${CATEGORIES.join(", ")}.

Also extract:
- merchant: the business/store name printed on the receipt.
- date: the transaction date as YYYY-MM-DD if present, else null.
- currency: the 3-letter currency code if determinable, else "INR".
- subtotal: the pre-tax subtotal if printed, else null.
- taxLines: any tax / service-charge / discount lines printed separately from the items (e.g. CGST, SGST, GST, VAT, Service Charge, Discount). Use a negative amount for a discount.
- total: the final total amount actually charged, as printed.

Return only the structured data described by the schema.`;

interface ImageInput {
  data: string; // base64, no data: prefix
  mimeType: string;
}

async function callGemini(images: ImageInput[]): Promise<unknown> {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("Receipt scanning is not configured (missing GEMINI_API_KEY)");

  const parts = [
    ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
    { text: PROMPT },
  ];

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: buildSchema(),
          temperature: 0.1,
        },
      }),
    },
  );

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`Gemini request failed (${resp.status}): ${errBody.slice(0, 300)}`);
  }
  const payload = await resp.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini returned no extractable content");
  return JSON.parse(text);
}

/** Defense in depth — responseSchema is usually reliable, but never trust an
 * external API's output blindly before it reaches the client. */
function validateResult(raw: unknown): {
  merchant: string; date: string | null; currency: string; subtotal: number | null;
  items: { name: string; qty: number; unit: string; unitPrice: number; amount: number; category: string }[];
  taxLines: { label: string; amount: number }[];
  total: number;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.merchant !== "string" || typeof r.total !== "number" || !Array.isArray(r.items) || !Array.isArray(r.taxLines)) {
    return null;
  }
  const items = r.items.filter((it): it is Record<string, unknown> => !!it && typeof it === "object").map((it) => ({
    name: typeof it.name === "string" ? it.name : "Item",
    qty: typeof it.qty === "number" && it.qty > 0 ? it.qty : 1,
    unit: UNITS.includes(it.unit as typeof UNITS[number]) ? (it.unit as string) : "pc",
    unitPrice: typeof it.unitPrice === "number" ? it.unitPrice : 0,
    amount: typeof it.amount === "number" ? it.amount : 0,
    category: CATEGORIES.includes(it.category as typeof CATEGORIES[number]) ? (it.category as string) : "Shopping",
  }));
  const taxLines = r.taxLines.filter((t): t is Record<string, unknown> => !!t && typeof t === "object").map((t) => ({
    label: typeof t.label === "string" ? t.label : "Tax",
    amount: typeof t.amount === "number" ? t.amount : 0,
  }));
  return {
    merchant: r.merchant,
    date: typeof r.date === "string" ? r.date : null,
    currency: typeof r.currency === "string" ? r.currency : "INR",
    subtotal: typeof r.subtotal === "number" ? r.subtotal : null,
    items,
    taxLines,
    total: r.total,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
  const user = userRes.user;

  try {
    const body = await req.json().catch(() => ({}));
    const images = Array.isArray(body?.images) ? body.images : [];
    const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : null;

    if (!tenantId) return json({ error: "tenant_id required" }, 400);
    if (!images.length) return json({ error: "At least one image is required" }, 400);
    if (images.length > MAX_IMAGES) return json({ error: `At most ${MAX_IMAGES} images per scan` }, 400);

    // Membership check — same "explicit, RLS does not apply under service_role"
    // reasoning as billing-api's resolveTenant().
    const { data: membership } = await admin
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) return json({ error: "forbidden" }, 403);

    for (const img of images) {
      if (typeof img?.data !== "string" || typeof img?.mimeType !== "string") {
        return json({ error: "Malformed image payload" }, 400);
      }
      if (!ALLOWED_MIME.has(img.mimeType)) {
        return json({ error: `Unsupported image type: ${img.mimeType}. Use JPG, PNG or WEBP.` }, 400);
      }
      // base64 is ~4/3 the raw size; this is an approximate but sufficient guard.
      if (img.data.length > (MAX_IMAGE_BYTES * 4) / 3) {
        return json({ error: "One of the images is too large (8MB limit each)" }, 400);
      }
    }

    if (await scanRateLimited(admin, tenantId)) {
      return json({ error: `Daily scan limit reached (${DAILY_LIMIT}/day). Try again tomorrow.` }, 429);
    }

    const raw = await callGemini(images as ImageInput[]);
    const result = validateResult(raw);
    if (!result) return json({ error: "Could not read that receipt — try a clearer photo" }, 422);

    await logScan(admin, tenantId, user.id, images.length, result.items.length);
    return json(result);
  } catch (e) {
    console.error("scan-receipt error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
