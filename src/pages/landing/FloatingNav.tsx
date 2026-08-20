import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  motion, AnimatePresence, useScroll, useMotionValue, useMotionValueEvent,
} from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useBranding } from "@/hooks/useBranding";

import { NAV } from "./content";
import { CTA_PRIMARY } from "./tokens";
import { Magnetic } from "./primitives";

/**
 * The floating glass nav — split out of Landing.tsx in Stage 4.13.
 *
 * It carries three pieces of scroll state (hidden-on-scroll-down, the
 * scrolled background, the active section pill) plus the promo-banner offset
 * measurement, none of which the page body reads. `useActiveSection` lives
 * here because this is its only caller.
 */

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

/* ── 4. Floating, scroll-aware glass nav ────────────────────────── */
export default function FloatingNav() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const last = useRef(0);
  const active = useActiveSection(["product", "workflow", "voices", "pricing", "faq"]);
  const { appName } = useBranding();

  // Track the promo banner so the nav floats *below* it at the top of the page
  // and slides up to the edge as the banner scrolls away (or is dismissed).
  const navTop = useMotionValue(12);
  const measureTop = useCallback(() => {
    const b = document.getElementById("promo-banner");
    const bottom = b ? Math.max(0, b.getBoundingClientRect().bottom) : 0;
    navTop.set(Math.max(12, bottom + 8));
  }, [navTop]);

  useEffect(() => {
    measureTop();
    const ro = new ResizeObserver(measureTop);
    ro.observe(document.body);
    window.addEventListener("resize", measureTop);
    return () => { ro.disconnect(); window.removeEventListener("resize", measureTop); };
  }, [measureTop]);

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 24);
    setHidden(y > last.current && y > 220 && !open);
    last.current = y;
    measureTop();
  });

  return (
    <motion.header
      initial={{ y: -120, opacity: 0 }}
      animate={{ y: hidden ? -120 : 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ top: navTop }}
      className="fixed inset-x-0 z-50 px-4"
    >
      <div className={`mx-auto max-w-5xl flex items-center justify-between gap-4 rounded-2xl border px-4 h-14 transition-colors duration-300 ${scrolled ? "border-white/10 bg-[#06070a]/70 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.4)]" : "border-white/[0.06] bg-white/[0.02] backdrop-blur-md"}`}>
        <Link to="/" data-cursor className="flex items-center gap-2.5 shrink-0">
          <BrandLogo className="w-8 h-8 rounded-[2px]" />
          <span className="text-base font-semibold tracking-tight text-white">{appName}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-[12px] text-[#9aa3a0]">
          {NAV.map((n) => {
            const id = n.href.slice(1);
            const is = active === id;
            return (
              <a key={n.label} href={n.href} data-cursor
                className={`relative px-3 py-1.5 rounded-lg transition-colors ${is ? "text-white" : "hover:text-white"}`}>
                {is && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-white/[0.07] border border-white/10" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                <span className="relative">{n.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <Link to="/auth" data-cursor className="text-sm text-[#9aa3a0] hover:text-white transition-colors px-3 py-2">Sign in</Link>
          <Magnetic>
            <Link to="/auth?tab=signup" data-cursor><Button className={`${CTA_PRIMARY} px-5 h-9`}>Start free</Button></Link>
          </Magnetic>
        </div>
        {/* BUG-053 — p-2 + a w-5 icon was a 36×36 target, under the 44px
            floor; p-3 brings it to exactly 44×44 without changing the icon. */}
        <button onClick={() => setOpen((o) => !o)} data-cursor aria-label="Menu" className="md:hidden text-white p-3 -mr-3">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="md:hidden mx-auto max-w-5xl mt-2 rounded-2xl border border-white/10 bg-[#06070a]/90 backdrop-blur-xl p-4"
          >
            {NAV.map((n) => (
              <a key={n.label} href={n.href} onClick={() => setOpen(false)} className="block py-3 text-[15px] text-[#c9cfcc] border-b border-white/5 last:border-0">{n.label}</a>
            ))}
            <Link to="/auth?tab=signup" onClick={() => setOpen(false)}>
              <Button className={`${CTA_PRIMARY} w-full h-11 mt-4`}>Start free — no card</Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
