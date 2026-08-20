/**
 * BUG-101 — `supabase.auth.signInWithPassword` has no rate limiting of its
 * own: 20 wrong passwords back to back complete in ~6s with nothing but a
 * plain 400 each time. The real fix is server-side (Supabase Auth's own
 * rate-limit settings, or routing sign-in through a custom function the way
 * `po-auth` does its own lockout) — neither is reachable from this checkout,
 * the same access gap blocking BUG-006/007/008's deploys.
 *
 * This is the client-side half only, and it is a deterrent, not a boundary:
 * anyone can clear `localStorage`, use a private window, or skip the UI and
 * call the API directly. It exists to slow the laziest case — a script
 * looping against the visible form — to the same 5-failures-per-15-minutes
 * shape `po-auth`'s real, server-side lockout uses, so the two read the
 * same to a user even though only one of them is real security.
 */

const PREFIX = "finroot.signin.attempts.";
const WINDOW_MS = 15 * 60 * 1000;
const THRESHOLD = 5;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 5 * 60 * 1000;

interface AttemptState {
  count: number;
  windowStart: number;
  lockedUntil?: number;
}

function keyFor(email: string): string {
  return PREFIX + email.trim().toLowerCase();
}

function read(email: string): AttemptState | null {
  try {
    const raw = localStorage.getItem(keyFor(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AttemptState;
    if (typeof parsed.count !== "number" || typeof parsed.windowStart !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(email: string, state: AttemptState) {
  try {
    localStorage.setItem(keyFor(email), JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, quota) — fail open. A missing
    // deterrent is strictly better than an unusable sign-in form.
  }
}

export interface LockStatus {
  locked: boolean;
  /** Milliseconds until the lock lifts, only present while locked. */
  retryAfterMs?: number;
}

/** Call before attempting a sign-in. */
export function signInLockStatus(email: string, now = Date.now()): LockStatus {
  const state = read(email);
  if (!state?.lockedUntil) return { locked: false };
  if (now >= state.lockedUntil) return { locked: false };
  return { locked: true, retryAfterMs: state.lockedUntil - now };
}

/** Call after a sign-in attempt fails with an invalid-credentials error. */
export function recordFailedSignIn(email: string, now = Date.now()): LockStatus {
  const prev = read(email);
  const inWindow = prev && now - prev.windowStart < WINDOW_MS;
  const count = inWindow ? prev.count + 1 : 1;
  const windowStart = inWindow ? prev.windowStart : now;

  let lockedUntil: number | undefined;
  if (count >= THRESHOLD) {
    // Doubles per failure past the threshold, capped — the 6th failure
    // costs 30s, the 7th 60s, and so on up to 5 minutes.
    const factor = 2 ** (count - THRESHOLD);
    const lockMs = Math.min(BASE_LOCK_MS * factor, MAX_LOCK_MS);
    lockedUntil = now + lockMs;
  }

  const state: AttemptState = { count, windowStart, lockedUntil };
  write(email, state);
  return lockedUntil ? { locked: true, retryAfterMs: lockedUntil - now } : { locked: false };
}

/** Call after a successful sign-in. */
export function clearSignInAttempts(email: string) {
  try {
    localStorage.removeItem(keyFor(email));
  } catch {
    // Nothing to clean up if storage was never reachable.
  }
}

export function formatRetryAfter(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)}m`;
}
