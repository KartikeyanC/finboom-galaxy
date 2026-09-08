import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BrandingContent {
  /** Application name shown in the nav, sidebar, footer, auth, tab title, … */
  appName: string;
  /** Short descriptive line (landing footer, etc.). */
  tagline: string;
  /** Custom logo image URL. When null/blank, the built-in FinrootLogo SVG is used. */
  logoUrl: string | null;
}

export const BRANDING_KEY = "landing_branding";

export const DEFAULT_BRANDING: BrandingContent = {
  appName: "FinRoot",
  tagline: "The calm, intelligent wealth OS for modern households.",
  logoUrl: null,
};

export function normalizeBranding(value: unknown): BrandingContent {
  const v = value as Partial<BrandingContent> | null;
  if (!v || typeof v !== "object") return DEFAULT_BRANDING;
  const logo = typeof v.logoUrl === "string" && v.logoUrl.trim() ? v.logoUrl.trim() : null;
  return {
    appName: (typeof v.appName === "string" && v.appName.trim()) || DEFAULT_BRANDING.appName,
    tagline: (typeof v.tagline === "string" && v.tagline.trim()) || DEFAULT_BRANDING.tagline,
    logoUrl: logo,
  };
}

/**
 * 2026-08-30 — the built-in mark currently wins over a PO-uploaded logo.
 *
 * The brand mark was replaced with the R, but this tenant's stored branding
 * still points at an upload of the OLD chip design and that row could not be
 * cleared from `/po/branding`. Rather than leave the app serving artwork that
 * no longer exists as a design, `logoUrl` is dropped here.
 *
 * It lives in the hook rather than in the components because there are two
 * consumers and missing one is invisible: `BrandLogo` paints the mark, and
 * `BrandDocumentTitle` rewrites `<link rel="icon">`. Fixing only the first left
 * every browser tab still showing the old logo — which is exactly what happened.
 *
 * `normalizeBranding` is deliberately untouched: `/po/branding` calls it
 * directly and must keep seeing the real stored value, or the PO could not
 * manage the very logo this is suppressing.
 *
 * ⚠️ This disables PO custom logos for every tenant, which is a shipped
 * feature. It is a stopgap, not a decision. To restore it: clear the stale
 * `logoUrl` from `site_settings` (key `landing_branding`), then flip this back
 * to `true` and delete this block.
 */
const ALLOW_CUSTOM_LOGO = false;

/**
 * Public read of the PO-editable branding (RLS allows anon for landing_* keys).
 * Always resolves to a usable value via DEFAULT_BRANDING, so callers never see undefined.
 */
export function useBranding(): BrandingContent {
  const { data } = useQuery({
    queryKey: ["site-branding"],
    staleTime: 60_000,
    queryFn: async (): Promise<BrandingContent> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", BRANDING_KEY)
        .maybeSingle();
      if (error || !data) return DEFAULT_BRANDING;
      return normalizeBranding(data.value);
    },
  });
  const branding = data ?? DEFAULT_BRANDING;
  return ALLOW_CUSTOM_LOGO ? branding : { ...branding, logoUrl: null };
}
