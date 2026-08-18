import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { SkipLink } from "@/components/SkipLink";
import { useBranding } from "@/hooks/useBranding";

/**
 * Chrome for the public pages that are read rather than browsed — the two legal
 * documents (5.1), Support and Status (5.7).
 *
 * One column, generous line height, real heading levels, no animation: the
 * landing page's effects layer is deliberately absent. It renders on the same
 * dark surface so it still looks like the product, but nothing here depends on
 * the marketing page, and none of it needs a session — somebody who cannot sign
 * in must still be able to read the status page and find the support address.
 */
export default function PublicLayout({
  eyebrow,
  title,
  summary,
  meta,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  /** Small line under the summary — a version, an effective date, a timestamp. */
  meta?: ReactNode;
  children: ReactNode;
}) {
  const { appName } = useBranding();
  return (
    <div className="min-h-screen bg-[#06070a] text-[#c9cfcc] font-['IBM_Plex_Sans'] antialiased">
      {/* BUG-093 — these pages had the <main> landmark but no way to reach it. */}
      <SkipLink target="public-main" />
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandLogo className="w-8 h-8 rounded-[2px]" />
            <span className="text-base font-semibold tracking-tight text-white">{appName}</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-[#9aa3a0] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to site
          </Link>
        </div>
      </header>

      <main id="public-main" tabIndex={-1} className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#19B886] font-medium">{eyebrow}</p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-4 text-[#9aa3a0] leading-relaxed">{summary}</p>
        {meta && <div className="mt-4 text-xs text-[#8b9a94]">{meta}</div>}

        <div className="mt-10 space-y-10">{children}</div>

        <footer className="mt-16 border-t border-white/10 pt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#9aa3a0]">
          <Link to="/support" className="inline-block py-1 hover:text-white transition-colors">Support</Link>
          <Link to="/status" className="inline-block py-1 hover:text-white transition-colors">Status</Link>
          <Link to="/privacy" className="inline-block py-1 hover:text-white transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="inline-block py-1 hover:text-white transition-colors">Terms of Service</Link>
          <Link to="/" className="inline-block py-1 hover:text-white transition-colors">Home</Link>
        </footer>
      </main>
    </div>
  );
}

/** One section of a public document. */
export function Section({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-xl font-semibold text-white">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#9aa3a0]">{children}</div>
    </section>
  );
}
