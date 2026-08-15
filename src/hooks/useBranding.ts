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
  return data ?? DEFAULT_BRANDING;
}
