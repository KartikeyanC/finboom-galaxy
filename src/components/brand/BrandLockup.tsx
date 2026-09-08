import { cn } from "@/lib/utils";
import { useBranding } from "@/hooks/useBranding";

/** Trimmed content aspect of `finroot-lockup.png` (956 × 256). */
export const LOCKUP_ASPECT = 3.7344;

/**
 * Lockup heights in px. Widths are derived from {@link LOCKUP_ASPECT} rather
 * than written down, so the two can never disagree — the earlier per-call-site
 * `h-11 w-[164px]` pairs were three independent magic numbers in three files,
 * and nothing would have caught one being edited without the other.
 *
 * The values are the ones each surface was tuned to by eye:
 *   sm — the landing navbar, inside a 56 px bar
 *   md — the sidebar header, in a 256 px rail
 *   lg — the auth page, where the lockup is the page's masthead
 *
 * Every step is in use, which is the rule this scale is kept to: a step nothing
 * renders is a number nobody has actually looked at, and it gets picked up
 * later on the assumption that somebody had.
 */
const LOCKUP_HEIGHTS = { sm: 32, md: 40, lg: 44 } as const;

export type LockupSize = keyof typeof LOCKUP_HEIGHTS;

/**
 * The full horizontal brand lockup: R mark, FINROOT wordmark, and the
 * "FINANCE ROOTED IN YOU" tagline.
 *
 * Rendered as a CSS **mask**, not an `<img>`, for two reasons.
 *
 * The supplied lockup SVG sets its wordmark and tagline as live `<text>` in
 * `Finance-Regular` and `Roboto-Regular`. Neither is one of the two faces this
 * app self-hosts and there is no webfont link, so an inline SVG would fall back
 * to a generic sans on every machine — measured, not assumed: "finroot" in
 * `Finance-Regular` comes out the same width as plain `sans-serif`. The mask is
 * built from the 4× raster export, so the real letterforms survive.
 *
 * And the artwork is two fixed inks — `#377861` for the mark and wordmark,
 * `#0a3f2a` for the tagline. On this app's dark surfaces that tagline measures
 * **1.69:1**, which is invisible. A mask throws the source colours away and
 * takes the fill from `background-color`, so the whole lockup follows the theme
 * and the tagline inherits a colour that can actually be read.
 *
 * ⚠️ The tagline is ~12% of the lockup's height, so it renders around 4–8 px at
 * navbar and sidebar sizes — below the 12 px floor recorded as UI-003. That is
 * a deliberate, accepted trade; it needs roughly 82 px of lockup height to
 * clear 10 px, which neither the 56 px navbar nor the sidebar rail can give it.
 *
 * A tagline-free variant existed briefly and was removed once nothing used it.
 * Worth knowing if one is wanted again: it cannot be produced by cropping. The
 * mark spans the lockup's full height and the tagline sits inside that range,
 * so no rectangle removes one without cutting the other — the tagline has to be
 * erased in place and the result re-trimmed. That stays balanced, because the
 * wordmark is already centred on the mark in the source (centres at 922 and
 * 931), and it yields an aspect of 3.75 rather than 3.7344.
 *
 * Pick the size with `size`, and set only the colour through `className`:
 * `bg-primary` on themed app surfaces, a literal on the fixed-dark marketing
 * pages. Height and width come from the scale — do not pass `h-*`/`w-*`, they
 * will not win against the inline dimensions and the pair would drift anyway.
 */
export function BrandLockup({
  className,
  size = "lg",
}: {
  className?: string;
  /** See {@link LOCKUP_HEIGHTS}. Width follows the artwork's aspect. */
  size?: LockupSize;
}) {
  const { appName } = useBranding();
  const art = "/brand/finroot-lockup.png";
  const height = LOCKUP_HEIGHTS[size];
  const width = Math.round(height * LOCKUP_ASPECT);

  /* The artwork says FINROOT and cannot speak for a renamed workspace. */
  if (appName !== "FinRoot") {
    return (
      <span className={cn("font-display text-lg font-bold text-gradient-primary", className)}>
        {appName}
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={`${appName} — finance rooted in you`}
      className={cn("block shrink-0", className)}
      style={{
        height,
        width,
        WebkitMaskImage: `url(${art})`,
        maskImage: `url(${art})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "left center",
        maskPosition: "left center",
      }}
    />
  );
}

export default BrandLockup;
