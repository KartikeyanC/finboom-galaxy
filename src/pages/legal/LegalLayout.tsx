import type { ReactNode } from "react";
import PublicLayout, { Section as PublicSection } from "@/pages/public/PublicLayout";

import { LEGAL_EFFECTIVE, LEGAL_VERSION } from "@/lib/legal";

/**
 * Shared chrome for the two public legal documents (Stage 5.1).
 *
 * Stage 5.7 moved the header, footer and section styling into `PublicLayout`,
 * which Support and Status share. This file keeps what is specific to a legal
 * document: the "Legal" eyebrow and the effective-date/version line that must
 * agree with `lib/legal.ts`.
 */
export default function LegalLayout({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <PublicLayout
      eyebrow="Legal"
      title={title}
      summary={summary}
      meta={`Effective ${LEGAL_EFFECTIVE} · version ${LEGAL_VERSION}`}
    >
      {children}
    </PublicLayout>
  );
}

export const Section = PublicSection;

/** A plain data table — used for the data inventory and the retention periods. */
export function LegalTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            {head.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 font-medium text-white whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2.5 align-top text-[#9aa3a0]">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
