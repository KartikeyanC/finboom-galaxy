-- Stage 4.3 / BUG-044 · PERF-006 — shared cache for live market prices.
--
-- `livePrices.ts` fired one edge-function invocation PER HOLDING, PER 60 s,
-- PER OPEN TAB, unbatched and uncached. 30 holdings = 43 200 invocations a day
-- from a single tab, each one also making an outbound call to Yahoo or mfapi.
-- Mutual-fund NAV publishes once a day and was being polled 1 440 times.
--
-- The obvious fix is an in-memory cache inside the edge function, and it does
-- not work here: Deno Deploy isolates are ephemeral and there are many of them,
-- so with polls a minute apart the isolate has usually been recycled and the
-- cache is cold exactly when it is needed. This table is the shared, durable
-- cache instead — one row per (provider, symbol), read and written only by the
-- edge function.

create table if not exists public.price_cache (
  -- `provider:symbol`, so a batch lookup is a single `where key in (...)`
  -- instead of a per-row OR chain over two columns.
  key         text primary key,
  provider    text        not null check (provider in ('yahoo', 'mf')),
  symbol      text        not null,
  price       numeric     not null check (price > 0),
  fetched_at  timestamptz not null default now()
);

comment on table public.price_cache is
  'Stage 4.3: shared cache of upstream market prices. Written only by the live-price edge function (service_role). TTL is enforced in that function, not here: yahoo 60s, mf 24h.';
comment on column public.price_cache.key is
  'provider:symbol — the batch lookup key.';
comment on column public.price_cache.fetched_at is
  'When the price was last fetched UPSTREAM (not when the row was touched), so a stale-but-usable price can still be served if the upstream call fails.';

-- Sweeping old rows is cheap and keeps the table from growing with symbols the
-- user has since sold. Not scheduled — see the note in the roadmap about
-- pg_cron still being unscheduled; the table is tiny either way.
create index if not exists idx_price_cache_fetched_at
  on public.price_cache (fetched_at);

-- RLS on with NO policies = deny to anon and authenticated. service_role
-- bypasses RLS, and the edge function is the only thing holding that key.
-- Clients must go through the function; they never read this table directly.
alter table public.price_cache enable row level security;

revoke all on public.price_cache from anon, authenticated;
