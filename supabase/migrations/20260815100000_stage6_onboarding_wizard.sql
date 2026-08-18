-- Stage 6.1 — one-time, selection-only onboarding wizard for brand-new users.
--
-- A 5-step questionnaire (age/country/currency, income, assets/liabilities,
-- goals/insurance, spending habits) that gates `/app` the first time a new
-- account signs in, then never again. Nothing here is a financial AMOUNT —
-- every answer is a chosen id or array of ids from a fixed option list;
-- exact figures are still collected later inside the real modules.
--
-- Deliberately three plain columns on `profiles`, the same shape as the
-- Stage 5.1 legal-acceptance columns: this is per-USER state (someone can
-- belong to several tenants and must not be re-onboarded per workspace),
-- so it does not belong in the tenant-scoped `tenant_settings` table that
-- the unrelated Stage 5.3 onboarding CHECKLIST already uses.
--
-- The backfill trick below is what satisfies "never show this to an
-- existing user, and never touch their data": ADD COLUMN with
-- DEFAULT true backfills every row that exists right now (including the
-- e2e demo account) to "already done"; only AFTER that does the default
-- change to false, so it's exclusively new rows — i.e. real new signups
-- via handle_new_user() — that start the wizard. handle_new_user() itself
-- needs no edit: its INSERT never names these columns, so they always take
-- whatever the column default is at insert time.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS onboarding_step       smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_selections jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles ALTER COLUMN onboarding_completed SET DEFAULT false;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_onboarding_step_range CHECK (onboarding_step BETWEEN 1 AND 5);

COMMENT ON COLUMN public.profiles.onboarding_completed IS
  'Has this account finished (or been backfilled past) the Stage 6.1 onboarding wizard. Existing accounts were backfilled to true at migration time and never see it.';
COMMENT ON COLUMN public.profiles.onboarding_step IS
  'Which of the 5 wizard steps to resume at if the user left before finishing. Meaningless once onboarding_completed = true.';
COMMENT ON COLUMN public.profiles.onboarding_selections IS
  'The wizard''s chip/radio selections as a flat JSON object (age range, country, currency, income sources/range, assets, liabilities, goals, timeline, insurance, spending categories, priority). No free-text amounts — see src/lib/onboardingWizard.ts for the shape.';
