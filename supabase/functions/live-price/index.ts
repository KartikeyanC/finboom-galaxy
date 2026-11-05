// Stage 4.3 / BUG-044 · PERF-006 — batched, cached price proxy.
//
// Was: one invocation per holding per minute per tab, straight through to
// Yahoo/mfapi with no cache. 30 holdings = 43 200 invocations a day per tab.
//
// Now: the client sends every symbol it needs in ONE request; anything still
// fresh in `price_cache` is served from there, and only genuine misses go
// upstream — in parallel, deduped. A portfolio that is polled every 60 s now
// costs one invocation a minute regardless of size, and mutual funds (whose
// NAV publishes once a day) go upstream at most once in 24 h.
//
// The GET form is kept for one-off manual checks and older clients.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { metered } from "../_shared/usage.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Provider = "yahoo" | "mf";

/** Yahoo quotes move all day; an mfapi NAV publishes once, after market close. */
const TTL_MS: Record<Provider, number> = {
  yahoo: 60_000,
  mf: 24 * 60 * 60 * 1000,
};

/** A single tab asks for one symbol per holding — this is a sanity bound, not a quota. */
const MAX_SYMBOLS = 100;

const isProvider = (v: unknown): v is Provider => v === "yahoo" || v === "mf";
const keyOf = (provider: Provider, symbol: string) => `${provider}:${symbol}`;

async function yahoo(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

async function mf(code: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}/latest`);
    if (!r.ok) return null;
    const j = await r.json();
    const nav = parseFloat(j?.data?.[0]?.nav);
    return Number.isFinite(nav) && nav > 0 ? nav : null;
  } catch {
    return null;
  }
}

function fetchUpstream(provider: Provider, symbol: string): Promise<number | null> {
  return provider === "yahoo" ? yahoo(symbol) : mf(symbol);
}

// --------- Search by name (the Add Investment dialog) ---------
//
// The same two upstreams, asked for names instead of prices, so a holding
// can get its ticker or scheme code without the person knowing it. The
// browser's CSP only allows Supabase, which is why this lives here and not
// in the client. Nothing is cached: a search is one request per pause in
// typing, and the answers change as listings do.

interface SearchHit {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
}

const MAX_QUERY = 60;
const MAX_HITS = 10;

async function yahooSearch(q: string): Promise<SearchHit[]> {
  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}` +
        `&quotesCount=${MAX_HITS}&newsCount=0&listsCount=0`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!r.ok) return [];
    const j = await r.json();
    const quotes: unknown[] = Array.isArray(j?.quotes) ? j.quotes : [];
    const out: SearchHit[] = [];
    for (const q of quotes) {
      const quote = q as Record<string, unknown>;
      const symbol = String(quote.symbol ?? "").trim();
      const name = String(quote.longname ?? quote.shortname ?? "").trim();
      if (!symbol || !name) continue;
      out.push({
        symbol,
        name,
        exchange: String(quote.exchDisp ?? quote.exchange ?? ""),
        type: String(quote.quoteType ?? ""),
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function mfSearch(q: string): Promise<SearchHit[]> {
  try {
    const r = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const j = await r.json();
    const rows: unknown[] = Array.isArray(j) ? j : [];
    const out: SearchHit[] = [];
    for (const row of rows.slice(0, MAX_HITS)) {
      const scheme = row as Record<string, unknown>;
      const symbol = String(scheme.schemeCode ?? "").trim();
      const name = String(scheme.schemeName ?? "").trim();
      if (symbol && name) out.push({ symbol, name });
    }
    return out;
  } catch {
    return [];
  }
}

function parseSearch(body: unknown): { provider: Provider; q: string } | null {
  const raw = (body as { search?: unknown })?.search as
    | { provider?: unknown; q?: unknown }
    | undefined;
  if (!raw) return null;
  const q = String(raw.q ?? "").trim().slice(0, MAX_QUERY);
  if (!isProvider(raw.provider) || q.length < 2) return null;
  return { provider: raw.provider, q };
}

/**
 * service_role, because `price_cache` has RLS on with no policies — the cache
 * is deliberately unreachable from the browser. This client is used ONLY for
 * that table; it never touches tenant data.
 */
function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface Want {
  provider: Provider;
  symbol: string;
}

interface Row {
  key: string;
  provider: string;
  symbol: string;
  price: number;
  fetched_at: string;
}

async function resolve(wants: Want[]): Promise<{
  prices: Record<string, number | null>;
  cached: number;
  fetched: number;
  stale: number;
}> {
  // Two holdings of the same stock must not become two upstream calls.
  const unique = new Map<string, Want>();
  for (const w of wants) unique.set(keyOf(w.provider, w.symbol), w);

  const prices: Record<string, number | null> = {};
  const db = admin();
  const now = Date.now();

  let rows: Row[] = [];
  if (db && unique.size) {
    const { data } = await db
      .from("price_cache")
      .select("key, provider, symbol, price, fetched_at")
      .in("key", [...unique.keys()]);
    rows = (data ?? []) as Row[];
  }
  const cache = new Map(rows.map((r) => [r.key, r]));

  const misses: Want[] = [];
  let cached = 0;
  for (const [key, want] of unique) {
    const hit = cache.get(key);
    const age = hit ? now - new Date(hit.fetched_at).getTime() : Infinity;
    if (hit && age < TTL_MS[want.provider]) {
      prices[key] = Number(hit.price);
      cached++;
    } else {
      misses.push(want);
    }
  }

  // Misses go upstream together, not one request after another.
  const results = await Promise.all(
    misses.map(async (w) => ({ w, price: await fetchUpstream(w.provider, w.symbol) })),
  );

  const fresh: Row[] = [];
  let fetched = 0;
  let stale = 0;
  for (const { w, price } of results) {
    const key = keyOf(w.provider, w.symbol);
    if (price !== null) {
      prices[key] = price;
      fetched++;
      fresh.push({
        key,
        provider: w.provider,
        symbol: w.symbol,
        price,
        fetched_at: new Date().toISOString(),
      });
    } else {
      // Upstream failed. A stale price is far better than nothing: without it
      // the UI silently falls back to the stored book value, which reads as
      // "the market did not move" rather than "we could not reach the market".
      const hit = cache.get(key);
      prices[key] = hit ? Number(hit.price) : null;
      if (hit) stale++;
    }
  }

  if (db && fresh.length) {
    await db.from("price_cache").upsert(fresh, { onConflict: "key" });
  }

  return { prices, cached, fetched, stale };
}

function parseWants(body: unknown): Want[] {
  const raw = (body as { symbols?: unknown })?.symbols;
  if (!Array.isArray(raw)) return [];
  const out: Want[] = [];
  for (const item of raw.slice(0, MAX_SYMBOLS)) {
    const provider = (item as Want)?.provider;
    const symbol = String((item as Want)?.symbol ?? "").trim();
    if (isProvider(provider) && symbol) out.push({ provider, symbol });
  }
  return out;
}

Deno.serve(metered("live-price", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "content-type": "application/json" },
    });

  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const search = parseSearch(body);
      if (search) {
        const results = search.provider === "mf"
          ? await mfSearch(search.q)
          : await yahooSearch(search.q);
        return json({ results });
      }
      const wants = parseWants(body);
      if (!wants.length) return json({ prices: {}, cached: 0, fetched: 0, stale: 0 });
      return json(await resolve(wants));
    }

    // Single-symbol GET — kept for manual checks and pre-4.3 clients. Same
    // cache path, so it costs no more than a batch of one.
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider");
    const symbol = url.searchParams.get("symbol") ?? "";
    if (!isProvider(provider) || !symbol) return json({ price: null });
    const { prices } = await resolve([{ provider, symbol }]);
    return json({ price: prices[keyOf(provider, symbol)] ?? null });
  } catch (e) {
    return json({ prices: {}, price: null, error: String(e) });
  }
}));
