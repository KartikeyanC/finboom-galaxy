/**
 * One-time migration: rename every localStorage key that starts with the old
 * "finroots." prefix to the new "finroot." prefix.
 * Safe to call multiple times — exits immediately once already done.
 */
export function migrateStorageKeys(): void {
  try {
    const DONE = "finroot._keysMigrated";
    if (localStorage.getItem(DONE)) return;

    // localStorage
    const lsKeys = Object.keys(localStorage);
    for (const key of lsKeys) {
      if (key.startsWith("finroots.")) {
        const newKey = "finroot." + key.slice("finroots.".length);
        const val = localStorage.getItem(key);
        if (val !== null) localStorage.setItem(newKey, val);
        localStorage.removeItem(key);
      }
    }

    // sessionStorage
    const ssKeys = Object.keys(sessionStorage);
    for (const key of ssKeys) {
      if (key.startsWith("finroots.")) {
        const newKey = "finroot." + key.slice("finroots.".length);
        const val = sessionStorage.getItem(key);
        if (val !== null) sessionStorage.setItem(newKey, val);
        sessionStorage.removeItem(key);
      }
    }

    localStorage.setItem(DONE, "1");
  } catch {
    /* ignore — storage may be unavailable */
  }
}

/**
 * App-lock PIN — a convenience gate on top of the real Supabase session.
 * The PIN hash is stored per-device (localStorage); the "unlocked" flag is
 * per-tab (sessionStorage) so a new tab / reopened browser re-prompts, while
 * navigation within the same tab stays unlocked. A fresh password login also
 * unlocks (handled in useAuth on the SIGNED_IN event).
 */
const PIN_KEY = (uid: string) => `finroot.pin.${uid}`;
const LEN_KEY = (uid: string) => `finroot.pinlen.${uid}`;
const UNLOCK_KEY = (uid: string) => `finroot.unlocked.${uid}`;

// ===========================================================================
// How the PIN is stored (BUG-091)
//
// It used to be one unsalted `SHA-256("finroot:<uid>:<pin>")`. The uid is not
// a secret — it is the second half of the key the hash is stored under — so
// anyone holding the storage held everything needed to search the keyspace,
// and a plain Node script walked all 10⁶ six-digit PINs in **27.8 seconds**.
//
// PBKDF2-SHA256 with a random per-user salt makes each guess cost about 58 ms
// instead of a microsecond: the same script would now need roughly 100 days.
//
// ⚠️ **This raises the price; it does not make a 4–6 digit secret strong.**
// Six digits is ~20 bits, and dedicated GPU hardware still gets through it in
// minutes. Nothing stored on the device can fix that — the fix for the harm
// that actually matters (people reuse the PIN they use on their phone and
// their bank card) is the copy in `PinSetup`, which now says so. The lock is
// a curtain over the screen; RLS is the security boundary.
//
// 310,000 is the current OWASP figure for PBKDF2-SHA256 and stays comfortable
// on a slow phone. The record carries its own iteration count, so raising it
// later costs nothing: `verifyPin` re-hashes any record below the current
// setting the next time the right PIN is entered.
// ===========================================================================
const PIN_ITERATIONS = 310_000;

/** A stored PIN, v2. v1 was a bare 64-character hex digest with no envelope. */
type PinRecord = { v: 2; salt: string; iter: number; hash: string };

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (hex: string): Uint8Array =>
  new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16)));

async function derivePin(pin: string, saltHex: string, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations },
    material,
    256,
  );
  return toHex(bits);
}

/**
 * The v1 digest, kept for exactly one purpose: verifying a PIN that was set
 * before this changed, so those devices can be upgraded instead of locked out.
 * Never call it to store anything.
 */
async function legacyPinHash(uid: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`finroot:${uid}:${pin}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

/** `null` for a v1 value (or anything unrecognisable), which is a real case. */
function parsePinRecord(raw: string): PinRecord | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as PinRecord).v === 2 &&
      typeof (parsed as PinRecord).salt === "string" &&
      typeof (parsed as PinRecord).hash === "string" &&
      Number.isFinite((parsed as PinRecord).iter)
    ) {
      return parsed as PinRecord;
    }
    return null;
  } catch {
    return null;
  }
}

export function pinIsSet(uid: string): boolean {
  try {
    return !!localStorage.getItem(PIN_KEY(uid));
  } catch {
    return false;
  }
}

export function pinLength(uid: string): number {
  try {
    const n = Number(localStorage.getItem(LEN_KEY(uid)));
    return n === 4 || n === 6 ? n : 6;
  } catch {
    return 6;
  }
}

export async function setPin(uid: string, pin: string): Promise<void> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const record: PinRecord = {
    v: 2,
    salt,
    iter: PIN_ITERATIONS,
    hash: await derivePin(pin, salt, PIN_ITERATIONS),
  };
  try {
    localStorage.setItem(PIN_KEY(uid), JSON.stringify(record));
    localStorage.setItem(LEN_KEY(uid), String(pin.length));
  } catch {
    /* ignore */
  }
  markUnlocked(uid);
  // Whether a PIN exists decides what the route gate renders (5.4), so every
  // change has to reach the components watching it.
  notifyLockSettingsChanged();
}

export function clearPin(uid: string): void {
  try {
    localStorage.removeItem(PIN_KEY(uid));
    localStorage.removeItem(LEN_KEY(uid));
  } catch {
    /* ignore */
  }
  notifyLockSettingsChanged();
}

export async function verifyPin(uid: string, pin: string): Promise<boolean> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(PIN_KEY(uid));
  } catch {
    return false;
  }
  if (!stored) return false;

  const record = parsePinRecord(stored);

  // A PIN set before BUG-091 was fixed. Check it the old way ONCE, and if it
  // is right, re-store it properly — the alternative is telling everyone who
  // already had a PIN that it no longer works, which reads as data loss and
  // sends them to the recovery screen for a bug they did not cause.
  if (!record) {
    if (stored !== (await legacyPinHash(uid, pin))) return false;
    await setPin(uid, pin);
    return true;
  }

  if (record.hash !== (await derivePin(pin, record.salt, record.iter))) return false;

  // Same mechanism, so raising PIN_ITERATIONS later is free: the record is
  // rebuilt at the current cost the next time the right PIN is entered.
  if (record.iter < PIN_ITERATIONS) await setPin(uid, pin);
  return true;
}

export function isUnlocked(uid: string): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY(uid)) === "1";
  } catch {
    // BUG-092: this used to return `true`. Every other read here catches and
    // returns the harmless answer, but "I cannot tell whether this tab is
    // unlocked" is not harmless — answering yes turned "storage is blocked"
    // into "come in", and blocking storage takes one line in a devtools
    // console. A lock that cannot read its own state has to ask.
    //
    // It does not lock anyone out: `LockScreen` calls `onUnlocked()` as well as
    // `markUnlocked()`, so the PIN still opens the app for the life of the
    // page — it is only a reload that asks again, which is what a browser with
    // no storage should do anyway.
    return false;
  }
}

export function markUnlocked(uid: string): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY(uid), "1");
  } catch {
    /* ignore */
  }
}

export function lockNow(uid: string): void {
  try {
    sessionStorage.removeItem(UNLOCK_KEY(uid));
  } catch {
    /* ignore */
  }
}

// ---- 12-hour tiered auth: PIN within 12h of last password login, else password ----
const PWDAT_KEY = (uid: string) => `finroot.pwdauth.${uid}`;
const LOGOUT_KEY = (uid: string) => `finroot.lastlogout.${uid}`;
export const TWELVE_HOURS = 12 * 60 * 60 * 1000;

/** Stamp the anchor on a successful password login. */
export function setPasswordAuthNow(uid: string): void {
  try {
    localStorage.setItem(PWDAT_KEY(uid), String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Record the moment the user locked / logged out. */
export function recordLogout(uid: string): void {
  try {
    localStorage.setItem(LOGOUT_KEY(uid), String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** True when more than 12h have passed since the last password login → require password. */
export function needsPassword(uid: string): boolean {
  try {
    const t = Number(localStorage.getItem(PWDAT_KEY(uid)));
    if (!t) return true;
    return Date.now() - t > TWELVE_HOURS;
  } catch {
    return true;
  }
}

// ---- BUG-090: telling a sign-in apart from a session being restored --------
//
// `useAuth` unlocks the tab on `SIGNED_IN`, on the assumption that the event
// means somebody just typed a password. It does not. `supabase-js` fires it
// from `_recoverAndRefresh()` every time it restores a stored session on page
// load, so **every reload and every new tab announced itself as a fresh
// login** — the lock screen fell to F5, and the 12-hour password anchor was
// re-stamped so often it could never expire.
//
// There is no way to tell the two apart from the event, so the sign-in says so
// itself: the screens that actually ask for a credential set this marker
// immediately before the call, and `useAuth` consumes it. Restoring a session
// never sets it, so restoring a session never unlocks.
//
// Per TAB (sessionStorage), because "this tab just signed in" is exactly what
// is being claimed — a marker in localStorage would let one tab's sign-in
// unlock another's.
const SIGNIN_INTENT_KEY = "finroot.signin.intent";

/** Call immediately before asking Supabase for a session with a credential. */
export function markSignInIntent(): void {
  try {
    sessionStorage.setItem(SIGNIN_INTENT_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Call when the attempt failed, so a later restore cannot spend the marker. */
export function clearSignInIntent(): void {
  try {
    sessionStorage.removeItem(SIGNIN_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

/** True once, for the sign-in this tab actually performed. */
export function consumeSignInIntent(): boolean {
  try {
    const intended = sessionStorage.getItem(SIGNIN_INTENT_KEY) === "1";
    if (intended) sessionStorage.removeItem(SIGNIN_INTENT_KEY);
    return intended;
  } catch {
    return false;
  }
}

/** Ask the ProtectedRoute gate to lock this tab immediately. */
export function requestLock(): void {
  try {
    window.dispatchEvent(new Event("finroot:lock"));
  } catch {
    /* ignore */
  }
}

// ===========================================================================
// Stage 5.4 — the lock is a choice, and leaving the tab is not a crime
//
// Until now the PIN was mandatory and ANY tab switch re-locked instantly, with
// no way back except signing out. Three things change:
//
//  * **Optional.** A new account is OFFERED the lock and can decline. The
//    choice is per device and per user, because the PIN is: declining on a
//    laptop says nothing about the phone.
//  * **A grace period.** Hiding the tab starts a clock instead of locking;
//    the lock applies on return only if the clock ran out. "Immediately" is
//    still available and still locks on hide, so a task-switcher preview of a
//    hidden tab shows the lock screen rather than balances.
//  * **A recovery path.** A forgotten PIN is reset with the account password
//    (`LockScreen`), which is the credential that actually protects the data.
//
// ⚠️ None of this is a security boundary — RLS is. The lock keeps a passing
// glance off the screen of a device someone is already signed in on. It does
// not encrypt anything, and it cannot stop someone who has the password.
// ===========================================================================

const PREF_KEY = (uid: string) => `finroot.lock.pref.${uid}`;
const GRACE_KEY = (uid: string) => `finroot.lock.grace.${uid}`;
const HIDDEN_KEY = (uid: string) => `finroot.lock.hiddenAt.${uid}`;

/** "unset" is a real state: the user has not been asked yet. */
export type LockChoice = "on" | "off" | "unset";

/** Minutes the app may sit hidden before it locks. 0 = lock on the way out. */
export const GRACE_OPTIONS = [0, 1, 5, 15] as const;
export type GraceMinutes = (typeof GRACE_OPTIONS)[number];
export const DEFAULT_GRACE_MINUTES: GraceMinutes = 5;

export function lockChoice(uid: string): LockChoice {
  try {
    const v = localStorage.getItem(PREF_KEY(uid));
    if (v === "on" || v === "off") return v;
    // Anyone who already has a PIN chose the lock under the old mandatory
    // rules; re-offering it would read as the app forgetting their setup.
    return pinIsSet(uid) ? "on" : "unset";
  } catch {
    return "unset";
  }
}

export function setLockChoice(uid: string, on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY(uid), on ? "on" : "off");
  } catch {
    /* ignore */
  }
  notifyLockSettingsChanged();
}

export function graceMinutes(uid: string): GraceMinutes {
  try {
    const raw = localStorage.getItem(GRACE_KEY(uid));
    // 🔴 The null check is the whole point: `Number(null)` is 0, and 0 is a
    // VALID option ("Immediately"), so a user who never touched this setting
    // would silently get the old lock-on-every-tab-switch behaviour back.
    if (raw === null || raw.trim() === "") return DEFAULT_GRACE_MINUTES;
    const n = Number(raw);
    return (GRACE_OPTIONS as readonly number[]).includes(n)
      ? (n as GraceMinutes)
      : DEFAULT_GRACE_MINUTES;
  } catch {
    return DEFAULT_GRACE_MINUTES;
  }
}

export function setGraceMinutes(uid: string, minutes: GraceMinutes): void {
  try {
    localStorage.setItem(GRACE_KEY(uid), String(minutes));
  } catch {
    /* ignore */
  }
  notifyLockSettingsChanged();
}

/** Per TAB (sessionStorage): when this tab was last hidden, if it still is. */
export function markHidden(uid: string, at: number = Date.now()): void {
  try {
    sessionStorage.setItem(HIDDEN_KEY(uid), String(at));
  } catch {
    /* ignore */
  }
}

export function hiddenAt(uid: string): number | null {
  try {
    const n = Number(sessionStorage.getItem(HIDDEN_KEY(uid)));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function clearHidden(uid: string): void {
  try {
    sessionStorage.removeItem(HIDDEN_KEY(uid));
  } catch {
    /* ignore */
  }
}

/**
 * Should returning to a hidden tab put the lock screen up?
 *
 * Pure, so the rule can be tested without a browser. A missing `hiddenAt` means
 * the tab was never away — never lock on that, or a stray visibility event
 * would lock someone who never left.
 */
export function shouldLockOnReturn(
  hiddenAtMs: number | null,
  nowMs: number,
  graceMinutesValue: number,
): boolean {
  if (hiddenAtMs === null) return false;
  if (graceMinutesValue <= 0) return true;
  return nowMs - hiddenAtMs >= graceMinutesValue * 60_000;
}

/** Human copy for one grace option. */
export function graceLabel(minutes: number): string {
  if (minutes <= 0) return "Immediately";
  if (minutes === 1) return "After 1 minute";
  return `After ${minutes} minutes`;
}

/**
 * Lock settings live in localStorage, which React cannot subscribe to, and
 * three separate places render them (the gate, the top bar, Settings). This
 * event is what keeps them in step within a tab; `useLockSettings` listens.
 */
export const LOCK_SETTINGS_EVENT = "finroot:locksettings";

export function notifyLockSettingsChanged(): void {
  try {
    window.dispatchEvent(new Event(LOCK_SETTINGS_EVENT));
  } catch {
    /* ignore */
  }
}
