import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One PIN per account. The server owns "is a PIN set" and the attempt limit;
 * the localStorage keys in appLock.ts are a cache plus an offline fallback.
 * The supabase client is mocked: each test scripts what the RPCs answer.
 */

type Resp = { data: unknown; error: { message?: string; code?: string } | null; status?: number };
const answers = new Map<string, Resp | Error>();
const calls: { fn: string; args: unknown; self: unknown }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    rpc(this: unknown, fn: string, args?: unknown) {
      calls.push({ fn, args, self: this });
      const a = answers.get(fn);
      if (a instanceof Error) return Promise.reject(a);
      return Promise.resolve(a ?? { data: null, error: null, status: 200 });
    },
  };
  return { supabase };
});

import { supabase } from "@/integrations/supabase/client";
import {
  checkAccountPin,
  isMissingRpc,
  lockoutMessage,
  reconcileAccountPin,
  removeAccountPin,
  saveAccountPin,
  syncAccountPin,
} from "./accountPin";
import {
  localPinIsSet,
  lockChoice,
  pinIsSet,
  pinLength,
  serverPinKnown,
  setLockChoice,
  setPin,
  verifyPin,
} from "./appLock";

const UID = "user-acct";
const MISSING: Resp = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the function public.verify_app_pin(p_pin) in the schema cache" },
  status: 404,
};
const NETWORK = new TypeError("Failed to fetch");
const ok = (data: unknown): Resp => ({ data, error: null, status: 200 });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  answers.clear();
  calls.length = 0;
});

describe("recognising a database without the migration", () => {
  it("treats PGRST202, a 404 and the old message as 'missing'", () => {
    expect(isMissingRpc({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpc({ message: "x" }, 404)).toBe(true);
    expect(isMissingRpc({ message: "function public.app_pin_status() does not exist" })).toBe(true);
    expect(isMissingRpc({ message: "permission denied", code: "42501" }, 403)).toBe(false);
    expect(isMissingRpc(null, 404)).toBe(false);
  });

  it("calls rpc on the client, never detached from it (CLAUDE.md)", async () => {
    answers.set("app_pin_status", ok([{ is_set: false, pin_length: null, locked_until: null }]));
    await syncAccountPin(UID);
    expect(calls[0].self).toBe(supabase);
  });
});

describe("reconcile on load", () => {
  it("server has a PIN → this device knows it, with its length, and infers the lock is on", async () => {
    answers.set("app_pin_status", ok([{ is_set: true, pin_length: 4, locked_until: null }]));
    await expect(syncAccountPin(UID)).resolves.toBe("synced");
    expect(serverPinKnown(UID)).toBe(true);
    expect(pinIsSet(UID)).toBe(true);
    expect(localPinIsSet(UID)).toBe(false); // nothing typed here yet
    expect(pinLength(UID)).toBe(4);
    // A device with no choice of its own: the lock screen, not "Add a PIN".
    expect(lockChoice(UID)).toBe("on");
  });

  it("server has a PIN → a local record is kept as the offline fallback", async () => {
    await setPin(UID, "123456");
    answers.set("app_pin_status", ok([{ is_set: true, pin_length: 6, locked_until: null }]));
    await syncAccountPin(UID);
    expect(localPinIsSet(UID)).toBe(true);
  });

  it("server has none, device has a local record it never saw on the server → kept", async () => {
    await setPin(UID, "123456");
    answers.set("app_pin_status", ok([{ is_set: false, pin_length: null, locked_until: null }]));
    await syncAccountPin(UID);
    expect(localPinIsSet(UID)).toBe(true);
    expect(lockChoice(UID)).toBe("on");
  });

  it("neither → unset, so the person is offered the lock", async () => {
    answers.set("app_pin_status", ok([{ is_set: false, pin_length: null, locked_until: null }]));
    await syncAccountPin(UID);
    expect(pinIsSet(UID)).toBe(false);
    expect(lockChoice(UID)).toBe("unset");
  });

  it("a PIN cleared on another device is dropped here too, and the lock re-offered", async () => {
    await setPin(UID, "123456");
    setLockChoice(UID, true);
    reconcileAccountPin(UID, { isSet: true, pinLength: 6 });
    reconcileAccountPin(UID, { isSet: false, pinLength: null });
    expect(pinIsSet(UID)).toBe(false);
    expect(lockChoice(UID)).toBe("unset");
  });

  it("…but an explicit 'off' on this device stays off", () => {
    setLockChoice(UID, false);
    reconcileAccountPin(UID, { isSet: true, pinLength: 6 });
    reconcileAccountPin(UID, { isSet: false, pinLength: null });
    expect(lockChoice(UID)).toBe("off");
  });

  it("migration not applied → nothing changes (device-only, exactly as before)", async () => {
    await setPin(UID, "123456");
    answers.set("app_pin_status", MISSING);
    await expect(syncAccountPin(UID)).resolves.toBe("missing");
    expect(localPinIsSet(UID)).toBe(true);
    expect(serverPinKnown(UID)).toBe(false);
  });

  it("network failure → nothing changes, and it does not throw", async () => {
    answers.set("app_pin_status", NETWORK);
    await expect(syncAccountPin(UID)).resolves.toBe("failed");
    expect(pinIsSet(UID)).toBe(false);
  });
});

describe("setting the PIN", () => {
  it("stores it on the account AND on this device", async () => {
    await expect(saveAccountPin(UID, "123456")).resolves.toEqual({ synced: true });
    expect(calls.find((c) => c.fn === "set_app_pin")?.args).toEqual({ p_pin: "123456" });
    expect(serverPinKnown(UID)).toBe(true);
    await expect(verifyPin(UID, "123456")).resolves.toBe(true); // offline copy
  });

  // Not a failure: there is no account copy to keep in step yet, so no
  // "couldn't reach the server" warning (that would be false).
  it("migration not applied → local only, no sync warning", async () => {
    answers.set("set_app_pin", MISSING);
    await expect(saveAccountPin(UID, "1234")).resolves.toEqual({ synced: true });
    expect(localPinIsSet(UID)).toBe(true);
    expect(serverPinKnown(UID)).toBe(false);
  });
});

describe("checking a typed PIN", () => {
  it("server says yes → unlocked, and the device copy is (re)written", async () => {
    reconcileAccountPin(UID, { isSet: true, pinLength: 6 });
    answers.set("verify_app_pin", ok([{ ok: true, locked_until: null, attempts_left: 5 }]));
    await expect(checkAccountPin(UID, "654321")).resolves.toEqual({ ok: true });
    expect(localPinIsSet(UID)).toBe(true);
    await expect(verifyPin(UID, "654321")).resolves.toBe(true);
  });

  it("server says no → wrong, with the attempts left", async () => {
    answers.set("verify_app_pin", ok([{ ok: false, locked_until: null, attempts_left: 2 }]));
    await expect(checkAccountPin(UID, "000000")).resolves.toEqual({
      ok: false,
      reason: "wrong",
      attemptsLeft: 2,
    });
  });

  it("the server's answer wins over a stale device copy", async () => {
    await setPin(UID, "111111"); // old PIN cached here; changed elsewhere since
    answers.set("verify_app_pin", ok([{ ok: false, locked_until: null, attempts_left: 4 }]));
    const r = await checkAccountPin(UID, "111111");
    expect(r.ok).toBe(false);
  });

  it("locked out → says so, with the time, without unlocking", async () => {
    const now = Date.parse("2026-11-01T10:00:00Z");
    const until = "2026-11-01T10:12:00Z";
    answers.set("verify_app_pin", ok([{ ok: false, locked_until: until, attempts_left: 0 }]));
    const r = await checkAccountPin(UID, "123456", now);
    expect(r).toEqual({ ok: false, reason: "locked", lockedUntil: new Date(until) });
    if (!r.ok && r.reason === "locked") {
      expect(lockoutMessage(r.lockedUntil, now)).toBe(
        "Too many wrong PINs — try again in 12 minutes, or use your password.",
      );
    }
  });

  it("account has no PIN but this device does → the right PIN unlocks AND is uploaded", async () => {
    await setPin(UID, "246810");
    answers.set("verify_app_pin", ok([{ ok: false, locked_until: null, attempts_left: null }]));
    await expect(checkAccountPin(UID, "246810")).resolves.toEqual({ ok: true });
    const upload = calls.find((c) => c.fn === "set_app_pin");
    expect(upload?.args).toEqual({ p_pin: "246810" });
    expect(serverPinKnown(UID)).toBe(true);
  });

  it("…and a wrong PIN is not uploaded", async () => {
    await setPin(UID, "246810");
    answers.set("verify_app_pin", ok([{ ok: false, locked_until: null, attempts_left: null }]));
    const r = await checkAccountPin(UID, "999999");
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.fn === "set_app_pin")).toBe(false);
  });

  it("migration not applied → the device copy decides, exactly as before", async () => {
    await setPin(UID, "1234");
    answers.set("verify_app_pin", MISSING);
    await expect(checkAccountPin(UID, "1234")).resolves.toEqual({ ok: true });
    await expect(checkAccountPin(UID, "4321")).resolves.toEqual({
      ok: false,
      reason: "wrong",
      attemptsLeft: null,
    });
    expect(calls.some((c) => c.fn === "set_app_pin")).toBe(false);
  });

  it("network failure → falls back to the device copy when there is one", async () => {
    await setPin(UID, "1234");
    answers.set("verify_app_pin", NETWORK);
    await expect(checkAccountPin(UID, "1234")).resolves.toEqual({ ok: true });
  });

  it("network failure with no device copy → 'unavailable', never a silent unlock", async () => {
    reconcileAccountPin(UID, { isSet: true, pinLength: 6 });
    answers.set("verify_app_pin", { data: null, error: { message: "Failed to fetch" }, status: 0 });
    await expect(checkAccountPin(UID, "123456")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("clearing the PIN", () => {
  it("clears the account copy and this device's", async () => {
    await saveAccountPin(UID, "123456");
    await expect(removeAccountPin(UID)).resolves.toEqual({ synced: true });
    expect(calls.some((c) => c.fn === "clear_app_pin")).toBe(true);
    expect(pinIsSet(UID)).toBe(false);
  });

  it("migration not applied counts as done (there is no account copy)", async () => {
    await setPin(UID, "1234");
    answers.set("clear_app_pin", MISSING);
    await expect(removeAccountPin(UID)).resolves.toEqual({ synced: true });
    expect(localPinIsSet(UID)).toBe(false);
  });

  it("network failure still clears this device, and reports it", async () => {
    await setPin(UID, "1234");
    answers.set("clear_app_pin", NETWORK);
    await expect(removeAccountPin(UID)).resolves.toEqual({ synced: false });
    expect(localPinIsSet(UID)).toBe(false);
  });
});

describe("lockout copy", () => {
  it("never says 0 minutes, and is singular at one", () => {
    const now = 1_000_000;
    expect(lockoutMessage(new Date(now + 10_000), now)).toMatch(/in 1 minute,/);
    expect(lockoutMessage(new Date(now + 15 * 60_000), now)).toMatch(/in 15 minutes,/);
  });
});
