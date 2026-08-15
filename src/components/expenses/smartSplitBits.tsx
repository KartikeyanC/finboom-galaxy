import { cn } from "@/lib/utils";

/**
 * The two presentational shells Smart Split's flow canvas is built from —
 * split out of SmartSplit.tsx in Stage 4.13. Pure: colour and text in, markup
 * out, no knowledge of allocations or totals.
 */

/* ------------------------------- bits ------------------------------- */

export function NodeShell({
  children,
  accent,
  glow,
}: {
  children: React.ReactNode;
  accent: string;
  glow?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-card p-3 transition-shadow"
      style={{
        borderColor: `${accent}38`,
        boxShadow: glow
          ? `0 10px 34px -14px ${accent}66, inset 0 1px 0 0 #ffffff0a`
          : `0 6px 22px -16px ${accent}88, inset 0 1px 0 0 #ffffff08`,
      }}
    >
      {/* subtle accent wash from the rail edge */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(90deg, ${accent}14, transparent 38%)` }}
      />
      <span
        className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-1 rounded-full"
        style={{ background: accent, boxShadow: `0 0 12px ${accent}99` }}
      />
      <div className="relative pl-1.5">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn" | "bad" | "info";
}) {
  const toneClass =
    tone === "ok"
      ? "text-primary"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "bad"
          ? "text-coral"
          : tone === "info"
            ? "text-sky-400"
            : "text-foreground";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("font-display text-sm font-bold tabular-nums", toneClass)}>{value}</span>
    </span>
  );
}
