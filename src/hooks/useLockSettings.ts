import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_GRACE_MINUTES,
  LOCK_SETTINGS_EVENT,
  graceMinutes,
  lockChoice,
  pinIsSet,
  pinLength,
  type GraceMinutes,
  type LockChoice,
} from "@/lib/appLock";

export type LockSettings = {
  choice: LockChoice;
  /** The lock is actually in force: chosen AND a PIN exists. */
  active: boolean;
  grace: GraceMinutes;
  hasPin: boolean;
  pinLen: number;
};

const EMPTY: LockSettings = {
  choice: "unset",
  active: false,
  grace: DEFAULT_GRACE_MINUTES,
  hasPin: false,
  pinLen: 4,
};

/**
 * Stage 5.4 — the lock settings, kept in step across the three places that
 * render them (the route gate, the top-bar Lock button, Settings).
 *
 * They live in localStorage, which React cannot subscribe to, so the setters
 * in `lib/appLock.ts` dispatch `LOCK_SETTINGS_EVENT` and this listens. Read
 * synchronously on first render on purpose: the route gate decides whether to
 * show the lock screen, and a value that arrives one paint late would flash
 * the dashboard at someone who asked for it to be covered.
 */
export function useLockSettings(uid: string | undefined): LockSettings {
  const read = useCallback((): LockSettings => {
    if (!uid) return EMPTY;
    const choice = lockChoice(uid);
    const hasPin = pinIsSet(uid);
    return {
      choice,
      active: choice === "on" && hasPin,
      grace: graceMinutes(uid),
      hasPin,
      pinLen: pinLength(uid),
    };
  }, [uid]);

  const [settings, setSettings] = useState<LockSettings>(read);

  useEffect(() => {
    setSettings(read());
    const onChange = () => setSettings(read());
    window.addEventListener(LOCK_SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(LOCK_SETTINGS_EVENT, onChange);
  }, [read]);

  return settings;
}
