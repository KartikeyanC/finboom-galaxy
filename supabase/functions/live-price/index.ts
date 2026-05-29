const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function yahoo(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === "number" && Number.isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

async function mf(code: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.mfapi.in/mf/${code}/latest`);
    if (!r.ok) return null;
    const j = await r.json();
    const nav = parseFloat(j?.data?.[0]?.nav);
    return Number.isFinite(nav) ? nav : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider");
    const symbol = url.searchParams.get("symbol") ?? "";
    let price: number | null = null;
    if (provider === "yahoo") price = await yahoo(symbol);
    else if (provider === "mf") price = await mf(symbol);
    return new Response(JSON.stringify({ price }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ price: null, error: String(e) }), {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
});