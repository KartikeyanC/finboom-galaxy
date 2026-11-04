import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import { PRIVACY } from "./content";
import { eyebrow } from "./tokens";
import { Reveal } from "./primitives";

/**
 * Privacy in plain words. Each promise is something the product does today —
 * RLS, encryption at rest, no tracking (ADR-0009), export (5.2) and deletion by
 * request. Change one only if the product changed first.
 */
export default function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="max-w-6xl mx-auto px-6 py-28 scroll-mt-24">
      <Reveal className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
        <div>
          <div className={eyebrow + " mb-3"}>Your data</div>
          <h2 id="privacy-title" className="text-4xl md:text-5xl font-semibold tracking-tight text-white max-w-2xl">
            What happens to your money data, <span className="text-[#8b9a94]">in plain words.</span>
          </h2>
        </div>
        <Link to="/privacy" data-cursor className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-[#c9cfcc] hover:text-white">
          Read the privacy policy <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </Reveal>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRIVACY.map((p, i) => (
          <li key={p.title}>
            <Reveal i={i % 3} className="h-full">
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#0D7A5F]/25 bg-[#0D7A5F]/10 mb-4" aria-hidden="true">
                  <p.icon className="w-5 h-5 text-[#13B98F]" />
                </span>
                <h3 className="text-lg font-semibold text-white">{p.title}</h3>
                <p className="mt-1.5 text-sm text-[#9aa3a0] leading-relaxed">{p.body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
