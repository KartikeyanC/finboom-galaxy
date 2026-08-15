import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion, animate, useInView, useReducedMotion,
  useMotionValue, useMotionTemplate, useSpring, type Variants,
} from "framer-motion";

import { card } from "./tokens";

/**
 * Landing page motion primitives — split out of Landing.tsx in Stage 4.13.
 *
 * Four generic wrappers with no knowledge of the marketing copy they decorate:
 * a number that counts up when it scrolls into view, a magnetically-following
 * container, a card with a cursor-tracking spotlight, and the scroll reveal
 * used by every section. They are used by the page body, the nav and the fake
 * dashboard, which is why they live one level below all three.
 *
 * `useActiveSection` stayed with FloatingNav (its only caller) on purpose:
 * exporting a hook alongside components from the same file trips
 * react-refresh/only-export-components.
 */

/* ── Section reveal variants ────────────────────────────────────── */
const reveal: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] } }),
};

/* ── small utilities ────────────────────────────────────────────── */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const m = value.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  const [display, setDisplay] = useState(reduce || !m ? value : `${m[1]}0${m[3]}`);
  useEffect(() => {
    if (!m || reduce) { setDisplay(value); return; }
    if (!inView) return;
    const numStr = m[2].replace(/,/g, "");
    const target = parseFloat(numStr);
    const decimals = numStr.includes(".") ? numStr.split(".")[1].length : 0;
    const controls = animate(0, target, {
      duration: 1.4, ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(`${m[1]}${decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-IN")}${m[3]}`),
    });
    return () => controls.stop();
  }, [inView, value, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className={className}>{display}</span>;
}

export function Magnetic({ children, className, strength = 0.3 }: { children: ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(0); const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 200, damping: 14 });
  const y = useSpring(my, { stiffness: 200, damping: 14 });
  return (
    <motion.div
      ref={ref} style={{ x, y }} className={className}
      onMouseMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        mx.set((e.clientX - (r.left + r.width / 2)) * strength);
        my.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => { mx.set(0); my.set(0); }}
    >
      {children}
    </motion.div>
  );
}

/** Card whose surface tracks the cursor with a soft emerald spotlight. */
export function SpotlightCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-200); const my = useMotionValue(-200);
  const bg = useMotionTemplate`radial-gradient(260px circle at ${mx}px ${my}px, rgba(25,184,134,0.12), transparent 75%)`;
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect(); if (!r) return;
        mx.set(e.clientX - r.left); my.set(e.clientY - r.top);
      }}
      className={`group relative overflow-hidden ${card} ${className}`}
    >
      <motion.div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: bg }} />
      <div className="relative">{children}</div>
    </div>
  );
}
/* ── Section reveal wrapper ─────────────────────────────────────── */
export function Reveal({ children, className, i = 0 }: { children: ReactNode; className?: string; i?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial="hidden" whileInView="show"
      viewport={{ once: true, margin: "-70px" }} variants={reveal} custom={i}>
      {children}
    </motion.div>
  );
}
