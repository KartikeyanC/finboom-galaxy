/**
 * Landing page class tokens — split out of Landing.tsx in Stage 4.13.
 *
 * These three strings are the page's visual vocabulary: every card, every
 * eyebrow label and every primary CTA on the marketing site is one of them.
 * They were defined at the top of Landing.tsx and used by the nav, the
 * testimonial carousel, the spotlight cards and the page body alike, so once
 * those moved into their own files the tokens had to become importable — or
 * each file would carry its own drifting copy of the same class list.
 *
 * `panel` (the inner surface of the fake dashboard) deliberately stayed in
 * GlassDashboard.tsx: nothing outside that mock-up uses it.
 */
export const card = "rounded-2xl border border-white/10 bg-white/[0.025]";
// BUG-053 — was text-[11px], 1px under the WCAG-conventional 12px floor for
// real (non-decorative) body text. Every section eyebrow on the page uses
// this one token, so the fix lands everywhere at once.
export const eyebrow = "text-xs uppercase tracking-[0.22em] text-[#19B886] font-medium";
export const CTA_PRIMARY = "bg-[#19B886] hover:bg-[#3ad0a3] text-[#04130d] font-semibold rounded-xl";
