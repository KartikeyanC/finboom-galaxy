import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  motion, useReducedMotion, useScroll, useTransform, useSpring,
} from "framer-motion";
import {
  ArrowRight, ArrowUpRight, Check, ChevronDown, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { SkipLink } from "@/components/SkipLink";
import { useBranding } from "@/hooks/useBranding";
import { useResolvedPricing } from "@/hooks/usePricingContent";

import {
  BUCKETS,
  FAQ,
  FEATURES,
  MARQUEE,
  STATS,
  WORKFLOW,
} from "./landing/content";
import { Aurora, Cursor, GlobalFX, Preloader } from "./landing/effects";
import { card, eyebrow, CTA_PRIMARY } from "./landing/tokens";
import { CountUp, Magnetic, Reveal, SpotlightCard } from "./landing/primitives";
import GlassDashboard from "./landing/GlassDashboard";
import FloatingNav from "./landing/FloatingNav";
import KineticHeadline from "./landing/KineticHeadline";
import Voices from "./landing/Voices";
import FaqItem from "./landing/FaqItem";

/* ═══════════════════════════ page ═══════════════════════════ */
const Landing = () => {
  // Copy from site_settings, prices from the `plans` catalogue (BUG-019).
  const pricing = useResolvedPricing();
  const brand = useBranding();
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false);

  // Stage 4.9 / BUG-051 — everything in the hero is hidden until the preloader
  // calls onDone. If that never fires (an asset stalls, an animation frame is
  // dropped in a background tab), the headline, subcopy and CTAs stay at
  // opacity 0 with no way back. Reveal regardless after a beat: the animation
  // is a flourish, and it must not be able to withhold the page.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  // hero parallax on the showcase
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroScroll } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const showcaseY = useTransform(heroScroll, [0, 1], [0, reduce ? 0 : -90]);
  const showcaseOpacity = useTransform(heroScroll, [0, 0.8], [1, reduce ? 1 : 0.25]);

  // workflow scroll line
  const wfRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: wfScroll } = useScroll({ target: wfRef, offset: ["start 70%", "end 60%"] });
  const wfLine = useSpring(wfScroll, { stiffness: 100, damping: 30 });

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = reduce ? "auto" : "smooth";
    return () => { document.documentElement.style.scrollBehavior = prev; };
  }, [reduce]);

  return (
    /* BUG-094 — `bg-[#06070a]` is not decoration, it is the fix.
       This page is a fixed dark design (every colour on it is a hardcoded dark-
       theme hex), but its root had NO background, so it inherited the theme's
       `--background`. Under the light theme that put #c9cfcc text on a #f4f7fa
       page — the entire marketing site rendered as pale grey on white, at
       2.7:1. It went unnoticed for so long because the theme is stored per
       device and defaults to obsidian, so you only ever saw it if you switched
       to light and then went back to the landing page. */
    <div className="relative min-h-screen bg-[#06070a] text-[#c9cfcc] font-['IBM_Plex_Sans'] antialiased selection:bg-[#19B886]/30 selection:text-white">
      <GlobalFX />
      <Aurora />
      <Cursor />
      <Preloader onDone={() => setReady(true)} />

      {!reduce && (
        <motion.div className="fixed top-0 left-0 right-0 h-0.5 origin-left bg-gradient-to-r from-[#19B886] via-[#C9A84C] to-[#19B886] z-[60]" style={{ scaleX: progress }} />
      )}

      {/* Stage 4.8 / BUG-052 — skip past the nav straight to the content.
          Shared since BUG-093: two later pages never got their own copy. */}
      <SkipLink target="landing-main" className="focus:bg-[#19B886] focus:text-[#04120d] focus:ring-white/70" />

      <FloatingNav />

      {/* Stage 4.8 — the landing page had no <main> landmark at all, so "jump
          to main content" had nothing to jump to in any screen reader. */}
      <main id="landing-main" tabIndex={-1}>

      {/* ═══ HERO ═══ */}
      <section ref={heroRef} className="relative max-w-6xl mx-auto px-6 pt-32 sm:pt-36 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
          {/* copy */}
          <div className="text-center lg:text-left">
            <div><KineticHeadline ready={ready} /></div>

            <motion.p initial={{ opacity: 0, y: 18 }} animate={ready ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-7 text-lg text-[#9aa3a0] max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Income, spending, investments and goals — unified on the 7-bucket model. Built for people who want clarity, not another dashboard to manage.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 18 }} animate={ready ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, delay: 0.62 }}
              className="mt-9 flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3">
              <Magnetic>
                <Link to="/auth" data-cursor>
                  <Button className={`${CTA_PRIMARY} px-6 h-12 text-base group relative overflow-hidden`}>
                    <span className="relative z-10 flex items-center">
                      Start free — no card
                      <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  </Button>
                </Link>
              </Magnetic>
              <a href="#product" data-cursor className="px-6 h-12 inline-flex items-center gap-2 text-sm text-[#c9cfcc] hover:bg-white/5 rounded-xl border border-white/15 transition-colors">
                See the product <ChevronDown className="w-4 h-4" />
              </a>
            </motion.div>

          </div>

          {/* showcase with parallax + float */}
          <motion.div style={{ y: showcaseY, opacity: showcaseOpacity }}
            initial={{ opacity: 0, scale: 0.96 }} animate={ready ? { opacity: 1, scale: 1 } : {}} transition={{ duration: 0.9, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative">
            <div className="absolute -inset-6 rounded-3xl bg-[#19B886]/10 blur-3xl -z-10" />
            {/*
              Stage 4.7 / BUG-053 — the audit counted "121 text nodes under
              12 px" here. Almost all of them are inside this decorative
              mock-up: a scaled-down rendering of the product, where 8–9 px is
              the whole point. Enlarging it would break the illusion and fix
              nothing, because none of it is content.
              The real defect was that it is exposed to assistive tech at all:
              a screen reader announced invented balances, KPIs and category
              names as though they were the visitor's own figures. Hiding it
              removes ~120 fake nodes from the accessibility tree and leaves a
              landing page whose readable text is the copy that means something.
            */}
            <div aria-hidden="true">
              <GlassDashboard />
            </div>
          </motion.div>
        </div>

        {/* stats strip */}
        <Reveal className="mt-20 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] uppercase tracking-[0.12em] text-[#8b9a94]">
          {STATS.map((s, i) => (
            <span key={s.v} className="inline-flex items-center gap-8">
              <span><CountUp value={s.k} className="text-[#19B886] tracking-tight text-sm normal-case" /> <span className="ml-1.5">{s.v}</span></span>
              {/* Decorative separator, so it needs no contrast ratio — but at
                  #2f3633 (1.63:1) it was invisible even to people who can see
                  it, which defeats the only job it has. aria-hidden because a
                  screen reader announcing "slash" between stats is noise. */}
              {i < STATS.length - 1 && (
                <span aria-hidden="true" className="text-[#4c5551]">/</span>
              )}
            </span>
          ))}
        </Reveal>
      </section>

      {/* ═══ MARQUEE ═══ */}
      <div className="relative overflow-hidden border-y border-white/10 py-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[#06070a] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[#06070a] to-transparent" />
        <motion.div className="flex w-max" animate={reduce ? undefined : { x: ["0%", "-50%"] }} transition={reduce ? undefined : { duration: 36, ease: "linear", repeat: Infinity }}>
          {[0, 1].map((k) => (
            <div key={k} aria-hidden={k === 1} className="flex shrink-0 gap-10 pr-10 whitespace-nowrap text-[11px] uppercase tracking-[0.12em] text-[#8b9a94]">
              {/* repeat the set so a single group always exceeds the viewport → seamless loop with no gap */}
              {Array.from({ length: 3 }).flatMap((_, r) =>
                MARQUEE.map((t, ti) => (
                  <span key={`${r}-${ti}`} className="inline-flex items-center gap-2.5"><span className="w-1 h-1 rounded-full bg-[#19B886]" /> {t}</span>
                )),
              )}
            </div>
          ))}
        </motion.div>
      </div>

      {/* ═══ PRODUCT — bento ═══ */}
      <section id="product" className="max-w-6xl mx-auto px-6 py-28 scroll-mt-24">
        <Reveal className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div>
            <div className={eyebrow + " mb-3"}>The product</div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight max-w-2xl text-white">One canvas. Every dimension of your money.</h2>
          </div>
          <p className="text-[#9aa3a0] max-w-md">A bento of focused tools — each quiet on its own, transformative together.</p>
        </Reveal>

        <div className="grid md:grid-cols-6 gap-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} i={i % 3} className={f.span}>
              <SpotlightCard className="h-full p-7 hover:border-[#19B886]/40 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-[#19B886]/10 border border-[#19B886]/25 flex items-center justify-center mb-5">
                  <f.icon className="w-5 h-5 text-[#19B886]" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">{f.title}</h3>
                <p className="text-sm text-[#9aa3a0] leading-relaxed">{f.body}</p>
                <ArrowUpRight className="absolute top-7 right-7 w-4 h-4 text-white/15 group-hover:text-[#19B886] group-hover:rotate-12 transition-all" />
              </SpotlightCard>
            </Reveal>
          ))}

          {/* 7-bucket ring */}
          <Reveal className="md:col-span-6">
            <div className={`${card} p-10 overflow-hidden`}>
              <div className="grid md:grid-cols-2 gap-10 items-center">
                <div>
                  <div className={eyebrow + " mb-3"}>The 7-bucket ritual</div>
                  <h3 className="text-3xl md:text-4xl font-semibold leading-tight mb-4 text-white">An ancient idea, engineered for modern paychecks.</h3>
                  <p className="text-[#9aa3a0] leading-relaxed mb-6">Every salary auto-distributes into seven intentional buckets. Spend without guilt. Invest without thought. Give without hesitation.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {BUCKETS.map((b) => (
                      <div key={b} className="flex items-center gap-2 text-sm text-[#c9cfcc]"><Check className="w-3.5 h-3.5 text-[#19B886]" />{b}</div>
                    ))}
                  </div>
                </div>
                <div className="relative aspect-square max-w-md mx-auto w-full">
                  <div className="absolute inset-10 rounded-full bg-[#19B886]/10 blur-3xl" />
                  <motion.div className="absolute inset-0" animate={reduce ? undefined : { rotate: 360 }} transition={reduce ? undefined : { duration: 60, ease: "linear", repeat: Infinity }}>
                    <div className="absolute inset-0 rounded-full border border-[#C9A84C]/25" />
                    <div className="absolute inset-8 rounded-full border border-[#19B886]/25" />
                    <div className="absolute inset-16 rounded-full border border-white/10" />
                    {BUCKETS.map((_, i) => {
                      const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
                      const x = 50 + 50 * Math.cos(angle); const y = 50 + 50 * Math.sin(angle);
                      return <div key={i} className="absolute w-2.5 h-2.5 rounded-full bg-[#19B886] shadow-[0_0_12px_rgba(25,184,134,0.8)]" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }} />;
                    })}
                  </motion.div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className={eyebrow + " mb-2"}>Allocated</div>
                      <div className="text-5xl font-semibold text-white"><CountUp value="100%" /></div>
                      <div className="text-sm text-[#8b9a94] mt-1">across 7 buckets</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ WORKFLOW — scroll storytelling ═══ */}
      <section id="workflow" ref={wfRef} className="max-w-6xl mx-auto px-6 py-28 scroll-mt-24">
        <Reveal className="text-center mb-16">
          <div className={eyebrow + " mb-3"}>The workflow</div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">Three movements. One quiet system.</h2>
        </Reveal>
        <div className="relative">
          {/* progress rail (desktop) */}
          <div className="hidden md:block absolute top-7 left-[16.66%] right-[16.66%] h-px bg-white/10">
            <motion.div className="h-full origin-left bg-gradient-to-r from-[#19B886] to-[#C9A84C]" style={{ scaleX: wfLine }} />
          </div>
          <div className="grid md:grid-cols-3 gap-3 md:gap-8">
            {WORKFLOW.map((s, i) => (
              <Reveal key={s.n} i={i}>
                <div className="relative">
                  <div className="hidden md:block mx-auto mb-7 w-3.5 h-3.5 rounded-full bg-[#19B886] shadow-[0_0_16px_rgba(25,184,134,0.9)] relative z-10" />
                  <SpotlightCard className="p-8 h-full hover:border-[#19B886]/40 transition-colors">
                    <div className="font-mono text-4xl text-[#19B886]/40 mb-6">{s.n}</div>
                    <h3 className="text-2xl font-semibold mb-3 text-white">{s.t}</h3>
                    <p className="text-sm text-[#9aa3a0] leading-relaxed">{s.d}</p>
                  </SpotlightCard>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ VOICES — carousel ═══ */}
      <section id="voices" className="max-w-6xl mx-auto px-6 py-28 scroll-mt-24">
        <Reveal className="text-center mb-14">
          <div className={eyebrow + " mb-3"}>Voices</div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">Calm money, in their words.</h2>
        </Reveal>
        <Voices />
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-28 scroll-mt-24">
        <Reveal className="text-center mb-14">
          <div className={eyebrow + " mb-3"}>{pricing.eyebrow}</div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">{pricing.title}</h2>
        </Reveal>
        <div className={`grid gap-3 ${pricing.cards.length === 1 ? "max-w-md mx-auto" : pricing.cards.length === 2 ? "md:grid-cols-2 max-w-2xl mx-auto" : "md:grid-cols-3"}`}>
          {pricing.cards.map((p, i) => (
            <Reveal key={`${p.name}-${i}`} i={i}>
              <motion.div whileHover={reduce ? undefined : { y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className={`relative h-full ${card} p-8 ${p.highlight ? "border-[#19B886]/40 bg-[#19B886]/[0.06] shadow-[0_0_60px_-15px_rgba(25,184,134,0.5)]" : ""}`}>
                {p.badge && <div className="absolute -top-3 left-8 px-3 py-1 rounded-md bg-[#19B886] text-[#04130d] text-[11px] uppercase tracking-[0.15em] font-semibold">{p.badge}</div>}
                <div className="text-sm text-[#9aa3a0] mb-2">{p.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-semibold text-white">{p.price}</span>
                  {p.period && <span className="text-sm text-[#8b9a94]">{p.period}</span>}
                </div>
                <p className="text-sm text-[#9aa3a0] mt-3 mb-7">{p.blurb}</p>
                <ul className="space-y-2.5 mb-8">
                  {p.features.map((f, fi) => (
                    <li key={`${f}-${fi}`} className="flex items-start gap-2.5 text-sm text-[#c9cfcc]"><Check className="w-4 h-4 text-[#19B886] mt-0.5 flex-shrink-0" />{f}</li>
                  ))}
                </ul>
                <Link to={p.ctaHref || "/auth"} data-cursor className="block">
                  <Button className={`w-full h-11 font-medium ${p.highlight ? CTA_PRIMARY : "bg-white/5 hover:bg-white/10 text-white border border-white/15 rounded-xl"}`}>{p.cta}</Button>
                </Link>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-28 scroll-mt-24">
        <Reveal className="text-center mb-12">
          <div className={eyebrow + " mb-3"}>FAQ</div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">Answers, before you ask.</h2>
        </Reveal>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {FAQ.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="max-w-6xl mx-auto px-6 py-28">
        <Reveal className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#0a0c0e] p-12 md:p-24 text-center">
          <div className="pointer-events-none absolute inset-0" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "radial-gradient(ellipse 70% 90% at 50% 0%, #000, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 90% at 50% 0%, #000, transparent 75%)",
          }} />
          <motion.div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[680px] h-[420px] rounded-full"
            style={{ background: "radial-gradient(ellipse at center, rgba(25,184,134,0.28), transparent 70%)", filter: "blur(40px)" }}
            animate={reduce ? undefined : { opacity: [0.6, 1, 0.6] }} transition={reduce ? undefined : { duration: 7, repeat: Infinity, ease: "easeInOut" }} />
          <div className="relative">
            <span className={`inline-flex items-center gap-1.5 ${eyebrow} mb-5`}><Sparkles className="w-3.5 h-3.5" /> Two minutes to set up</span>
            <h2 className="text-4xl md:text-6xl font-semibold tracking-tight max-w-3xl mx-auto leading-[1.05] text-white">Begin the ritual your future self will thank you for.</h2>
            <p className="mt-6 text-[#9aa3a0] max-w-xl mx-auto">A lifetime of clarity, starting with one quiet decision today.</p>
            <Magnetic className="inline-block mt-10">
              <Link to="/auth" data-cursor>
                <Button className={`${CTA_PRIMARY} h-12 px-8 text-base group relative overflow-hidden`}>
                  <span className="relative z-10 flex items-center">Get started — it's free <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-0.5" /></span>
                  <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                </Button>
              </Link>
            </Magnetic>
          </div>
        </Reveal>
      </section>

      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BrandLogo className="w-7 h-7 rounded-[2px]" />
              <span className="text-lg font-semibold text-white">{brand.appName}</span>
            </div>
            <p className="text-xs text-[#8b9a94] leading-relaxed">{brand.tagline}</p>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[#9aa3a0]">
              <span aria-hidden className="text-sm leading-none">🇮🇳</span> Made in India
            </div>
          </div>
          {/* Stage 5.1 — Privacy and Terms were `#` placeholders on a public
              marketing page: a visitor who wanted to know what happens to their
              financial data was sent nowhere. They are real routes now. */}
          {[
            { t: "Product", l: [{ n: "Features", h: "#product" }, { n: "Pricing", h: "#pricing" }] },
            { t: "Company", l: [{ n: "FAQ", h: "#faq" }, { n: "Support", h: "/support" }, { n: "Status", h: "/status" }] },
            { t: "Legal", l: [{ n: "Privacy", h: "/privacy" }, { n: "Terms", h: "/terms" }] },
          ].map((col) => (
            <div key={col.t}>
              <div className={eyebrow + " mb-3"}>{col.t}</div>
              {/* Stage 4.7: `inline-block py-1` takes each footer link from an
                  18 px line box to a 26 px target. The visual rhythm is kept by
                  dropping the list gap to match what the padding now adds. */}
              <ul className="space-y-1 text-sm text-[#9aa3a0]">
                {col.l.map((i) => <li key={i.n}><a href={i.h} data-cursor className="inline-block py-1 hover:text-white transition-colors">{i.n}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-[#8b9a94]">
            <span>© 2026 {brand.appName}. All rights reserved.</span>
            <span className="inline-flex items-center gap-1.5">Made in India <span aria-hidden className="text-sm leading-none">🇮🇳</span></span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
