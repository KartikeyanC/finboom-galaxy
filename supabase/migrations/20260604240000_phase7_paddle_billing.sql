-- =============================================================================
-- Phase 7 — Paddle self-serve billing
-- Map plans to Paddle prices + enforce one subscription row per tenant so the
-- webhook can upsert by tenant_id (the signup Free row becomes the paid plan).
-- =============================================================================

-- Paddle price id per plan (set these from your Paddle dashboard, sandbox/live).
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS paddle_price_id text;

-- One subscription row per tenant (allows webhook upsert onConflict tenant_id).
-- tenant_id is nullable; UNIQUE permits multiple NULLs but one row per tenant.
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_tenant_unique UNIQUE (tenant_id);

-- Helper the client uses to fetch upgrade-eligible plans (paid + Paddle-mapped).
-- (plans is already publicly readable; this is just a convenience view-like RPC.)
CREATE OR REPLACE FUNCTION public.upgradeable_plans()
RETURNS TABLE (id uuid, name text, price_cents int, currency text, "interval" text, paddle_price_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.name, p.price_cents, p.currency, p."interval", p.paddle_price_id
  FROM public.plans p
  WHERE p.is_active AND p.price_cents > 0 AND p.paddle_price_id IS NOT NULL
  ORDER BY p.price_cents ASC;
$$;
GRANT EXECUTE ON FUNCTION public.upgradeable_plans() TO authenticated;
