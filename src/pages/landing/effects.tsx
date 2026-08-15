import { useEffect, useState } from "react";
import {
  motion,
  AnimatePresence,
  animate,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useBranding } from "@/hooks/useBranding";

/**
 * Landing page atmosphere: injected global CSS, the preloader, the custom
 * cursor and the aurora blobs. Split out of Landing.tsx in Stage 4.13.
 *
 * These four are genuinely self-contained — no props except the preloader's
 * `onDone`, no shared state with the page — so they were 160 lines a reader had
 * to scroll past to reach anything that renders content. Keeping them together
 * also puts every continuously-animating element of the page in one file,
 * which is where PERF-010 will want to look.
 */

/* ── 0. Global CSS (cursor, grain, keyframes) ───────────────────── */
export function GlobalFX() {
  return (
    <style>{`
      .fr-cursor-none, .fr-cursor-none * { cursor: none !important; }
      @keyframes fr-blobA { 0%,100%{ transform: translate3d(0,0,0) scale(1);} 50%{ transform: translate3d(6%,-8%,0) scale(1.18);} }
      @keyframes fr-blobB { 0%,100%{ transform: translate3d(0,0,0) scale(1);} 50%{ transform: translate3d(-9%,7%,0) scale(1.22);} }
      @keyframes fr-blobC { 0%,100%{ transform: translate3d(0,0,0) scale(1);} 50%{ transform: translate3d(8%,9%,0) scale(0.9);} }
      @keyframes fr-shimmer { to { background-position: 200% center; } }
      .fr-shimmer {
        background: linear-gradient(100deg,#f3fbf7 20%,#19B886 38%,#C9A84C 50%,#19B886 62%,#f3fbf7 80%);
        background-size: 200% auto; -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent; animation: fr-shimmer 5.5s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .fr-shimmer { animation: none; }
        [class*="fr-blob"] { animation: none !important; }
      }
    `}</style>
  );
}

/* ── 1. Cinematic preloader ─────────────────────────────────────── */
export function Preloader({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);
  const [gone, setGone] = useState(false);

  const { appName } = useBranding();

  useEffect(() => {
    if (reduce) { setGone(true); onDone(); return; }
    const c = animate(0, 100, {
      duration: 1.7, ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setN(Math.round(v)),
      onComplete: () => setTimeout(() => setGone(true), 220),
    });
    return () => c.stop();
  }, [reduce, onDone]);

  return (
    <AnimatePresence onExitComplete={onDone}>
      {!gone && (
        /* BUG-097 — `role="status"` because this is a splash screen whose text
           ("FinRoot", "100%") sat outside every landmark, so axe reported the
           page as having content nobody could navigate to. It is not content;
           it is a progress announcement, and a live region says so — which
           also means a screen reader hears "Loading FinRoot" instead of the
           two orphan strings. `aria-hidden` would have silenced the rule too,
           but it would leave a screen-reader user on a page that appears
           completely empty for the 1.7 s the splash lasts. */
        <motion.div
          role="status"
          aria-label="Loading FinRoot"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#06070a]"
          exit={{ y: "-100%" }}
          transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3"
          >
            <BrandLogo className="w-12 h-12 rounded-xl" />
            <span className="text-2xl font-semibold tracking-tight text-white">{appName}</span>
          </motion.div>
          <div className="mt-8 w-56 h-px bg-white/10 overflow-hidden rounded-full">
            <motion.div className="h-full bg-[#19B886]" style={{ width: `${n}%` }} />
          </div>
          <div className="mt-3 font-mono text-xs tracking-[0.3em] text-[#8b9a94]">
            {String(n).padStart(3, "0")} · LOADING WEALTH OS
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── 2. Custom magnetic cursor (fine-pointer only) ──────────────── */
export function Cursor() {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);
  const [active, setActive] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 350, damping: 30, mass: 0.5 });
  const ringY = useSpring(y, { stiffness: 350, damping: 30, mass: 0.5 });

  useEffect(() => {
    if (reduce || !window.matchMedia("(pointer:fine)").matches) return;
    setOn(true);
    document.documentElement.classList.add("fr-cursor-none");
    const move = (e: MouseEvent) => {
      x.set(e.clientX); y.set(e.clientY);
      const el = e.target as Element | null;
      setActive(!!el?.closest?.("a,button,[data-cursor]"));
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => {
      window.removeEventListener("mousemove", move);
      document.documentElement.classList.remove("fr-cursor-none");
    };
  }, [reduce, x, y]);

  if (!on) return null;
  return (
    <>
      <motion.div
        className="pointer-events-none fixed top-0 left-0 z-[90] rounded-full border border-[#19B886]/70 mix-blend-difference"
        style={{ x: ringX, y: ringY, translateX: "-50%", translateY: "-50%" }}
        animate={{ width: active ? 52 : 30, height: active ? 52 : 30, opacity: active ? 1 : 0.7 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      />
      <motion.div
        className="pointer-events-none fixed top-0 left-0 z-[90] w-1.5 h-1.5 rounded-full bg-[#19B886]"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
      />
    </>
  );
}

/* ── 3. Mouse-reactive aurora / mesh background ─────────────────── */
export function Aurora() {
  const reduce = useReducedMotion();
  const mx = useMotionValue(50);
  const my = useMotionValue(18);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const spotlight = useMotionTemplate`radial-gradient(620px 420px at ${sx}% ${sy}%, rgba(25,184,134,0.16), transparent 70%)`;

  useEffect(() => {
    if (reduce) return;
    const move = (e: MouseEvent) => {
      mx.set((e.clientX / window.innerWidth) * 100);
      my.set((e.clientY / window.innerHeight) * 100);
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, [reduce, mx, my]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#06070a]">
      {/* animated mesh blobs */}
      <div className="absolute -top-1/3 left-[8%] w-[55vw] h-[55vw] rounded-full opacity-60 fr-blobA"
        style={{ background: "radial-gradient(circle, rgba(25,184,134,0.20), transparent 62%)", filter: "blur(60px)", animation: reduce ? undefined : "fr-blobA 16s ease-in-out infinite" }} />
      <div className="absolute top-[20%] right-[2%] w-[48vw] h-[48vw] rounded-full opacity-50"
        style={{ background: "radial-gradient(circle, rgba(45,125,210,0.16), transparent 60%)", filter: "blur(70px)", animation: reduce ? undefined : "fr-blobB 20s ease-in-out infinite" }} />
      <div className="absolute bottom-[-20%] left-[30%] w-[50vw] h-[50vw] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, rgba(201,168,76,0.12), transparent 60%)", filter: "blur(80px)", animation: reduce ? undefined : "fr-blobC 24s ease-in-out infinite" }} />
      {/* technical grid */}
      <div className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(ellipse 100% 80% at 50% 0%, #000 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 100% 80% at 50% 0%, #000 30%, transparent 78%)",
        }} />
      {/* cursor spotlight */}
      {!reduce && <motion.div className="absolute inset-0" style={{ background: spotlight }} />}
      {/* grain */}
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      {/* vignette */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 90% 70% at 50% 40%, transparent 40%, rgba(6,7,10,0.7) 100%)" }} />
    </div>
  );
}
