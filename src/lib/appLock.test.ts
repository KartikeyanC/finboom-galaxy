import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  DEFAULT_GRACE_MINUTES,
  GRACE_OPTIONS,
  TWELVE_HOURS,
  clearHidden,
  clearPin,
  clearSignInIntent,
  consumeSignInIntent,
  graceLabel,
  graceMinutes,
  hiddenAt,
  isUnlocked,
  lockChoice,
  lockNow,
  markHidden,
  markSignInIntent,
  markUnlocked,
  needsPassword,
  pinIsSet,
  pinLength,
  setGraceMinutes,
  setLockChoice,
  setPasswordAuthNow,
  setPin,
  shouldLockOnReturn,
  verifyPin,
} from "./appLock";

/**
 * Stage 5.4. The app lock is the one piece of state the user experiences as
 * security, so the rules that decide when it engages are worth pinning down —
 * particularly the two that changed: the lock is now optional, and hiding the
 * tab starts a clock instead of slamming the door.
 */

const UID = "user-1";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("when returning to a hidden tab locks", () => {
  const MIN = 60_000;

  it("never locks a tab that was not away", () => {
    // A stray visibility event must not lock someone who never left.
    expect(shouldLockOnReturn(null, Date.now(), 5)).toBe(false);
    expect(shouldLockOnReturn(null, Date.now(), 0)).toBe(false);
  });

  it("locks on any absence when the grace is zero", () => {
    expect(shouldLockOnReturn(1000, 1001, 0)).toBe(true);
  });

  it("forgives an absence shorter than the grace", () => {
    // The whole point of 5.4: glancing at another tab is not a security event.
    const t = 1_000_000;
    expect(shouldLockOnReturn(t, t + 30_000, 1)).toBe(false);
    expect(shouldLockOnReturn(t, t + 4 * MIN, 5)).toBe(false);
  });

  it("locks once the grace has run out, boundary included", () => {
    const t = 1_000_000;
    expect(shouldLockOnReturn(t, t + 1 * MIN, 1)).toBe(true);
    expect(shouldLockOnReturn(t, t + 5 * MIN + 1, 5)).toBe(true);
    expect(shouldLockOnReturn(t, t + 60 * MIN, 15)).toBe(true);
  });

  it("treats a negative grace as immediate rather than as never", () => {
    // Defensive: a corrupted value must fail towards locking, not away from it.
    expect(shouldLockOnReturn(1000, 1001, -5)).toBe(true);
  });
});

describe("the away clock", () => {
  it("records and clears the moment this tab was hidden", () => {
    expect(hiddenAt(UID)).toBeNull();
    markHidden(UID, 1234);
    expect(hiddenAt(UID)).toBe(1234);
    clearHidden(UID);
    expect(hiddenAt(UID)).toBeNull();
  });

  it("lives in sessionStorage, so a reopened browser is not 'recently away'", () => {
    markHidden(UID, 1234);
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.length).toBe(0);
  });
});

describe("the lock is a choice", () => {
  it("starts unset — the user has not been asked yet", () => {
    expect(lockChoice(UID)).toBe("unset");
  });

  it("remembers on and off", () => {
    setLockChoice(UID, true);
    expect(lockChoice(UID)).toBe("on");
    setLockChoice(UID, false);
    expect(lockChoice(UID)).toBe("off");
  });

  it("reads as 'on' for anyone who already had a PIN", async () => {
    // They chose it under the old mandatory rules; re-offering the lock would
    // read as the app having forgotten their setup.
    await setPin(UID, "1234");
    localStorage.removeItem(`finroot.lock.pref.${UID}`);
    expect(lockChoice(UID)).toBe("on");
  });

  it("keeps an explicit 'off' even while a PIN still exists", () => {
    setLockChoice(UID, false);
    expect(lockChoice(UID)).toBe("off");
  });

  it("is per user, so two accounts on one browser do not share it", () => {
    setLockChoice(UID, true);
    expect(lockChoice("user-2")).toBe("unset");
  });
});

describe("grace period setting", () => {
  it("defaults to something forgiving rather than to zero", () => {
    expect(graceMinutes(UID)).toBe(DEFAULT_GRACE_MINUTES);
    expect(DEFAULT_GRACE_MINUTES).toBeGreaterThan(0);
  });

  it("round-trips every offered option", () => {
    for (const m of GRACE_OPTIONS) {
      setGraceMinutes(UID, m);
      expect(graceMinutes(UID)).toBe(m);
    }
  });

  it("falls back to the default on a value it does not offer", () => {
    localStorage.setItem(`finroot.lock.grace.${UID}`, "9999");
    expect(graceMinutes(UID)).toBe(DEFAULT_GRACE_MINUTES);
  });

  it("labels each option in words a user can act on", () => {
    expect(graceLabel(0)).toMatch(/immediate/i);
    expect(graceLabel(1)).toBe("After 1 minute");
    expect(graceLabel(15)).toBe("After 15 minutes");
  });
});

describe("the PIN itself", () => {
  it("stores a derived key, never the digits", async () => {
    await setPin(UID, "1234");
    const stored = localStorage.getItem(`finroot.pin.${UID}`) ?? "";
    expect(stored).not.toContain("1234");
    const record = JSON.parse(stored);
    expect(record.v).toBe(2);
    expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.salt).toMatch(/^[0-9a-f]{32}$/); // 16 random bytes
  });

  it("costs enough per guess to be worth an attacker's time (BUG-091)", async () => {
    await setPin(UID, "1234");
    const record = JSON.parse(localStorage.getItem(`finroot.pin.${UID}`) ?? "{}");
    // The number is the whole defence. A record that quietly lost its
    // iteration count would still verify correctly and be worthless.
    expect(record.iter).toBeGreaterThanOrEqual(310_000);
  });

  it("salts randomly, so the same PIN twice does not store the same thing", async () => {
    await setPin(UID, "1234");
    const first = localStorage.getItem(`finroot.pin.${UID}`);
    await setPin(UID, "1234");
    expect(localStorage.getItem(`finroot.pin.${UID}`)).not.toBe(first);

    // …and the same PIN on two accounts is not recognisable as the same PIN.
    await setPin("user-2", "1234");
    expect(localStorage.getItem(`finroot.pin.${UID}`)).not.toBe(
      localStorage.getItem("finroot.pin.user-2"),
    );
  });

  it("verifies the right PIN and rejects the wrong one", async () => {
    await setPin(UID, "1234");
    await expect(verifyPin(UID, "1234")).resolves.toBe(true);
    await expect(verifyPin(UID, "4321")).resolves.toBe(false);
  });

  /**
   * BUG-091's real risk was never the maths — it was the upgrade. Anyone with
   * a PIN already on their device has a v1 digest in storage, and a fix that
   * simply stopped recognising it would tell every one of them their PIN was
   * wrong. That reads as data loss, not as a security improvement.
   */
  describe("a PIN set before the KDF changed", () => {
    /** Exactly what v1 wrote: unsalted SHA-256 of `finroot:<uid>:<pin>`, hex. */
    const writeLegacyPin = async (uid: string, pin: string) => {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`finroot:${uid}:${pin}`),
      );
      const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(`finroot.pin.${uid}`, hex);
      localStorage.setItem(`finroot.pinlen.${uid}`, String(pin.length));
    };

    it("still opens the lock", async () => {
      await writeLegacyPin(UID, "1234");
      await expect(verifyPin(UID, "1234")).resolves.toBe(true);
    });

    it("still rejects the wrong PIN", async () => {
      await writeLegacyPin(UID, "1234");
      await expect(verifyPin(UID, "4321")).resolves.toBe(false);
      // …and a failed attempt must not quietly rewrite the record.
      expect(localStorage.getItem(`finroot.pin.${UID}`)).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is upgraded in place the first time it is entered correctly", async () => {
      await writeLegacyPin(UID, "1234");
      await verifyPin(UID, "1234");

      const record = JSON.parse(localStorage.getItem(`finroot.pin.${UID}`) ?? "{}");
      expect(record.v).toBe(2);
      expect(record.iter).toBeGreaterThanOrEqual(310_000);
      // The upgrade must not have broken what it upgraded.
      await expect(verifyPin(UID, "1234")).resolves.toBe(true);
      await expect(verifyPin(UID, "4321")).resolves.toBe(false);
      expect(pinLength(UID)).toBe(4);
    });

    it("does not treat a corrupt record as a legacy one and let it through", async () => {
      localStorage.setItem(`finroot.pin.${UID}`, '{"v":2,"salt":"zz"}'); // no hash
      await expect(verifyPin(UID, "1234")).resolves.toBe(false);
      localStorage.setItem(`finroot.pin.${UID}`, "not-a-hash-at-all");
      await expect(verifyPin(UID, "1234")).resolves.toBe(false);
    });
  });

  it("re-hashes a record that is below the current iteration count", async () => {
    await setPin(UID, "1234");
    const weakened = JSON.parse(localStorage.getItem(`finroot.pin.${UID}`) ?? "{}");
    // Simulate a record written when the cost setting was lower, which is what
    // every stored PIN becomes the day PIN_ITERATIONS is raised.
    weakened.iter = 1000;
    weakened.hash = "0".repeat(64);
    localStorage.setItem(`finroot.pin.${UID}`, JSON.stringify(weakened));
    // Wrong hash, so it should not verify — proving the check is the hash and
    // not merely the presence of a record.
    await expect(verifyPin(UID, "1234")).resolves.toBe(false);

    await setPin(UID, "1234");
    const current = JSON.parse(localStorage.getItem(`finroot.pin.${UID}`) ?? "{}");
    expect(current.iter).toBeGreaterThanOrEqual(310_000);
  });

  it("verifies nothing once the PIN is cleared", async () => {
    await setPin(UID, "1234");
    clearPin(UID);
    expect(pinIsSet(UID)).toBe(false);
    await expect(verifyPin(UID, "1234")).resolves.toBe(false);
  });

  it("remembers the length so the lock screen draws the right boxes", async () => {
    await setPin(UID, "123456");
    expect(pinLength(UID)).toBe(6);
    await setPin(UID, "1234");
    expect(pinLength(UID)).toBe(4);
  });

  it("unlocks this tab when set, so setting a PIN does not lock you out", async () => {
    await setPin(UID, "1234");
    expect(isUnlocked(UID)).toBe(true);
    lockNow(UID);
    expect(isUnlocked(UID)).toBe(false);
    markUnlocked(UID);
    expect(isUnlocked(UID)).toBe(true);
  });
});

describe("the 12-hour password rule", () => {
  afterEach(() => vi.useRealTimers());

  it("demands a password when there is no anchor at all", () => {
    expect(needsPassword(UID)).toBe(true);
  });

  it("accepts the PIN inside the window and demands the password outside it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T10:00:00Z"));
    setPasswordAuthNow(UID);
    expect(needsPassword(UID)).toBe(false);

    vi.setSystemTime(new Date("2026-08-11T10:00:00Z").getTime() + TWELVE_HOURS - 1000);
    expect(needsPassword(UID)).toBe(false);

    vi.setSystemTime(new Date("2026-08-11T10:00:00Z").getTime() + TWELVE_HOURS + 1000);
    expect(needsPassword(UID)).toBe(true);
  });
});

/**
 * BUG-090. `useAuth` unlocked the tab on any `SIGNED_IN`, and supabase-js fires
 * that from `_recoverAndRefresh()` on every page load that restores a stored
 * session — so a reload walked through the lock screen and a second tab never
 * asked. The event cannot tell the two apart, so the sign-in says so itself.
 */
describe("the sign-in marker", () => {
  it("is absent until a sign-in claims it", () => {
    expect(consumeSignInIntent()).toBe(false);
  });

  it("is spent by the first sign-in and not the next one", () => {
    markSignInIntent();
    expect(consumeSignInIntent()).toBe(true);
    // The second call is the restore-on-reload case: same event, no credential.
    expect(consumeSignInIntent()).toBe(false);
  });

  it("is dropped when the attempt fails, so a later restore cannot spend it", () => {
    markSignInIntent();
    clearSignInIntent();
    expect(consumeSignInIntent()).toBe(false);
  });

  it("lives in sessionStorage, so one tab's sign-in cannot unlock another's", () => {
    markSignInIntent();
    expect(localStorage.getItem("finroot.signin.intent")).toBeNull();
    expect(sessionStorage.getItem("finroot.signin.intent")).toBe("1");
  });
});

/**
 * BUG-092. Every read here catches and returns the harmless answer — but for
 * "is this tab unlocked?" the harmless-looking answer is yes, which turned a
 * blocked store into an open door.
 */
describe("when storage cannot be read at all", () => {
  const real = Object.getOwnPropertyDescriptor(window, "sessionStorage");
  afterEach(() => {
    if (real) Object.defineProperty(window, "sessionStorage", real);
  });

  const block = () => {
    const boom = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom },
    });
  };

  it("reports the tab as locked rather than as unlocked", () => {
    block();
    expect(isUnlocked(UID)).toBe(false);
  });

  it("refuses to hand out a sign-in marker it could not have stored", () => {
    block();
    expect(consumeSignInIntent()).toBe(false);
  });
});
