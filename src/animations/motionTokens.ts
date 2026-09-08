/**
 * FinRoot motion tokens — the single source for every duration, easing curve,
 * stagger step and travel distance used by an animation on the site.
 *
 * Why this exists: the landing page grew fifteen separate copies of
 * `[0.22, 1, 0.36, 1]` and a scatter of `0.7` / `0.85` / `1.4` second
 * durations chosen ad hoc. This file collapses them to a named scale so a
 * timing change lands everywhere at once and a reviewer can see the system
 * rather than re-derive it per component.
 *
 * Everything here is data. The React glue (reduced-motion, intensity, the
 * `?motionDebug` logger) lives in `registry.ts`; the framer-motion `Variants`
 * built from these numbers live in `variants.ts`.
 */

/** Cubic-bezier control points, in the tuple shape framer-motion wants. */
export type Bezier = [number, number, number, number];

/**
 * Easings. `standard` is the house curve — an expo-out that starts fast and
 * settles slow, used for essentially every entrance on the page. The others
 * are for the few places that need a different feel.
 */
export const ease = {
  /** entrances, reveals, the default for anything moving *in* */
  standard: [0.22, 1, 0.36, 1] as Bezier,
  /** exits — the preloader curtain, an element leaving */
  exit: [0.76, 0, 0.24, 1] as Bezier,
  /** symmetric moves that come back (marquee pause, hover toggles) */
  inOut: [0.4, 0, 0.2, 1] as Bezier,
  /** a faint overshoot for playful micro-interactions only */
  back: [0.34, 1.56, 0.64, 1] as Bezier,
  linear: "linear" as const,
} as const;

/** Seconds. Named by feel, not by where they're used. */
export const duration = {
  instant: 0.12,
  fast: 0.2,
  normal: 0.35,
  medium: 0.5,
  slow: 0.7,
  slower: 0.9,
  count: 1.4, // number tickers read better long
  cinematic: 1.2,
} as const;

/** Delay between successive children in a staggered group, in seconds. */
export const stagger = {
  xs: 0.03,
  sm: 0.05,
  md: 0.08,
  lg: 0.12,
} as const;

/** Travel distance for a reveal / slide, in pixels. */
export const distance = {
  xs: 8,
  sm: 16,
  md: 28,
  lg: 64,
  xl: 100,
} as const;

/** Transform amounts for hover / press micro-interactions. */
export const hover = {
  lift: -4, // card translateY on hover (px)
  liftLg: -6, // pricing / feature cards
  scaleHover: 1.02,
  scaleEmphasis: 1.05,
  scalePress: 0.97,
  tiltMax: 8, // TiltCard max rotation, degrees
} as const;

/** Spring presets for framer-motion `transition={{ type: "spring", ... }}`. */
export const spring = {
  /** magnetic follow — quick, a little loose */
  magnetic: { type: "spring", stiffness: 200, damping: 14 } as const,
  /** the nav's shared-layout pill */
  pill: { type: "spring", stiffness: 380, damping: 30 } as const,
  /** card hover lift */
  soft: { type: "spring", stiffness: 300, damping: 22 } as const,
  /** cursor ring */
  cursor: { type: "spring", stiffness: 260, damping: 22 } as const,
};

/** Viewport margins for scroll-in-view triggers (framer `useInView` / `viewport`). */
export const viewport = {
  /** section reveals — fire a little before the top edge crosses in */
  section: "-70px",
  /** small elements (numbers, badges) — fire when clearly visible */
  element: "-60px",
} as const;
