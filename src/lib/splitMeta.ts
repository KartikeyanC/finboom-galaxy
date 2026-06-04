// Split-transaction metadata embedded inside `description`.
// Format: ⟦SPLIT|<mode>|<friend>⟧ rest-of-description
// We use Unicode brackets that won't appear in normal typing so it's safe to detect.

export type SplitMode = "paid_full" | "settled" | "owe";

export interface SplitMeta {
  mode: SplitMode;
  friend: string;
}

const RE = /^⟦SPLIT\|(paid_full|settled|owe)\|([^⟧]*)⟧\s?/;

export function encodeSplit(meta: SplitMeta, rest: string): string {
  const friend = (meta.friend || "Friend").replace(/[|⟧]/g, "");
  const prefix = `⟦SPLIT|${meta.mode}|${friend}⟧`;
  return rest ? `${prefix} ${rest}` : prefix;
}

export function parseSplit(desc: string | null | undefined): {
  meta: SplitMeta | null;
  clean: string;
} {
  if (!desc) return { meta: null, clean: "" };
  const m = RE.exec(desc);
  if (!m) return { meta: null, clean: desc };
  return {
    meta: { mode: m[1] as SplitMode, friend: m[2] || "Friend" },
    clean: desc.slice(m[0].length),
  };
}

export const SPLIT_LABEL: Record<SplitMode, string> = {
  paid_full: "Paid for group",
  settled: "💳 Paid Friend via UPI",
  owe: "⚠️ Unsettled Due",
};