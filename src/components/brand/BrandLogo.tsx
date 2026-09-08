import { useBranding } from "@/hooks/useBranding";
import { FinrootLogo } from "./FinrootLogo";

/**
 * Brand mark that renders the PO's custom logo image when set, otherwise the
 * built-in FinrootLogo SVG. Drop-in replacement for <FinrootLogo /> at any
 * call site.
 *
 * ⚠️ **Size by HEIGHT, never by a square box.** Pass `h-8 w-auto`, not
 * `w-8 h-8`.
 *
 * The logo here is whatever a Product Owner uploaded, and nothing validates its
 * aspect ratio — the upload accepts any image. Every call site used to pass a
 * square (`w-8 h-8`) because the built-in mark happens to be a 40×40 chip, and
 * `object-contain` then quietly letterboxed anything that was not square: a
 * tall mark rendered full height but narrow, floating in a square slot with
 * dead space either side. Height-driven sizing lines every mark up on the same
 * optical baseline as the wordmark beside it and lets the width fall out of the
 * artwork, which is what a lockup actually needs.
 *
 * For the same reason, do not pass chip-only decoration — `rounded-*`,
 * `shadow-*`. Those assume artwork that reaches the edges of its box. On a mark
 * with transparent margins a shadow draws a rectangle around nothing, and a
 * corner radius clips artwork that was never square to begin with. The built-in
 * mark carries its own rounded chip inside the SVG path.
 */
export function BrandLogo({ className }: { className?: string }) {
  const { appName, logoUrl } = useBranding();
  if (logoUrl) {
    return <img src={logoUrl} alt={appName} className={`object-contain ${className ?? ""}`} />;
  }
  return <FinrootLogo className={className} />;
}
