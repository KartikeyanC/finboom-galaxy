import { describe, it, expect } from "vitest";
import { percentOf } from "./progress";

/**
 * `percentOf` was inlined in GoalManager.tsx until trackers became a second
 * consumer. These pin the edges that an inline expression kept re-deciding.
 */
describe("percentOf", () => {
  it("reports the obvious case", () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(50, 200)).toBe(25);
  });

  it("clamps at 100 rather than overflowing a progress bar", () => {
    expect(percentOf(140, 100)).toBe(100);
    expect(percentOf(1e9, 1)).toBe(100);
  });

  it("is 0 for a target that cannot be divided by", () => {
    expect(percentOf(50, 0)).toBe(0);
    expect(percentOf(50, null)).toBe(0);
    expect(percentOf(50, undefined)).toBe(0);
    expect(percentOf(50, -10)).toBe(0);
  });

  it("never returns NaN", () => {
    for (const [c, t] of [
      [Number.NaN, 100],
      [50, Number.NaN],
      [Number.POSITIVE_INFINITY, 100],
    ] as const) {
      expect(Number.isFinite(percentOf(c, t))).toBe(true);
    }
  });

  it("treats a negative or zero current as no progress", () => {
    expect(percentOf(-5, 100)).toBe(0);
    expect(percentOf(0, 100)).toBe(0);
  });

  it("is monotonic in current", () => {
    let prev = -1;
    for (const c of [0, 10, 25, 50, 75, 100, 200]) {
      const p = percentOf(c, 100);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});
