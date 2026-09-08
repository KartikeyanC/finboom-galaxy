# FinRoot motion system

The marketing site (`src/pages/Landing.tsx` + `src/pages/landing/`) already
carried a substantial, deliberate animation layer built on **framer-motion 12**
with a clean `tokens.ts` / `primitives.tsx` / `effects.tsx` split and a
`useReducedMotion` branch in every component. This document is the map of that
system plus the pieces added on `feat/landing-motion-system`.

## Architecture

| Path | Holds |
|---|---|
| `src/animations/motionTokens.ts` | the single source for durations, easing curves, stagger steps, travel distances, spring presets, viewport margins |
| `src/animations/variants.ts` | reusable framer `Variants` built from the tokens — `fadeUp/Down/Left/Right`, `fadeIn`, `scaleIn`, `blurIn`, `clipRise`, `staggerContainer` |
| `src/animations/registry.ts` | `REGISTRY` (the catalogue), `logMotion()` / `motionDebugEnabled()` (the `?motionDebug=true` logger, a no-op otherwise), `AnimationIntensity` + `resolveIntensity()` |
| `src/animations/index.ts` | barrel — `import { ease, duration, fadeUp, logMotion } from "@/animations"` |
| `src/components/motion/` | `MotionReveal`, `StaggerContainer`, `TiltCard`, `PageTransition`, `MotionDebug` |

The landing page's existing `primitives.tsx` (`Reveal`, `CountUp`, `Magnetic`,
`SpotlightCard`) and `effects.tsx` (`Preloader`, `Cursor`, `Aurora`, `GlobalFX`)
**stay** — they are good. They now import the house easing curve
(`ease.standard`, formerly fifteen inline copies of `[0.22, 1, 0.36, 1]`) and
the magnetic spring from `@/animations` so a timing change lands in one place.

## What was already there (do not rebuild)

preloader · custom cursor (dot + spring ring, `[data-cursor]`, fine-pointer +
reduced-motion gated) · mouse-reactive aurora/mesh/grain/vignette · scroll
progress bar · kinetic word-rise headline + gradient shimmer · scroll reveal +
stagger · count-up (en-IN, on-view, once) · magnetic CTAs · spotlight cards ·
hero parallax + fade-out · marquee · nav (reveal, hide-on-scroll, bg morph,
shared-layout active pill, mobile menu) · workflow scroll-storytelling rail ·
7-bucket rotating ring · pricing hover lift · FAQ accordion · Voices carousel ·
CTA grid-mask + glow pulse · a complete reduced-motion story with the documented
rule *readability must never depend on an animation completing* (BUG-051).

## Added on this branch

| Item | File |
|---|---|
| Centralised motion tokens + variant presets + registry | `src/animations/*` |
| `<MotionReveal variant=… delay=… i=… />` — variant-driven reveal API | `components/motion/MotionReveal.tsx` |
| `<StaggerContainer step=… />` | `components/motion/StaggerContainer.tsx` |
| `<TiltCard max=… />` — 3D perspective tilt, fine-pointer + reduced-motion gated | `components/motion/TiltCard.tsx` |
| `<PageTransition>` — gentle mount entrance on the public routes (`/`, `/auth`, legal, support, status, invite, reset, po/login, 404); the `/app` and `/po` shells are deliberately **not** wrapped | `components/motion/PageTransition.tsx`, wired in `App.tsx` |
| `?motionDebug=true` — console registry table + dashed outlines on animated nodes + a corner badge | `components/motion/MotionDebug.tsx`, mounted in `App.tsx` |
| Marquee hover-pause — moved from a framer keyframe loop to a CSS `@keyframes` in `GlobalFX` so `:hover` can pause it via `animation-play-state` | `Landing.tsx` + `effects.tsx` |
| `AnimationIntensity` (`minimal` / `balanced` / `expressive`) + `resolveIntensity()` | `registry.ts` — the type and resolver exist; no UI toggle yet (see below) |

## Deferred — with reasons

- **True cross-page crossfade** (exit + enter). Needs the `<Routes location key>`
  + `<AnimatePresence mode="wait">` refactor of `App.tsx`, and with lazy routes
  behind one `<Suspense>` a `mode="wait"` exit stalls the next chunk fetch. The
  mount-entrance `<PageTransition>` is the safe 90%.
- **Horizontal-scroll gallery.** The product bento is a deliberate grid; forcing
  a horizontal scroll section would fight the prompt's own "never trap the
  user's scroll" rule for little gain.
- **Text scramble / decode.** The kinetic headline is a word-rise; scramble on
  top would be motion for its own sake on the page's `<h1>`.
- **Intensity toggle UI.** `resolveIntensity()` is ready; a Settings control that
  writes a device-local `finroot.motion.intensity` key (register it in
  `deviceLocal.ts`) and a `MotionConfigProvider` reading it is the next step.
- **`TiltCard` rollout.** Built and safe; not yet applied to any section —
  candidates are the bento feature cards and the pricing cards, one at a time.

## Rules

- Every primitive renders its children **at rest** with no wrapper animation
  under `prefers-reduced-motion`. `<PageTransition>` and `<TiltCard>` become
  pass-through `<div>`s; `<MotionReveal>` renders the plain tag.
- `cursor`, `magnetic`, `TiltCard`, hero pointer-parallax: additionally gated to
  `(pointer: fine)`.
- Animate `transform` / `opacity` only. `will-change` is set on the two infinite
  loops (marquee, aurora blobs) and nowhere else.
- `logMotion(...)` calls are free to leave in shipped components — no-op unless
  `?motionDebug=true`.
