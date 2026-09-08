/**
 * The animation registry, the intensity setting and the `?motionDebug` logger.
 *
 * REGISTRY is a plain catalogue of every named animation on the site and where
 * it lives — the map the prompt asks for, so a new contributor can see the
 * whole system without grepping. It is documentation that the linter keeps
 * honest (each entry is a real symbol or a real file).
 *
 * `motionDebugEnabled()` / `logMotion()` are no-ops unless the URL carries
 * `?motionDebug=true`, so leaving `logMotion(...)` calls in components costs
 * nothing in production.
 */

export interface MotionEntry {
  /** stable id used in logs and the registry */
  name: string;
  /** where it is implemented */
  where: string;
  /** one line on what it does */
  note: string;
}

export const REGISTRY = {
  global: [
    { name: "preloader", where: "pages/landing/effects.tsx → Preloader", note: "logo + progress + -100% curtain exit, once per tab, 3.4s bail" },
    { name: "cursor", where: "pages/landing/effects.tsx → Cursor", note: "dot + spring ring, grows on a/button/[data-cursor], fine-pointer + reduced-motion gated" },
    { name: "aurora", where: "pages/landing/effects.tsx → Aurora", note: "mouse-reactive mesh blobs, grid, grain, vignette" },
    { name: "scrollProgress", where: "pages/Landing.tsx", note: "spring scaleX gradient bar" },
    { name: "pageTransition", where: "components/motion/PageTransition.tsx", note: "fade + short rise between public routes, reduced-motion → none" },
    { name: "motionDebug", where: "components/motion/MotionDebug.tsx", note: "?motionDebug=true — outline animated nodes, console log on trigger" },
  ],
  navigation: [
    { name: "navReveal", where: "pages/landing/FloatingNav.tsx", note: "y:-120 → 0 on mount" },
    { name: "navHideShow", where: "pages/landing/FloatingNav.tsx", note: "hide past 220px on scroll-down, show on scroll-up" },
    { name: "navBgMorph", where: "pages/landing/FloatingNav.tsx", note: "border/blur/shadow at >24px" },
    { name: "navActivePill", where: "pages/landing/FloatingNav.tsx", note: "layoutId shared-element pill, spring" },
    { name: "menuStagger", where: "pages/landing/FloatingNav.tsx", note: "mobile menu AnimatePresence" },
  ],
  scroll: [
    { name: "reveal", where: "pages/landing/primitives.tsx → Reveal", note: "opacity+y section reveal, i stagger, once" },
    { name: "motionReveal", where: "components/motion/MotionReveal.tsx", note: "variant-driven reveal (fadeUp/scaleIn/blurIn/...)" },
    { name: "staggerGroup", where: "components/motion/StaggerContainer.tsx", note: "hands children successive stagger slots" },
    { name: "heroParallax", where: "pages/Landing.tsx", note: "showcase y + opacity on hero scroll" },
    { name: "workflowRail", where: "pages/Landing.tsx", note: "progress line scaleX driven by section scroll" },
    { name: "bucketRing", where: "pages/Landing.tsx", note: "7-bucket ring rotate 360, 60s" },
    { name: "marquee", where: "pages/Landing.tsx", note: "x:0→-50% infinite, edge-fade masks, hover-pause" },
  ],
  text: [
    { name: "kineticHeadline", where: "pages/landing/KineticHeadline.tsx", note: "per-line clip, per-word y:110%→0 stagger" },
    { name: "shimmer", where: "pages/landing/effects.tsx GlobalFX .fr-shimmer", note: "gradient sweep on the emphasised words" },
    { name: "countUp", where: "pages/landing/primitives.tsx → CountUp", note: "animate(0,target) 1.4s en-IN, on-view, once, reduced-motion branch" },
  ],
  components: [
    { name: "magnetic", where: "pages/landing/primitives.tsx → Magnetic", note: "spring follow within radius, CTAs only, reduced-motion gated" },
    { name: "spotlightCard", where: "pages/landing/primitives.tsx → SpotlightCard", note: "cursor-tracking radial" },
    { name: "tiltCard", where: "components/motion/TiltCard.tsx", note: "perspective tilt on pointer, fine-pointer + reduced-motion gated" },
    { name: "pricingLift", where: "pages/Landing.tsx", note: "whileHover y:-6 spring" },
    { name: "faqAccordion", where: "pages/landing/FaqItem.tsx", note: "height/opacity expand" },
    { name: "voicesCarousel", where: "pages/landing/Voices.tsx", note: "testimonial rotation" },
    { name: "ctaGlow", where: "pages/Landing.tsx", note: "grid mask + radial glow opacity pulse" },
  ],
} as const;

/** Flat list, for the debug overlay. */
export const ALL_ENTRIES: MotionEntry[] = Object.values(REGISTRY).flat();

/* ── ?motionDebug=true ────────────────────────────────────────────── */

let _debug: boolean | null = null;

export function motionDebugEnabled(): boolean {
  if (_debug !== null) return _debug;
  if (typeof window === "undefined") return (_debug = false);
  try {
    _debug = new URLSearchParams(window.location.search).get("motionDebug") === "true";
  } catch {
    _debug = false;
  }
  return _debug;
}

/** No-op unless ?motionDebug=true. Safe to leave in shipped components. */
export function logMotion(name: string, detail?: Record<string, unknown>): void {
  if (!motionDebugEnabled()) return;
  console.log(`%c[motion] ${name}`, "color:#19B886", detail ?? "");
}

/* ── animation intensity ─────────────────────────────────────────── */

export type AnimationIntensity = "minimal" | "balanced" | "expressive";

/**
 * `minimal` — opacity only, no travel, no loops. What reduced-motion resolves
 *   to, and a sensible default for low-power devices or forms.
 * `balanced` — the site default: reveals, stagger, parallax, hover.
 * `expressive` — balanced plus the ambient extras (aurora drift, ring spin,
 *   shimmer). What the hero and the full marketing page use.
 */
export function resolveIntensity(
  requested: AnimationIntensity,
  prefersReducedMotion: boolean,
): AnimationIntensity {
  return prefersReducedMotion ? "minimal" : requested;
}

/** How far a reveal should travel at a given intensity (px). */
export function travelFor(intensity: AnimationIntensity, base: number): number {
  if (intensity === "minimal") return 0;
  if (intensity === "balanced") return base;
  return base; // expressive keeps balanced's travel; the difference is ambient motion, added per-component
}
