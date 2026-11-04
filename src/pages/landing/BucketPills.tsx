import { motion, useReducedMotion } from "framer-motion";
import {
  Coins, GraduationCap, HeartHandshake, Home, PartyPopper, PiggyBank, Sprout, type LucideIcon,
} from "lucide-react";

/**
 * The seven buckets as glossy pills drifting around the hero showcase — the
 * floating-category motif from Copilot Money's hero (see
 * F:\Movie\AK\FinRoot\website\inspiration.md), redrawn with FinRoot's own
 * bucket names and colours.
 *
 * Purely decorative: aria-hidden, and only from `lg` up. Below that the
 * showcase spans the column, and pills hung off its edges are exactly the kind
 * of overhang that produced BUG-028's mobile overflow.
 */

type Pill = {
  name: string; icon: LucideIcon; color: string;
  /** Position relative to the showcase box. */
  pos: string;
  rotate: number;
  /** Back pills are smaller, softer and sit behind the dashboard. */
  back?: boolean;
  dur: number; delay: number;
};

const PILLS: Pill[] = [
  { name: "Needs", icon: Home, color: "#0D7A5F", pos: "-top-7 left-6", rotate: -6, dur: 6.5, delay: 0 },
  { name: "Play", icon: PartyPopper, color: "#e0598b", pos: "top-16 -right-6", rotate: 7, dur: 7.2, delay: 0.8 },
  { name: "Agri", icon: Sprout, color: "#5e9e4a", pos: "-bottom-5 left-12", rotate: 5, dur: 6.8, delay: 1.4 },
  { name: "Giving", icon: HeartHandshake, color: "#f0a35c", pos: "bottom-14 -right-4", rotate: -5, dur: 7.6, delay: 0.4 },
  { name: "Education", icon: GraduationCap, color: "#4f7fe0", pos: "top-1/2 -left-10", rotate: -9, back: true, dur: 8.4, delay: 1.1 },
  { name: "Financial Freedom", icon: Coins, color: "#C9A84C", pos: "-top-10 right-16", rotate: 4, back: true, dur: 9, delay: 0.2 },
  { name: "Long-Term Savings", icon: PiggyBank, color: "#8a63d2", pos: "-bottom-9 right-24", rotate: -3, back: true, dur: 8.8, delay: 1.7 },
];

export default function BucketPills() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
      {PILLS.map((p) => (
        <motion.span
          key={p.name}
          className={`absolute ${p.pos} ${p.back ? "-z-10" : "z-10"}`}
          initial={false}
          animate={reduce ? undefined : { y: [0, p.back ? -8 : -12, 0] }}
          transition={reduce ? undefined : { duration: p.dur, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        >
          <span
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-white ${p.back ? "scale-[0.82] opacity-70 blur-[1.5px]" : ""}`}
            style={{
              rotate: `${p.rotate}deg`,
              background: `linear-gradient(180deg, color-mix(in srgb, ${p.color} 78%, white), ${p.color} 55%, color-mix(in srgb, ${p.color} 82%, black))`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,.45), inset 0 -3px 0 rgba(0,0,0,.18), 0 14px 30px -12px ${p.color}`,
            }}
          >
            <p.icon className="h-4 w-4" />
            {p.name}
          </span>
        </motion.span>
      ))}
    </div>
  );
}
