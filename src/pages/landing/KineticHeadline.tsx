import { motion, useReducedMotion, type Variants } from "framer-motion";

/**
 * The hero <h1> — split out of Landing.tsx in Stage 4.13.
 *
 * Small, but it carries two fixes worth keeping visible rather than buried
 * mid-file: the reduced-motion branch (BUG-051, the headline must never depend
 * on an animation completing) and the inter-line whitespace (BUG-050, without
 * it every text extraction read "commandcenter").
 */

/* ── 5. Kinetic hero headline ───────────────────────────────────── */
const LINE: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const WORD: Variants = {
  hidden: { y: "110%", opacity: 0 },
  show: { y: "0%", opacity: 1, transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] } },
};
const HEADLINE_CLASS =
  "text-[2.7rem] sm:text-6xl lg:text-[4.4rem] font-semibold leading-[1.02] tracking-tight text-white";

export default function KineticHeadline({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const lines = [
    [{ t: "The calm command" }],
    [{ t: "center for" }, { t: "your money.", em: true }],
  ];

  // Stage 4.9 / BUG-051 — the animated headline starts at opacity 0 and only
  // appears once the preloader reports done. For anyone who asked for reduced
  // motion, skip the mechanism entirely: this is the page's <h1>, and being
  // readable should never depend on an animation completing.
  if (reduce) {
    return (
      <h1 className={HEADLINE_CLASS}>
        {lines.map((line, li) => (
          <span key={li} className="block pb-1">
            {line.map((w, wi) => (
              <span key={wi} className={w.em ? "fr-shimmer" : undefined}>
                {w.t}
                {wi < line.length - 1 ? " " : ""}
              </span>
            ))}
            {li < lines.length - 1 ? " " : ""}
          </span>
        ))}
      </h1>
    );
  }

  return (
    <motion.h1
      variants={LINE} initial="hidden" animate={ready ? "show" : "hidden"}
      className={HEADLINE_CLASS}
    >
      {lines.map((line, li) => (
        <span key={li} className="block overflow-hidden pb-1">
          {line.map((w, wi) => (
            <span key={wi} className="inline-block overflow-hidden align-bottom">
              <motion.span variants={WORD} className={`inline-block ${w.em ? "fr-shimmer" : ""}`}>
                {w.t}{wi < line.length - 1 ? " " : ""}
              </motion.span>
            </span>
          ))}
          {/*
            Stage 4.9 / BUG-050 — each line is its own block, so the DOM held
            "The calm command" immediately followed by "center for", and every
            text extraction (accessible name, screen readers, copy-paste,
            search indexing) read "commandcenter". The lines need real
            whitespace between them; in a block layout it costs nothing visually.
          */}
          {li < lines.length - 1 ? " " : ""}
        </span>
      ))}
    </motion.h1>
  );
}
