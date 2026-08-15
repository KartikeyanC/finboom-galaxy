// send-email — best-effort transactional email via Resend.
// No-ops gracefully when RESEND_API_KEY is not configured, so the app keeps
// working before email is set up. Requires a logged-in caller (verify_jwt).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const env = (k: string) => Deno.env.get(k) ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const key = env("RESEND_API_KEY");
  if (!key) return json({ skipped: true, reason: "RESEND_API_KEY not configured" });

  try {
    const { to, subject, html } = await req.json().catch(() => ({}));
    if (!to || !subject) return json({ error: "to and subject required" }, 400);
    const from = env("EMAIL_FROM") || "FinRoot <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html: html ?? subject }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: out?.message ?? "send failed" }, 502);
    return json({ sent: true, id: out?.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
