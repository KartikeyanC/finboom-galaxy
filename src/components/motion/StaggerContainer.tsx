import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { staggerContainer, stagger, viewport } from "@/animations";

/**
 * Wrap a list; its direct `<motion.*>` children play their `show` variant in
 * sequence when the group scrolls into view. Pair with children that use one
 * of the `variants.ts` presets (or `<MotionReveal>` with no `whileInView` of
 * its own — pass the variant as `variants` on the child).
 *
 *   <StaggerContainer step="md">
 *     {items.map((x) => <motion.li key={x} variants={fadeUp}>…</motion.li>)}
 *   </StaggerContainer>
 */
export function StaggerContainer({
  children,
  step = "md",
  delayChildren = 0.05,
  className,
  once = true,
}: {
  children: ReactNode;
  step?: keyof typeof stagger;
  delayChildren?: number;
  className?: string;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={staggerContainer(stagger[step], delayChildren)}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: viewport.section }}
    >
      {children}
    </motion.div>
  );
}

export default StaggerContainer;
