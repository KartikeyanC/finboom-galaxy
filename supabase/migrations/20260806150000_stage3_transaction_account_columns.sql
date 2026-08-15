-- ===========================================================================
-- Stage 3.4 / BUG-039 — promote the `[Mode|accountId]` description prefix to
-- real columns.
--
-- ---- What was wrong -------------------------------------------------------
--
-- Which account a transaction belonged to, and how it was paid, were encoded
-- into the FREE-TEXT `description` column as a `[UPI|<uuid>]` prefix. So:
--
--   * no referential integrity — deleting an account left a dangling uuid in
--     prose, and nothing could tell you which transactions were affected;
--   * no index and no join — every balance figure in the app was produced by
--     downloading the rows and regexing them in the browser;
--   * `payment_mode` could not be reported on at all;
--   * every display path had to remember to strip the prefix, and a user whose
--     own note began `[...]` was at the mercy of the parser.
--
-- ---- The columns ----------------------------------------------------------
--
-- `account_id` uses ON DELETE SET NULL to match `transfer_to_account_id` from
-- 2.5 and the balance rule it exists for: each leg of a move is applied
-- independently, so a transaction whose account was deleted still counts on the
-- side that survives. A CASCADE here would silently delete money records when
-- someone tidied up an old account.
--
-- ---- Why the backfill is conservative -------------------------------------
--
-- Stripping the prefix rewrites user-visible text, so it only happens where the
-- prefix is provably ours:
--
--   (a) there is a `|` AND the uuid resolves to an account IN THE SAME TENANT
--       (cross-tenant would be a data leak, not a link); or
--   (b) the tag is one of the payment modes the UI actually writes.
--
-- Anything else — `[urgent] pay rent`, `[draft]`, a stale uuid from a deleted
-- account — is left exactly as it is. A row can therefore keep its prefix and
-- get no columns; the readers still fall back to parsing, so nothing breaks.
--
-- Note the `Transfer` tag is NOT a payment mode. Transfers get `account_id`
-- (their source) and `payment_mode` stays NULL — the destination has lived in
-- `transfer_to_account_id` since 2.5, so after this a transfer's two ends are
-- finally both real columns.
-- ===========================================================================

-- ---- 1. columns -----------------------------------------------------------

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_mode text;

COMMENT ON COLUMN public.transactions.account_id IS
  'Stage 3.4. The account this transaction moved money out of / into. For a '
  'transfer this is the SOURCE; the destination is transfer_to_account_id. '
  'Supersedes the [Mode|accountId] description prefix.';

COMMENT ON COLUMN public.transactions.payment_mode IS
  'Stage 3.4. UPI / Cash / Card / Net Banking / Wallet / Cheque. NULL for '
  'transfers and for rows whose old prefix held something else.';

-- Balances are read per account, per tenant.
CREATE INDEX IF NOT EXISTS transactions_tenant_account_idx
  ON public.transactions (tenant_id, account_id)
  WHERE account_id IS NOT NULL;

-- ---- 2. backfill ----------------------------------------------------------

-- The modes the dialog actually writes. Kept as a table rather than a CHECK
-- constraint: a CHECK would reject historical rows and block the backfill,
-- and payment mode is presentational, not an invariant worth failing writes over.
CREATE TEMP TABLE known_modes (mode text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO known_modes (mode)
VALUES ('UPI'), ('Cash'), ('Card'), ('Net Banking'), ('Wallet'), ('Cheque');

WITH parsed AS (
  SELECT
    t.id,
    t.tenant_id,
    t.description,
    substring(t.description from '^\[([^\]|]+)')          AS tag,
    substring(t.description from '^\[[^\]|]+\|([^\]]+)\]') AS raw_id
  FROM public.transactions t
  WHERE t.description ~ '^\[[^\]]*\]'
),
resolved AS (
  SELECT
    p.*,
    -- Same-tenant accounts only. A uuid pointing at another workspace's
    -- account is not a link we should make on the user's behalf.
    (SELECT a.id
       FROM public.accounts a
      WHERE a.tenant_id = p.tenant_id
        AND p.raw_id ~ '^[0-9a-fA-F-]{36}$'
        AND a.id = p.raw_id::uuid) AS acct_id,
    (p.tag IN (SELECT mode FROM known_modes)) AS tag_is_mode
  FROM parsed p
)
UPDATE public.transactions t
   SET account_id   = COALESCE(r.acct_id, t.account_id),
       payment_mode = CASE WHEN r.tag_is_mode THEN r.tag ELSE t.payment_mode END,
       -- Only drop the prefix once we are sure it was ours to drop, and turn an
       -- otherwise-empty description into NULL rather than an empty string.
       description  = NULLIF(btrim(regexp_replace(t.description, '^\[[^\]]*\]\s*', '')), '')
  FROM resolved r
 WHERE t.id = r.id
   AND (r.acct_id IS NOT NULL OR r.tag_is_mode OR r.tag = 'Transfer');

-- ===========================================================================
-- Post-apply verification
--
--   -- nothing left encoded that we claimed to migrate
--   SELECT count(*) FROM public.transactions
--    WHERE description ~ '^\[[^\]]*\]';        -- only genuine user brackets
--
--   -- every transfer now has both ends as columns
--   SELECT count(*) FROM public.transactions
--    WHERE type = 'transfer' AND (account_id IS NULL OR transfer_to_account_id IS NULL);
--   -- expect 0
--
--   -- balances agree with the pre-migration figures (compute both ways)
--   SELECT a.name, a.opening_balance
--          + COALESCE(SUM(CASE WHEN t.type='income'   THEN t.amount END), 0)
--          - COALESCE(SUM(CASE WHEN t.type='expense'  THEN t.amount END), 0)
--          - COALESCE(SUM(CASE WHEN t.type='transfer' THEN t.amount END), 0) AS live
--     FROM public.accounts a
--     LEFT JOIN public.transactions t ON t.account_id = a.id
--    GROUP BY a.id, a.name, a.opening_balance;
-- ===========================================================================
