-- =============================================================================
-- Stage 2 · 2.10 fix — repair the encoding of the landing pricing copy.
--
-- 20260805180000 wrote its rupee signs as literal UTF-8 in the file. The tool
-- that applied it read the file as ANSI, so Postgres received mojibake
-- ("â‚¹299" instead of "₹299") in site_settings.landing_pricing. The landing
-- page never showed it — prices are derived from `plans` — but the stored
-- fallback strings were wrong, and the PO console reported them as drift.
--
-- This file is deliberately PURE ASCII: every non-ASCII character is built with
-- chr(), so no encoding assumption in any applier can corrupt it again.
--   chr(8377) = INR sign, chr(8594) = rightwards arrow.
-- =============================================================================

UPDATE public.site_settings
   SET value = jsonb_build_object(
     'eyebrow', 'Pricing',
     'title',   'Quietly priced. Loudly worth it.',
     'cards', jsonb_build_array(
       jsonb_build_object(
         'plan', 'Roots',
         'name', 'Roots',
         'price', 'Free',
         'period', '',
         'blurb', 'For anyone starting the habit.',
         'features', jsonb_build_array(
           'Unlimited transactions', '1 budget cycle', '3 active goals', 'Email digests'),
         'cta', 'Start free',
         'ctaHref', '/auth',
         'highlight', false,
         'badge', ''
       ),
       jsonb_build_object(
         'plan', 'Canopy',
         'name', 'Canopy',
         'price', chr(8377) || '299',
         'period', '/mo',
         'blurb', 'For households serious about wealth.',
         'features', jsonb_build_array(
           'Everything in Roots',
           'Unlimited budgets & goals',
           'Multi-currency portfolio',
           'Screenshot ' || chr(8594) || ' transaction AI',
           'Insurance carryover engine'),
         'cta', 'Start 14-day trial',
         'ctaHref', '/auth',
         'highlight', true,
         'badge', 'Most chosen'
       ),
       jsonb_build_object(
         'plan', 'Heritage',
         'name', 'Heritage',
         'price', chr(8377) || '899',
         'period', '/mo',
         'blurb', 'For families and advisors.',
         'features', jsonb_build_array(
           'Everything in Canopy', 'Up to 5 linked profiles', 'Advisor seat', 'Priority support'),
         'cta', 'Talk to us',
         'ctaHref', '/auth',
         'highlight', false,
         'badge', ''
       )
     )
   ),
   updated_at = now()
 WHERE key = 'landing_pricing';

-- =============================================================================
-- Post-apply verification:
--   SELECT c->>'name', c->>'price' FROM public.site_settings s,
--          LATERAL jsonb_array_elements(s.value->'cards') c
--    WHERE s.key = 'landing_pricing';
--   -- expect Free / <rupee>299 / <rupee>899 as single characters, not "a,!"
--   SELECT length(c->>'price') FROM ... ;  -- Canopy = 4, not 6
-- =============================================================================
