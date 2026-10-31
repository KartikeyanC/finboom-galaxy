import { useEffect, useState } from "react";
import { syncAccountPin } from "@/lib/accountPin";

/**
 * How long the route gate waits for the account-PIN status before giving up
 * and trusting this device's cache. A network problem must never trap anyone
 * on a loading screen.
 */
export const PIN_SYNC_TIMEOUT_MS = 4_000;

// Once per page load per user. A reload asks again, which is cheap and is how
// a PIN cleared on another device reaches this one.
const done = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

export function ensureAccountPinSynced(uid: string): Promise<void> {
  if (done.has(uid)) return Promise.resolve();
  let p = inFlight.get(uid);
  if (!p) {
    p = syncAccountPin(uid)
      .then(() => undefined, () => undefined)
      .finally(() => {
        done.add(uid);
        inFlight.delete(uid);
      });
    inFlight.set(uid, p);
  }
  return p;
}

/** Test seam: forget which users have been synced. */
export function resetAccountPinSyncForTests(): void {
  done.clear();
  inFlight.clear();
}

/**
 * Reconcile this device's PIN cache with the account once, on sign-in / load.
 * Returns true once the first status check has finished (or timed out), so the
 * gate can hold back "Add a PIN to your account?" until it knows the account
 * does not already have one.
 */
export function useAccountPinSync(uid: string | undefined): boolean {
  const [readyFor, setReadyFor] = useState<string | null>(() =>
    uid && done.has(uid) ? uid : null,
  );

  useEffect(() => {
    if (!uid) return;
    if (done.has(uid)) {
      setReadyFor(uid);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      if (live) setReadyFor(uid);
    }, PIN_SYNC_TIMEOUT_MS);
    void ensureAccountPinSynced(uid).then(() => {
      clearTimeout(timer);
      if (live) setReadyFor(uid);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [uid]);

  return !uid || readyFor === uid;
}
