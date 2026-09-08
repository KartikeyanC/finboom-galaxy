import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { VARIANTS, type VariantName } from "@/animations";
import { viewport } from "@/animations";
import { logMotion } from "@/animations";

/**
 * The ergonomic scroll-reveal wrapper the motion prompt asks for:
 *
 *   <MotionReveal variant="fadeUp" delay={0.1}>…</MotionReveal>
 *
 * It resolves to one of the shared `variants.ts` presets, plays once when it
 * scrolls into view, and — like every primitive on this site — renders its
 * children at rest with no wrapper animation when the visitor asked for
 * reduced motion. The landing page's older `<Reveal>` stays; this is the
 * richer API for new sections and shares the exact same timing tokens.
 */
export function MotionReveal({
  children,
  variant = "fadeUp",
  delay = 0,
  i = 0,
  className,
  as = "div",
  once = true,
}: {
  children: ReactNode;
  variant?: VariantName;
  /** extra seconds before this element starts */
  delay?: number;
  /** stagger index — multiplied by the preset's per-child step */
  i?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];

  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  logMotion("motionReveal", { variant, delay, i });

  return (
    <Tag
      className={className}
      variants={VARIANTS[variant]}
      custom={i}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: viewport.section }}
      transition={delay ? { delay } : undefined}
    >
      {children}
    </Tag>
  );
}

export default MotionReveal;
