import { type ReactNode, useRef } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { hover, spring } from "@/animations";
import { logMotion } from "@/animations";

/**
 * A card that tilts a few degrees toward the cursor in 3D, then springs flat
 * when the pointer leaves. One supporting hover effect — the prompt's rule is
 * "one primary hover effect and one supporting effect", so this is meant to
 * sit *around* content, optionally over a `SpotlightCard`, not stacked with
 * scale + glow + parallax.
 *
 * Gated to fine pointers and no-reduced-motion. On a touch device or with
 * reduced motion it is an ordinary `<div>` — the tilt is never load-bearing.
 */
export function TiltCard({
  children,
  className,
  max = hover.tiltMax,
}: {
  children: ReactNode;
  className?: string;
  /** max rotation in degrees */
  max?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const rx = useSpring(useMotionValue(0), spring.soft);
  const ry = useSpring(useMotionValue(0), spring.soft);

  const fine =
    typeof window !== "undefined" && window.matchMedia("(pointer:fine)").matches;

  if (reduce || !fine) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, transformStyle: "preserve-3d" }}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        ry.set(px * max);
        rx.set(-py * max);
      }}
      onPointerLeave={() => {
        logMotion("tiltCard.reset");
        rx.set(0);
        ry.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

export default TiltCard;
