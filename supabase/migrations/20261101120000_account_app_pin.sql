-- ═══════════════════════════════════════════════════════════════════════════
-- One app-lock PIN per account, not one per browser
--
-- Until now the screen-lock PIN lived ONLY in the browser's localStorage
-- (`finroot.pin.<uid>`, a PBKDF2 v2 record — see src/lib/appLock.ts). Every new
-- browser, every new device, the Windows WebView app, and Safari after its
-- 7-day storage purge therefore greeted the same person with "Add a PIN to this
-- device?" and they ended up juggling several PINs for one account. This
-- migration gives the account ONE PIN that works everywhere; the browser copy
-- stays as a per-device cache and offline fallback.
--
-- ── Why a server copy of a 4–6 digit secret is acceptable ──────────────────
-- ⚠️ A 4–6 digit PIN is weak: 13–20 bits. Hashed and handed to an attacker it
-- falls to a GPU in seconds no matter which KDF is used, so the protection
-- here is NOT the hash. It is three things together:
--   1. The hash never leaves the database. `app_pins` has RLS enabled and NO
--      policies, and every privilege is revoked from anon/authenticated, so
--      PostgREST cannot read a single column of it — not even your own row.
--      Only the SECURITY DEFINER functions below touch it, and none of them
--      returns the hash.
--   2. bcrypt (pgcrypto `crypt(.., gen_salt('bf', 10))`), so a leaked backup is
--      at least not a lookup table.
--   3. A server-side attempt limit: 5 consecutive wrong PINs lock PIN entry
--      for 15 minutes. Online guessing is the only route left, and it is
--      capped at 20 tries an hour per account.
-- The lock is still a curtain over the screen of a device someone is already
-- signed in on. It is NOT access control: RLS is the real gate, and anyone
-- with the account password can reset the PIN (that is the recovery path).
-- The "pick digits you do not use anywhere else" line in PinSetup still
-- matters — keep it.
--
-- ── Shape ──────────────────────────────────────────────────────────────────
--   app_pin_status()          → (is_set, pin_length, locked_until)
--   set_app_pin(p_pin)        → upsert; resets the attempt counter
--   verify_app_pin(p_pin)     → (ok, locked_until, attempts_left)
--                               attempts_left IS NULL means "no PIN is set"
--                               (ok is false) — the client uses that to upload
--                               a PIN that so far only existed on one device.
--   clear_app_pin()           → forgot-PIN recovery / lock turned off
-- All keyed on auth.uid(); none accepts a user id. 42501 when signed out.
-- Granted to `authenticated` only.
--
-- The lock CHOICE (on/off) and the grace period stay per device in
-- localStorage on purpose — see src/lib/deviceLocal.ts.
--
-- Not exported in the data export (src/lib/dataExport.ts NOT_PERSONAL): the
-- only content is a credential verifier, and RLS refuses the read anyway.
--
-- Rollback: DROP FUNCTION public.app_pin_status(), public.set_app_pin(text),
-- public.verify_app_pin(text), public.clear_app_pin(); DROP TABLE
-- public.app_pins. Nothing else depends on them, and the client falls back to
-- device-only PINs when the functions are missing (PGRST202), which is exactly
-- the behaviour before this migration.
--
-- Verification (as an authenticated user, e.g. the SQL editor with a role
-- switch, or the app):
--   select * from public.app_pin_status();               -- (false, null, null)
--   select public.set_app_pin('123456');
--   select * from public.app_pin_status();               -- (true, 6, null)
--   select * from public.verify_app_pin('000000');       -- (false, null, 4)
--   select * from public.verify_app_pin('123456');       -- (true, null, 5)
--   select public.clear_app_pin();
-- And as anon/authenticated through PostgREST:
--   GET /rest/v1/app_pins                                -- 401/403, never rows
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_pins (
  user_id         uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  pin_hash        text        NOT NULL,
  pin_length      smallint    NOT NULL CHECK (pin_length IN (4, 6)),
  failed_attempts smallint    NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_pins IS
  'One app-lock PIN per account, bcrypt-hashed. RLS on with NO policies: '
  'clients can never read it. Touched only by app_pin_status / set_app_pin / '
  'verify_app_pin / clear_app_pin (SECURITY DEFINER, auth.uid()-keyed).';

ALTER TABLE public.app_pins ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies.
REVOKE ALL ON TABLE public.app_pins FROM anon, authenticated;

-- ---- status -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_pin_status()
RETURNS TABLE (is_set boolean, pin_length smallint, locked_until timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT true, p.pin_length,
           CASE WHEN p.locked_until > now() THEN p.locked_until END
      FROM public.app_pins p
     WHERE p.user_id = v_uid;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::smallint, NULL::timestamptz;
  END IF;
END;
$$;

-- ---- set --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_app_pin(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^([0-9]{4}|[0-9]{6})$' THEN
    RAISE EXCEPTION 'PIN must be 4 or 6 digits' USING ERRCODE = '22023';
  END IF;

  -- gen_salt/crypt are pgcrypto, which lives in `extensions` on Supabase —
  -- hence the search_path above (same as 20260806190000_stage3_invitations).
  INSERT INTO public.app_pins AS a (user_id, pin_hash, pin_length, failed_attempts, locked_until, updated_at)
  VALUES (v_uid, crypt(p_pin, gen_salt('bf', 10)), length(p_pin), 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
     SET pin_hash        = EXCLUDED.pin_hash,
         pin_length      = EXCLUDED.pin_length,
         failed_attempts = 0,
         locked_until    = NULL,
         updated_at      = now();
END;
$$;

-- ---- verify -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_app_pin(p_pin text)
RETURNS TABLE (ok boolean, locked_until timestamptz, attempts_left smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_row      public.app_pins%ROWTYPE;
  v_max      constant smallint := 5;
  v_attempts smallint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: two racing wrong guesses must both count.
  SELECT * INTO v_row FROM public.app_pins a WHERE a.user_id = v_uid FOR UPDATE;

  IF NOT FOUND THEN
    -- No PIN on the account. attempts_left NULL is the signal for that.
    RETURN QUERY SELECT false, NULL::timestamptz, NULL::smallint;
    RETURN;
  END IF;

  -- Locked: refuse WITHOUT checking, so a lockout cannot be used as an oracle.
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN QUERY SELECT false, v_row.locked_until, 0::smallint;
    RETURN;
  END IF;

  IF p_pin IS NOT NULL AND p_pin ~ '^[0-9]{4,6}$'
     AND v_row.pin_hash = crypt(p_pin, v_row.pin_hash) THEN
    UPDATE public.app_pins a
       SET failed_attempts = 0, locked_until = NULL
     WHERE a.user_id = v_uid;
    RETURN QUERY SELECT true, NULL::timestamptz, v_max;
    RETURN;
  END IF;

  v_attempts := v_row.failed_attempts + 1;
  IF v_attempts >= v_max THEN
    UPDATE public.app_pins a
       SET failed_attempts = 0, locked_until = now() + interval '15 minutes'
     WHERE a.user_id = v_uid
     RETURNING a.locked_until INTO v_row.locked_until;
    RETURN QUERY SELECT false, v_row.locked_until, 0::smallint;
    RETURN;
  END IF;

  UPDATE public.app_pins a
     SET failed_attempts = v_attempts, locked_until = NULL
   WHERE a.user_id = v_uid;
  RETURN QUERY SELECT false, NULL::timestamptz, (v_max - v_attempts)::smallint;
END;
$$;

-- ---- clear ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_app_pin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.app_pins a WHERE a.user_id = v_uid;
END;
$$;

-- ---- privileges ---------------------------------------------------------------
-- Functions are executable by PUBLIC by default; narrow that to signed-in users.

REVOKE ALL ON FUNCTION public.app_pin_status()     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_app_pin(text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_app_pin(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_app_pin()      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.app_pin_status()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_pin(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_app_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_app_pin()      TO authenticated;
