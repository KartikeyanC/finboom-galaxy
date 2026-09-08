/**
 * Reusable framer-motion `Variants`, built from the motion tokens.
 *
 * These are the presets the animation prompt calls for — fadeUp, scaleIn,
 * blurIn and friends — expressed once so a section reveal in one file animates
 * identically to a section reveal in another. `<MotionReveal variant="fadeUp">`
 * (src/components/motion) is the ergonomic way to use them; the landing page's
 * older `<Reveal>` primitive stays as-is and now shares the same numbers.
 *
 * Every variant has a `hidden` and a `show`. `show` accepts a `custom` index
 * so a `<StaggerContainer>` can offset children by `stagger.md * i`.
 */

import type { Variants } from "framer-motion";
import { duration, ease, distance, stagger } from "./motionTokens";

type Dir = "up" | "down" | "left" | "right";

const axis: Record<Dir, { x?: number; y?: number }> = {
  up: { y: distance.md },
  down: { y: -distance.md },
  left: { x: distance.md },
  right: { x: -distance.md },
};

function slide(dir: Dir, d = duration.slow): Variants {
  return {
    hidden: { opacity: 0, ...axis[dir] },
    show: (i = 0) => ({
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: d, delay: i * stagger.md, ease: ease.standard },
    }),
  };
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: (i = 0) => ({ opacity: 1, transition: { duration: duration.slow, delay: i * stagger.md, ease: ease.standard } }),
};

export const fadeUp = slide("up");
export const fadeDown = slide("down");
export const fadeLeft = slide("left");
export const fadeRight = slide("right");

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: (i = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: duration.slower, delay: i * stagger.md, ease: ease.standard },
  }),
};

export const blurIn: Variants = {
  hidden: { opacity: 0, filter: "blur(10px)", y: distance.sm },
  show: (i = 0) => ({
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: { duration: duration.medium, delay: i * stagger.md, ease: ease.standard },
  }),
};

/** A line/word that rises out of an `overflow: hidden` clip. Used by the hero. */
export const clipRise: Variants = {
  hidden: { y: "110%", opacity: 0 },
  show: { y: "0%", opacity: 1, transition: { duration: duration.slower, ease: ease.standard } },
};

/** Container that hands each child the next `staggerChildren` slot. */
export const staggerContainer = (step: number = stagger.md, delayChildren = 0.05): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren } },
});

export const VARIANTS = {
  fadeIn,
  fadeUp,
  fadeDown,
  fadeLeft,
  fadeRight,
  scaleIn,
  blurIn,
  clipRise,
} as const;

export type VariantName = keyof typeof VARIANTS;
