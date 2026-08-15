import { useState } from "react";
import { Lock, ShieldCheck, ShieldOff, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useLockSettings } from "@/hooks/useLockSettings";
import {
  GRACE_OPTIONS,
  clearPin,
  graceLabel,
  setGraceMinutes,
  setLockChoice,
  setPin,
  type GraceMinutes,
} from "@/lib/appLock";
import { DEVICE_LOCAL_HINT } from "@/lib/deviceLocal";

/**
 * Stage 5.4 — the app lock, now a setting rather than a fact of life.
 *
 * Three things this card has to get right:
 *  * **Off is allowed**, and turning it off says plainly what stops happening.
 *  * **The grace period is visible**, because "it locks the moment I look at
 *    another tab" was the single most annoying thing about the old behaviour.
 *  * **It does not oversell itself.** The lock covers the screen of a device
 *    someone is already signed in on; the account password and RLS are what
 *    protect the data.
 */
export default function AppLockSettings() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const lock = useLockSettings(uid);
  const on = lock.choice === "on";

  const [editing, setEditing] = useState(false);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [len, setLen] = useState<4 | 6>(4);
  const [pin, setPinVal] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const clean = (v: string) => v.replace(/\D/g, "").slice(0, len);

  const startEdit = () => {
    setLen(lock.hasPin ? (lock.pinLen as 4 | 6) : 4);
    setPinVal("");
    setConfirm("");
    setEditing(true);
  };

  const save = async () => {
    if (pin.length !== len) return toast.error(`PIN must be ${len} digits`);
    if (pin !== confirm) return toast.error("PINs do not match");
    setBusy(true);
    await setPin(uid, pin);
    setLockChoice(uid, true);
    setBusy(false);
    setEditing(false);
    setPinVal("");
    setConfirm("");
    toast.success(on ? "PIN updated" : "App lock on");
  };

  const turnOff = () => {
    // The PIN goes with it. Keeping the hash around would mean switching the
    // lock back on months later silently expects a PIN nobody remembers.
    clearPin(uid);
    setLockChoice(uid, false);
    setConfirmingOff(false);
    setEditing(false);
    toast.success("App lock off");
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> App Lock (PIN)
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Covers your figures with a PIN when you leave this device. {DEVICE_LOCAL_HINT}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1",
              on
                ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                : "border-border/60 text-muted-foreground",
            )}
          >
            {on ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" /> On · {lock.pinLen}-digit
              </>
            ) : (
              <>
                <ShieldOff className="w-3.5 h-3.5" /> Off
              </>
            )}
          </span>
          <Switch
            checked={on}
            aria-label="App lock"
            onCheckedChange={(next) => {
              if (next) startEdit();
              else setConfirmingOff(true);
            }}
          />
        </div>
      </div>

      {confirmingOff && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
          <p className="text-sm text-foreground font-medium">Turn the app lock off?</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Anyone who opens this browser while you are signed in will see your accounts, balances
            and transactions without being asked for anything. Your PIN is deleted; signing in
            still needs your password. You can turn the lock back on here at any time.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={turnOff}>
              Turn it off
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingOff(false)}>
              Keep it on
            </Button>
          </div>
        </div>
      )}

      {on && !editing && !confirmingOff && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5" /> Lock after leaving
            </Label>
            <div className="flex flex-wrap gap-2">
              {GRACE_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={lock.grace === m}
                  onClick={() => setGraceMinutes(uid, m as GraceMinutes)}
                  className={cn(
                    "h-9 px-3 rounded-lg border text-sm transition-colors",
                    lock.grace === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 hover:bg-accent/30",
                  )}
                >
                  {graceLabel(m)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Switching tabs for a moment no longer locks you out. “Immediately” locks the moment
              the tab is hidden, so even a task-switcher preview shows the lock screen.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={startEdit}>
            Change PIN
          </Button>
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          <div className="flex items-center gap-2" role="group" aria-labelledby="applock-len-label">
            <Label id="applock-len-label" className="text-xs text-muted-foreground">
              PIN length
            </Label>
            {([4, 6] as const).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={len === n}
                onClick={() => { setLen(n); setPinVal(""); setConfirm(""); }}
                className={cn(
                  "h-8 px-3 rounded-md border text-sm transition-colors",
                  len === n ? "border-primary bg-primary/10 text-primary" : "border-border/50 hover:bg-accent/30",
                )}
              >
                {n} digits
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="applock-new">New PIN</Label>
              <Input id="applock-new" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPinVal(clean(e.target.value))} placeholder={"•".repeat(len)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="applock-confirm">Confirm PIN</Label>
              <Input id="applock-confirm" type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(clean(e.target.value))} placeholder={"•".repeat(len)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : on ? "Save PIN" : "Turn on app lock"}</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setEditing(false); setPinVal(""); setConfirm(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Deliberately last and always shown: the limits of the thing, next to
          the switch that controls it. */}
      <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/40 pt-4">
        Stored on this device as a one-way hash — never sent to the server, so it is not part of a
        backup or an export and it does not follow you to another device. It hides the screen; it
        does not encrypt your data and cannot stop someone who has your password. Forgotten it?
        Choose “Forgot your PIN?” on the lock screen and unlock with your password.
      </p>
    </div>
  );
}
