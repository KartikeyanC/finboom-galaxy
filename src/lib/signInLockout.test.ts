import { describe, it, expect, beforeEach } from "vitest";
import {
  signInLockStatus,
  recordFailedSignIn,
  clearSignInAttempts,
  formatRetryAfter,
} from "./signInLockout";

const EMAIL = "demo@finroot.app";

describe("signInLockout — BUG-101's client-side deterrent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is unlocked with no history", () => {
    expect(signInLockStatus(EMAIL)).toEqual({ locked: false });
  });

  it("does not lock before the 5-failure threshold", () => {
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) {
      const result = recordFailedSignIn(EMAIL, now + i * 1000);
      expect(result.locked).toBe(false);
    }
    expect(signInLockStatus(EMAIL, now + 4000)).toEqual({ locked: false });
  });

  it("locks on the 5th failure within the window", () => {
    const now = 1_000_000;
    let result;
    for (let i = 0; i < 5; i++) {
      result = recordFailedSignIn(EMAIL, now + i * 1000);
    }
    expect(result!.locked).toBe(true);
    expect(result!.retryAfterMs).toBeGreaterThan(0);
  });

  it("blocks a fresh attempt while locked, and clears once the lock expires", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) recordFailedSignIn(EMAIL, now);
    const status = signInLockStatus(EMAIL, now + 1000);
    expect(status.locked).toBe(true);

    const after = signInLockStatus(EMAIL, now + status.retryAfterMs! + 1000);
    expect(after.locked).toBe(false);
  });

  it("is keyed per email — one account's failures never lock another's", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) recordFailedSignIn(EMAIL, now);
    expect(signInLockStatus("someone-else@example.com", now).locked).toBe(false);
  });

  it("is case- and whitespace-insensitive on the email key", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) recordFailedSignIn("  Demo@FinRoot.app  ", now);
    expect(signInLockStatus(EMAIL, now).locked).toBe(true);
  });

  it("resets the window if the last failure was long ago", () => {
    for (let i = 0; i < 4; i++) recordFailedSignIn(EMAIL, 0);
    // 20 minutes later — outside the 15-minute window — the count restarts.
    const result = recordFailedSignIn(EMAIL, 20 * 60 * 1000);
    expect(result.locked).toBe(false);
  });

  it("clearSignInAttempts removes the lock and the history", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) recordFailedSignIn(EMAIL, now);
    expect(signInLockStatus(EMAIL, now).locked).toBe(true);
    clearSignInAttempts(EMAIL);
    expect(signInLockStatus(EMAIL, now)).toEqual({ locked: false });
  });

  it("formatRetryAfter reads naturally in seconds and minutes", () => {
    expect(formatRetryAfter(30_000)).toBe("30s");
    expect(formatRetryAfter(90_000)).toBe("2m");
  });
});
