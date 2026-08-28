/**
 * Clamped completion percentage.
 *
 * Extracted from GoalManager.tsx:308-310, where it had been inlined, when
 * trackers became the second consumer — the trigger docs/Coding_Standards.md
 * names for moving shared logic into `lib/`.
 *
 * Clamps at 100 rather than reporting 140%: a progress BAR that overflows its
 * track is a rendering bug, and the "you are over" signal belongs in the
 * remaining figure, which can go negative honestly.
 */
export function percentOf(current: number, target: number | null | undefined): number {
  const t = Number(target);
  if (!Number.isFinite(t) || t <= 0) return 0;
  const c = Number(current);
  if (!Number.isFinite(c) || c <= 0) return 0;
  return Math.min(100, Math.round((c / t) * 100));
}
