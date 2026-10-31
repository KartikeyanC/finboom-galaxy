-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 7 — automated transaction ingestion: one ledger, three sources
--
-- Transactions can now arrive without anyone typing them:
--   * 'sms' / 'notification' — the Android app parses a bank alert on the
--     device (PaymentListenerService.kt) and sends only the extracted fields;
--   * 'aa'    — an Account Aggregator feed (consented, structured);
--   * 'email' — an inbound-email parser posting JSON to a webhook.
--
-- The same payment routinely arrives more than once — the UPI app's
-- notification, the bank's SMS, then the AA feed the next morning. Every
-- source therefore goes through ONE function, ingest_transaction(), which
-- refuses the second copy. Nothing below changes how manual, imported or
-- recurring rows behave.
--
-- ── The de-duplication key ─────────────────────────────────────────────────
-- raw_payload_hash = hex SHA-256 of
--     user_id | amount (2 dp) | type | occurred_at truncated to the UTC minute | account_last4
-- computed by supabase/functions/_shared/ingest/normalize.ts (and its Dart
-- twin in the mobile app — the two must agree byte for byte; the test vectors
-- in normalize.test.ts pin the canonical string).
--
-- It is UNIQUE per TENANT, not globally: every finance table is tenant-scoped
-- and the importer's key (transactions_import_hash_key) set the precedent. A
-- plain UNIQUE constraint, not a partial index, so PostgREST's on_conflict= can
-- target it (see 20260805170000 for why a partial index cannot be used there).
-- NULLs stay distinct, so manual rows — hash NULL — are never de-duplicated.
--
-- Known limits of a minute-bucket hash, accepted on purpose:
--   * two genuinely identical payments in the same minute on the same card
--     collapse into one (logged as 'duplicate' in transaction_ingest_events,
--     so it is visible, not silent);
--   * sources that disagree on the minute do not match each other. AA feeds
--     often carry a posting time hours after the SMS. external_ref (UPI RRN /
--     bank reference / AA txnId) is the second key for exactly that case:
--     a row with the same tenant + external_ref + amount + type is treated as
--     a duplicate before the hash is even tried.
--
-- ── Who can ingest ─────────────────────────────────────────────────────────
--   * service_role (the AA and email webhooks): for a user who is an ACTIVE
--     owner/admin of an ACTIVE workspace — the same people tx_insert allows;
--   * an authenticated user (the phone): only for themselves, only where
--     is_tenant_member(tenant, 'admin') holds. Viewers cannot ingest, exactly
--     as they cannot insert.
-- No raw message text, e-mail body or AA payload is stored anywhere. The
-- event log keeps the hash, the outcome and a short reason — enough to answer
-- "why did my SMS not show up?" without keeping a copy of anyone's inbox.
--
-- Rollback: DROP FUNCTION public.ingest_transaction, public.create_ingest_route,
-- public.revoke_ingest_route; DROP TABLE public.transaction_ingest_events,
-- public.ingest_routes; ALTER TABLE public.transactions DROP CONSTRAINT
-- transactions_raw_payload_hash_key, the four CHECKs below, and the five
-- columns. No other object depends on them.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---- 1. transactions: provenance + de-dup columns --------------------------

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source           text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS raw_payload_hash text,
  ADD COLUMN IF NOT EXISTS account_last4    text,
  ADD COLUMN IF NOT EXISTS external_ref     text,
  ADD COLUMN IF NOT EXISTS ingested_at      timestamptz;

COMMENT ON COLUMN public.transactions.source IS
  'Stage 7. How the row arrived: manual | import | recurring | sms | '
  'notification | aa | email. Existing clients do not send it, so they keep '
  'writing ''manual''.';
COMMENT ON COLUMN public.transactions.raw_payload_hash IS
  'Stage 7. Hex SHA-256 of user_id|amount|type|utc_minute|account_last4, set '
  'only by ingest_transaction(). NULL for manual/import/recurring rows.';
COMMENT ON COLUMN public.transactions.account_last4 IS
  'Stage 7. Last four digits of the card / account the alert named. Never the '
  'full number.';
COMMENT ON COLUMN public.transactions.external_ref IS
  'Stage 7. The source''s own reference — UPI RRN, bank ref, AA txnId. The '
  'cross-source de-dup key when sources disagree on the time.';
COMMENT ON COLUMN public.transactions.ingested_at IS
  'Stage 7. When ingest_transaction() wrote the row. NULL for every other path.';

-- Rows that already exist are labelled by what we can prove about them.
UPDATE public.transactions SET source = 'import'
  WHERE import_hash IS NOT NULL AND source = 'manual';
UPDATE public.transactions SET source = 'recurring'
  WHERE source_recurring_id IS NOT NULL AND source = 'manual';

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_source_check,
  DROP CONSTRAINT IF EXISTS transactions_raw_payload_hash_format,
  DROP CONSTRAINT IF EXISTS transactions_account_last4_format,
  DROP CONSTRAINT IF EXISTS transactions_raw_payload_hash_source;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_source_check
    CHECK (source IN ('manual', 'import', 'recurring', 'sms', 'notification', 'aa', 'email')),
  ADD CONSTRAINT transactions_raw_payload_hash_format
    CHECK (raw_payload_hash IS NULL OR raw_payload_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT transactions_account_last4_format
    CHECK (account_last4 IS NULL OR account_last4 ~ '^[0-9]{4}$'),
  -- A hash only means something on an ingested row.
  ADD CONSTRAINT transactions_raw_payload_hash_source
    CHECK (raw_payload_hash IS NULL OR source IN ('sms', 'notification', 'aa', 'email'));

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_raw_payload_hash_key;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_raw_payload_hash_key UNIQUE (tenant_id, raw_payload_hash);

CREATE INDEX IF NOT EXISTS transactions_tenant_external_ref_idx
  ON public.transactions (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- ---- 2. ingest_routes: which workspace a webhook payload belongs to --------
--
-- An inbound e-mail or an AA notification carries no FinRoot session. The
-- route_key (the local part of a per-user inbound address, or an AA consent
-- handle) is how a webhook finds the tenant and user; the secret is checked by
-- the edge function against secret_hash and is shown to the user once.

CREATE TABLE IF NOT EXISTS public.ingest_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source      text NOT NULL CHECK (source IN ('aa', 'email')),
  route_key   text NOT NULL UNIQUE CHECK (route_key ~ '^[a-z0-9][a-z0-9._-]{5,63}$'),
  secret_hash text CHECK (secret_hash IS NULL OR secret_hash ~ '^[0-9a-f]{64}$'),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

COMMENT ON TABLE public.ingest_routes IS
  'Stage 7. Maps an AA consent handle or inbound-email key to (tenant, user). '
  'Written only through create_ingest_route() / revoke_ingest_route().';

CREATE INDEX IF NOT EXISTS ingest_routes_tenant_idx
  ON public.ingest_routes (tenant_id, user_id);

ALTER TABLE public.ingest_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingest_routes_select ON public.ingest_routes;
-- A member sees their own routes; owners and admins see the workspace's.
CREATE POLICY ingest_routes_select ON public.ingest_routes FOR SELECT
  USING (
    (user_id = auth.uid() AND public.is_tenant_member(tenant_id, 'viewer'))
    OR public.is_tenant_member(tenant_id, 'admin')
  );
-- No INSERT / UPDATE / DELETE policy: the functions below are the only writers.

-- ---- 3. transaction_ingest_events: what happened to each payload -----------

CREATE TABLE IF NOT EXISTS public.transaction_ingest_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL,
  source           text NOT NULL CHECK (source IN ('sms', 'notification', 'aa', 'email')),
  raw_payload_hash text NOT NULL CHECK (raw_payload_hash ~ '^[0-9a-f]{64}$'),
  outcome          text NOT NULL CHECK (outcome IN ('inserted', 'duplicate')),
  transaction_id   uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  reason           text CHECK (reason IS NULL OR length(reason) <= 200),
  received_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.transaction_ingest_events IS
  'Stage 7. One row per ingest_transaction() call: hash, outcome, reason. '
  'Never the payload itself.';

CREATE INDEX IF NOT EXISTS transaction_ingest_events_tenant_idx
  ON public.transaction_ingest_events (tenant_id, received_at DESC);

ALTER TABLE public.transaction_ingest_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_ingest_events_select ON public.transaction_ingest_events;
CREATE POLICY transaction_ingest_events_select ON public.transaction_ingest_events FOR SELECT
  USING (public.is_tenant_member(tenant_id, 'admin'));
-- No write policies: ingest_transaction() (SECURITY DEFINER) is the only writer.

-- ---- 4. ingest_transaction(): the single entry point -----------------------

CREATE OR REPLACE FUNCTION public.ingest_transaction(
  p_tenant_id        uuid,
  p_user_id          uuid,
  p_source           text,
  p_raw_payload_hash text,
  p_type             text,
  p_amount           numeric,
  p_occurred_at      timestamptz,
  p_currency         text DEFAULT 'INR',
  p_category         text DEFAULT 'Other',
  p_description      text DEFAULT NULL,
  p_account_last4    text DEFAULT NULL,
  p_external_ref     text DEFAULT NULL,
  p_payment_mode     text DEFAULT NULL
)
RETURNS TABLE (transaction_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_outcome text;
  v_reason  text;
BEGIN
  -- ---- caller ----
  IF coalesce(auth.role(), '') = 'service_role' THEN
    -- Webhooks: the target must be an active owner/admin of an active workspace.
    IF NOT EXISTS (
      SELECT 1
      FROM public.tenant_members m
      JOIN public.tenants t ON t.id = m.tenant_id
      WHERE m.tenant_id = p_tenant_id
        AND m.user_id = p_user_id
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
        AND t.status = 'active'
    ) THEN
      RAISE EXCEPTION 'ingest target is not an active owner or admin of this workspace'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- The phone: only for yourself, only where you could insert anyway.
    IF auth.uid() IS NULL
       OR auth.uid() <> p_user_id
       OR NOT public.is_tenant_member(p_tenant_id, 'admin') THEN
      RAISE EXCEPTION 'not allowed to ingest into this workspace'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ---- shape (the CHECKs would catch most of this; fail with a clear message) ----
  IF p_source NOT IN ('sms', 'notification', 'aa', 'email') THEN
    RAISE EXCEPTION 'unknown ingest source: %', p_source USING ERRCODE = '22023';
  END IF;
  IF p_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'ingested type must be income or expense' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 999999999999.99 THEN
    RAISE EXCEPTION 'ingested amount out of range' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL OR p_occurred_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'ingested occurred_at is missing or in the future' USING ERRCODE = '22023';
  END IF;

  -- ---- cross-source match on the source's own reference ----
  IF p_external_ref IS NOT NULL THEN
    SELECT t.id INTO v_id
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id
      AND t.external_ref = p_external_ref
      AND t.amount = round(p_amount, 2)
      AND t.type = p_type
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      v_outcome := 'duplicate';
      v_reason  := 'external_ref already recorded';
    END IF;
  END IF;

  -- ---- the insert; the unique constraint decides ----
  IF v_id IS NULL THEN
    INSERT INTO public.transactions (
      tenant_id, user_id, type, amount, currency, category, description,
      occurred_at, payment_mode, source, raw_payload_hash, account_last4,
      external_ref, ingested_at
    ) VALUES (
      p_tenant_id, p_user_id, p_type, round(p_amount, 2),
      coalesce(nullif(trim(p_currency), ''), 'INR'),
      coalesce(nullif(trim(p_category), ''), 'Other'),
      nullif(left(trim(p_description), 500), ''),
      p_occurred_at, nullif(trim(p_payment_mode), ''), p_source,
      p_raw_payload_hash, p_account_last4, nullif(trim(p_external_ref), ''), now()
    )
    ON CONFLICT ON CONSTRAINT transactions_raw_payload_hash_key DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      v_outcome := 'inserted';
    ELSE
      SELECT t.id INTO v_id
      FROM public.transactions t
      WHERE t.tenant_id = p_tenant_id AND t.raw_payload_hash = p_raw_payload_hash;
      v_outcome := 'duplicate';
      v_reason  := 'raw_payload_hash already recorded';
    END IF;
  END IF;

  INSERT INTO public.transaction_ingest_events (
    tenant_id, user_id, source, raw_payload_hash, outcome, transaction_id, reason
  ) VALUES (
    p_tenant_id, p_user_id, p_source, p_raw_payload_hash, v_outcome, v_id, v_reason
  );

  RETURN QUERY SELECT v_id, v_outcome;
END;
$function$;

REVOKE ALL ON FUNCTION public.ingest_transaction(
  uuid, uuid, text, text, text, numeric, timestamptz, text, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_transaction(
  uuid, uuid, text, text, text, numeric, timestamptz, text, text, text, text, text, text
) TO authenticated, service_role;

-- ---- 5. routes: create and revoke ------------------------------------------
--
-- create_ingest_route() returns the plain secret exactly once; only its
-- SHA-256 is stored. A route belongs to the caller, in a workspace where the
-- caller could insert transactions.

CREATE OR REPLACE FUNCTION public.create_ingest_route(p_tenant_id uuid, p_source text)
RETURNS TABLE (route_id uuid, route_key text, secret text)
LANGUAGE plpgsql
SECURITY DEFINER
-- gen_random_bytes / digest are pgcrypto, in the `extensions` schema on
-- Supabase (same as accept_invitation in 20260806190000).
SET search_path = public, extensions
AS $function$
DECLARE
  v_key    text;
  v_secret text;
  v_id     uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tenant_member(p_tenant_id, 'admin') THEN
    RAISE EXCEPTION 'not allowed to add an ingest route here' USING ERRCODE = '42501';
  END IF;
  IF p_source NOT IN ('aa', 'email') THEN
    RAISE EXCEPTION 'unknown route source: %', p_source USING ERRCODE = '22023';
  END IF;

  v_key    := 'fr-' || encode(gen_random_bytes(9), 'hex');
  v_secret := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.ingest_routes (tenant_id, user_id, source, route_key, secret_hash)
  VALUES (p_tenant_id, auth.uid(), p_source, v_key, encode(digest(v_secret, 'sha256'), 'hex'))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_user_id, tenant_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(), p_tenant_id, 'ingest_route.create', 'ingest_routes', v_id::text,
          jsonb_build_object('source', p_source));

  RETURN QUERY SELECT v_id, v_key, v_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_ingest_route(p_route_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT r.tenant_id INTO v_tenant
  FROM public.ingest_routes r
  WHERE r.id = p_route_id
    AND r.active
    AND (r.user_id = auth.uid() OR public.is_tenant_member(r.tenant_id, 'admin'));
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'route not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.ingest_routes
  SET active = false, revoked_at = now()
  WHERE id = p_route_id;

  INSERT INTO public.audit_log (actor_user_id, tenant_id, action, entity, entity_id)
  VALUES (auth.uid(), v_tenant, 'ingest_route.revoke', 'ingest_routes', p_route_id::text);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_ingest_route(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ingest_route(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_ingest_route(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_ingest_route(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification (as an owner of <tid>, through PostgREST or the SQL editor with
-- request.jwt.claims set):
--
--   SELECT * FROM public.ingest_transaction('<tid>', auth.uid(), 'sms',
--     repeat('a', 64), 'expense', 250, now());          -- (<id>, inserted)
--   SELECT * FROM public.ingest_transaction('<tid>', auth.uid(), 'sms',
--     repeat('a', 64), 'expense', 250, now());          -- (<same id>, duplicate)
--   SELECT * FROM public.ingest_transaction('<tid>', auth.uid(), 'aa',
--     repeat('b', 64), 'expense', 250, now(), p_external_ref => 'RRN1');  -- inserted
--   SELECT * FROM public.ingest_transaction('<tid>', auth.uid(), 'sms',
--     repeat('c', 64), 'expense', 250, now(), p_external_ref => 'RRN1');  -- duplicate
--
--   -- as a VIEWER of <tid>: every call above raises 42501
--   -- manual rows are untouched: INSERT two identical manual rows -> both stay
--
--   SELECT outcome, count(*) FROM public.transaction_ingest_events
--    WHERE tenant_id = '<tid>' GROUP BY 1;            -- inserted 2, duplicate 2
-- ═══════════════════════════════════════════════════════════════════════════
