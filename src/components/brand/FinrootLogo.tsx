/**
 * FinRoot brand mark — the R with a leaf counter (Figma export, `Finroot
 * Navbar.svg`, viewBox 479.27 × 600.6).
 *
 * Replaced the original 40×40 chip — a rounded green square holding a white
 * mark drawn in 1.8px strokes — on 2026-08-30. Two consequences, both of which
 * bite silently if ignored:
 *
 * **It is not square.** Aspect is 0.798. Size it by height and let the width
 * follow (`h-8 w-auto`), never with a square box (`w-8 h-8`) — that letterboxes
 * the mark inside dead space. See the note in `BrandLogo` for the full reasoning.
 *
 * **It carries no background.** The old mark supplied its own field, so it was
 * white-on-green at every size on every surface and needed no thought. This one
 * takes its colour from whatever is behind it, and the surfaces genuinely
 * differ: the landing header is near-black with a white wordmark, the sidebar
 * is near-black in `obsidian` and pure white in `light`. So `fill` defaults to
 * `currentColor` — set a text colour on the element or an ancestor. Use
 * `text-primary` on themed app surfaces (it is tuned per theme) and the
 * landing's own `#19B886` on the fixed-dark marketing pages.
 *
 * The artwork's native colour is `#377861`, which is deliberately not the
 * default here: it is a mid-dark green that goes muddy on a near-black header.
 */
export function FinrootLogo({
  className,
  fill = "currentColor",
}: {
  className?: string;
  /** Any CSS colour. Defaults to `currentColor` — see the note above. */
  fill?: string;
}) {
  return (
    <svg
      viewBox="0 0 479.27 600.6"
      className={className}
      role="img"
      aria-label="FinRoot"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill={fill}
        d="M294.8,417.2c48.21-5.73,91.39-27.81,123.82-60.59,37.51-37.85,60.65-89.9,60.65-147.37s-23.14-109.52-60.65-147.37C383.05,25.88,334.49,2.74,280.57,0h0C125.63,0,.02,125.61.02,280.55v14.57s-.02,0-.02,0v305.48h94.15c1.76,0,3.15-1.41,3.21-3.17,0-.01,0-.02,0-.03.65-114.56.89-205.03,0-273.7-.12-9.52-.25-27.75,6.63-50.17,22.71-73.95,95.45-105.67,111.97-112.87,59.2-25.82,113.84-18.05,137.01-13.28,1.87,10.97,15.5,99.95-49.35,171.89-54.6,60.56-126.55,66.6-148.77,67.1-5.58.13-10.97,2.32-14.83,6.37-.02.02-.04.04-.06.06-11.35,11.97-6.08,31.54-4.91,35.9,4.06,15.18,14.34,24.24,18.91,27.79,39.94,48.04,79.88,96.07,119.83,144.11h174.12l-153.09-183.38-.02-.02Z"
      />
    </svg>
  );
}

export default FinrootLogo;
