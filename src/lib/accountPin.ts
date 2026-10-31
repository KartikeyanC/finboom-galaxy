/**
 * One app-lock PIN per ACCOUNT (migration 20261101120000_account_app_pin.sql).
 *
 * Before this, the PIN lived only in the browser, so every new browser, device,
 * the Windows WebView app and Safari after its 7-day storage purge asked for a
 * NEW one. Now the server is the source of truth for "is a PIN set, and how
 * long is it", and the existing localStorage keys in `appLock.ts` are a
 * per-device CACHE of it — which keeps `useLockSettings` synchronous (no flash
 * of the wrong gate) and gives an offline fallback.
 *
 *  * The hash never leaves the database: these RPCs return booleans, a length
 *    and a lockout time, nothing else. The table has RLS on and no policies.
 *  * The server enforces the attempt limit (5 wrong → 15 minutes).
 *  * If the functions do not exist yet (PGRST202 / 404 — migration not
 *    applied, or a database restored to an older schema) everything below
 *    degrades to exactly the old device-only behaviour.
 *
 * ⚠️ Still not access control. RLS is. The lock is a curtain over the screen.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  clearLockChoice,
  clearPin,
  localPinIsSet,
  lockChoice,
  notifyLockSettingsChanged,
  serverPinKnown,
  setPin,
  setServerPinCache,
  verifyPin,
} from "@/lib/appLock";

type RpcError = { message?: string; code?: string };
type RpcResponse = { data: unknown; error: RpcError | null; status?: number };
type RpcFn = (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResponse>;

export type RpcOutcome<T> =
  | { kind: "ok"; data: T }
  /** The function is not in this database (migration not applied). */
  | { kind: "missing" }
  /** Network down, server error, signed out… — "could not ask". */
  | { kind: "failed"; message: string };

/** PostgREST's "no such function", in every shape it has been seen to take. */
export function isMissingRpc(error: RpcError | null, status?: number): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    status === 404 ||
    /could not find the function|does not exist/i.test(error.message ?? "")
  );
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<RpcOutcome<T>> {
  try {
    // Bound, never detached — `const rpc = supabase.rpc` loses its client
    // (see CLAUDE.md). Widened because the generated types will not know these
    // functions until the migration is applied and types are regenerated.
    const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
    const { data, error, status } = await rpc(fn, args);
    if (error) {
      if (isMissingRpc(error, status)) return { kind: "missing" };
      return { kind: "failed", message: error.message ?? String(error.code ?? "error") };
    }
    return { kind: "ok", data: data as T };
  } catch (e) {
    return { kind: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}

/** `RETURNS TABLE` arrives as an array of one row; tolerate a bare object. */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

export type AccountPinStatus = { isSet: boolean; pinLength: number | null };

type StatusRow = { is_set: boolean; pin_length: number | null; locked_until: string | null };
type VerifyRow = { ok: boolean; locked_until: string | null; attempts_left: number | null };

// ---- reconcile ---------------------------------------------------------------

/**
 * Bring this device's cache in line with what the server said.
 *
 *  * Server has a PIN → remember that and its length. Any local record is kept
 *    as the offline fallback (it is refreshed the next time the PIN is typed).
 *  * Server has none, but this device has a local record it never saw on the
 *    server (set before the migration, or while offline) → keep it; it is
 *    uploaded the next time the right PIN is typed (`checkAccountPin`), the
 *    only moment the plain PIN exists.
 *  * Server has none, and this device HAD seen one there → it was cleared on
 *    another device (forgot-PIN, or the lock turned off). Drop the stale local
 *    copy too — re-uploading it would resurrect a PIN the person removed — and
 *    if this device's lock was on, re-offer it rather than demand a PIN that no
 *    longer exists. An explicit "off" stays off.
 *  * Neither → nothing to do.
 */
export function reconcileAccountPin(uid: string, status: AccountPinStatus): void {
  if (status.isSet) {
    setServerPinCache(uid, true, status.pinLength);
  } else if (serverPinKnown(uid)) {
    const wasOn = lockChoice(uid) === "on";
    clearPin(uid);
    if (wasOn) clearLockChoice(uid);
  }
  notifyLockSettingsChanged();
}

export type SyncResult = "synced" | "missing" | "failed";

/** Ask the server, then reconcile. Never throws. */
export async function syncAccountPin(uid: string): Promise<SyncResult> {
  const r = await call<StatusRow[]>("app_pin_status");
  if (r.kind !== "ok") return r.kind;
  const row = firstRow<StatusRow>(r.data);
  reconcileAccountPin(uid, { isSet: !!row?.is_set, pinLength: row?.pin_length ?? null });
  return "synced";
}

// ---- set / verify / clear ---------------------------------------------------

/**
 * Set (or change) the account PIN, and write the device copy as the offline
 * fallback. `synced: false` means the server could not be reached (or does not
 * have the functions yet): the PIN works on this device, and will be uploaded
 * the next time it is typed correctly if the account still has none.
 */
export async function saveAccountPin(uid: string, pin: string): Promise<{ synced: boolean }> {
  await setPin(uid, pin); // local record + this tab unlocked + notify
  return uploadAccountPin(uid, pin);
}

/**
 * Send a PIN already saved on this device to the account. Kept separate so a
 * screen can finish on the local save and let this run behind it: awaiting the
 * network before closing PinSetup let its `onDone` (which unlocks) land AFTER
 * the person had already locked again — a wrong PIN then "unlocked" the app.
 * `synced: false` only for a real failure; a project without the function yet
 * (pre-migration) has nothing to sync, which is not a failure.
 */
export async function uploadAccountPin(uid: string, pin: string): Promise<{ synced: boolean }> {
  const r = await call<null>("set_app_pin", { p_pin: pin });
  if (r.kind === "ok") {
    setServerPinCache(uid, true, pin.length);
    notifyLockSettingsChanged();
  }
  return { synced: r.kind !== "failed" };
}

export type PinCheck =
  | { ok: true }
  /** `attemptsLeft` is null when the server did not say (local check, or no PIN). */
  | { ok: false; reason: "wrong"; attemptsLeft: number | null }
  | { ok: false; reason: "locked"; lockedUntil: Date }
  /** Could not reach the server, and this device has no copy to check against. */
  | { ok: false; reason: "unavailable" };

async function checkLocally(uid: string, pin: string): Promise<PinCheck> {
  return (await verifyPin(uid, pin))
    ? { ok: true }
    : { ok: false, reason: "wrong", attemptsLeft: null };
}

/**
 * Check a typed PIN. Server first (it owns the attempt limit); the device copy
 * only when the server cannot be asked.
 */
export async function checkAccountPin(
  uid: string,
  pin: string,
  now: number = Date.now(),
): Promise<PinCheck> {
  const r = await call<VerifyRow[]>("verify_app_pin", { p_pin: pin });

  if (r.kind === "missing") return checkLocally(uid, pin); // pre-migration: exactly as before
  if (r.kind === "failed") {
    return localPinIsSet(uid) ? checkLocally(uid, pin) : { ok: false, reason: "unavailable" };
  }

  const row = firstRow<VerifyRow>(r.data);
  if (row?.ok) {
    // Refresh the offline copy with the PIN we now know is right — this is how
    // a brand-new device gets one, and how a PIN changed elsewhere replaces an
    // old local record.
    await setPin(uid, pin);
    setServerPinCache(uid, true, pin.length);
    notifyLockSettingsChanged();
    return { ok: true };
  }

  const lockedUntil = row?.locked_until ? new Date(row.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > now) {
    return { ok: false, reason: "locked", lockedUntil };
  }

  // attempts_left NULL = the account has no PIN. If this device has one (set
  // before the migration, or while offline), this is the moment to upload it:
  // the plain PIN only exists while someone is typing it.
  if (row && row.attempts_left === null) {
    if (localPinIsSet(uid) && (await verifyPin(uid, pin))) {
      const up = await call<null>("set_app_pin", { p_pin: pin });
      if (up.kind === "ok") {
        setServerPinCache(uid, true, pin.length);
        notifyLockSettingsChanged();
      }
      return { ok: true };
    }
    return { ok: false, reason: "wrong", attemptsLeft: null };
  }

  return { ok: false, reason: "wrong", attemptsLeft: row?.attempts_left ?? null };
}

/**
 * Remove the PIN everywhere: forgot-PIN recovery, declining in reset mode,
 * turning the lock off in Settings. Device copy first, so this device is right
 * even if the server cannot be reached. `synced: false` → the account copy may
 * still exist, and other devices (and this one, on its next load) will ask for it.
 */
export async function removeAccountPin(uid: string): Promise<{ synced: boolean }> {
  clearPin(uid);
  const r = await call<null>("clear_app_pin");
  return { synced: r.kind !== "failed" };
}

// ---- copy -------------------------------------------------------------------

/** "Too many wrong PINs — try again in 12 minutes, or use your password." */
export function lockoutMessage(lockedUntil: Date, now: number = Date.now()): string {
  const mins = Math.max(1, Math.ceil((lockedUntil.getTime() - now) / 60_000));
  return `Too many wrong PINs — try again in ${mins} ${mins === 1 ? "minute" : "minutes"}, or use your password.`;
}
