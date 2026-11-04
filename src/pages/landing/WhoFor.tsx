import { ArrowRight } from "lucide-react";

import { WHO } from "./content";
import { eyebrow } from "./tokens";
import { Reveal } from "./primitives";

/**
 * "Who it's for" — the persona strip under the hero. The first card is the
 * primary persona (the person who keeps a household's money on track) and is
 * drawn larger; the rest link to the section that answers their question.
 */
export default function WhoFor() {
  return (
    <section id="who" aria-labelledby="who-title" className="max-w-6xl mx-auto px-6 pt-24 scroll-mt-24">
      <Reveal className="mb-8">
        <div className={eyebrow + " mb-3"}>Who it's for</div>
        <h2 id="who-title" className="text-3xl md:text-4xl font-semibold tracking-tight text-white max-w-3xl">
          Built for the person who keeps <span className="text-[#8b9a94]">the household's money on track.</span>
        </h2>
      </Reveal>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]">
        {WHO.map((w, i) => (
          <li key={w.title} className={w.main ? "sm:col-span-2 lg:col-span-1" : ""}>
            <Reveal i={i} className="h-full">
              <a
                href={w.href}
                data-cursor
                className={`group flex h-full flex-col gap-2 rounded-2xl border p-6 transition-colors ${w.main
                  ? "border-[#0D7A5F]/40 bg-[#0D7A5F]/[0.08] hover:border-[#0D7A5F]/70"
                  : "border-white/10 bg-white/[0.025] hover:border-white/25"}`}
              >
                {w.main && (
                  <span className="self-start mb-1 rounded-md bg-[#0D7A5F] px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                    Designed around you
                  </span>
                )}
                <w.icon className="w-5 h-5 text-[#13B98F]" aria-hidden="true" />
                <h3 className={`font-semibold text-white ${w.main ? "text-xl" : "text-base"}`}>{w.title}</h3>
                <p className="text-sm text-[#9aa3a0] leading-relaxed">{w.body}</p>
                <span className="mt-auto pt-3 inline-flex items-center gap-1.5 text-sm text-[#c9cfcc] group-hover:text-white">
                  {w.cta} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </a>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
