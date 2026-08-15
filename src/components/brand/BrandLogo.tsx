import { useBranding } from "@/hooks/useBranding";
import { FinrootLogo } from "./FinrootLogo";

/**
 * Brand mark that renders the PO's custom logo image when set, otherwise the
 * built-in FinrootLogo SVG. Drop-in replacement for <FinrootLogo /> at any
 * call site — keep the same className for consistent sizing.
 */
export function BrandLogo({ className }: { className?: string }) {
  const { appName, logoUrl } = useBranding();
  if (logoUrl) {
    return <img src={logoUrl} alt={appName} className={`object-contain ${className ?? ""}`} />;
  }
  return <FinrootLogo className={className} />;
}
