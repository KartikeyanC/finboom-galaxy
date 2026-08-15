import { useState } from "react";
import { Lock, LogOut, ShieldOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { clearPin, setLockChoice, setPin } from "@/lib/appLock";

/**
 * Stage 5.4 — the PIN is now OFFERED, not imposed.
 *
 * It used to be a wall: a new account could not reach the app without creating
 * one, and the only way past a forgotten PIN was signing out. Two modes now:
 *
 *  * `offer` — first run. "Not now" is a real answer, recorded per device, and
 *    the lock can be switched on later in Settings.
 *  * `reset` — the user proved their identity with their password after
 *    forgetting the PIN, and is choosing a new one (or turning the lock off).
 *
 * The copy says what the lock is for and, just as importantly, what it is not:
 * it is a curtain over this device's screen, not the thing protecting the data.
 */
export function PinSetup({
  mode = "offer",
  onDone,
}: {
  mode?: "offer" | "reset";
  onDone: () => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const uid = user?.id ?? "";
  // Six by default (BUG-091). The KDF fixed the cost per guess; it cannot fix
  // the size of the space being guessed, and that is the binding constraint —
  // 10⁴ falls to a GPU in a fraction of a second no matter how it is hashed,
  // where 10⁶ takes a hundred times longer. Four digits is still offered,
  // because a lock nobody can be bothered to use protects nothing.
  const [len, setLen] = useState<4 | 6>(6);
  const [pin, setPinVal] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const clean = (v: string) => v.replace(/\D/g, "").slice(0, len);

  const save = async () => {
    if (pin.length !== len) return toast.error(`PIN must be ${len} digits`);
    if (pin !== confirm) return toast.error("PINs do not match");
    setBusy(true);
    await setPin(uid, pin);
    setLockChoice(uid, true);
    setBusy(false);
    toast.success(mode === "reset" ? "New PIN set" : "App lock on");
    onDone();
  };

  const decline = () => {
    // In `reset` mode a PIN may still exist in storage (the user only forgot
    // it). Turning the lock off must remove it too, or switching the lock back
    // on later would silently expect the PIN they could not remember.
    clearPin(uid);
    setLockChoice(uid, false);
    toast.success("App lock off — you can turn it on in Settings");
    onDone();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-semibold">
            {mode === "reset" ? "Choose a new PIN" : "Add a PIN to this device?"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "reset"
              ? "Your password checked out. Pick a new PIN, or carry on without one."
              : "A short PIN covers your figures when you step away from this device. Optional — you can turn it on later."}
          </p>
        </div>

        {/* Stage 4.8: a group with a real name, and each option reporting
            whether it is the one in effect. As plain buttons these read to a
            screen reader as two unrelated actions, with the current choice
            carried by colour alone. */}
        <div className="flex items-center justify-center gap-2" role="group" aria-labelledby="pin-len-label">
          <span id="pin-len-label" className="text-xs text-muted-foreground">
            Length
          </span>
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

        <div className="space-y-3">
          <div className="space-y-1.5">
            {/* Without htmlFor/id these inputs had no accessible name at all —
                the only thing a screen reader could read out was the bullet
                placeholder. */}
            <Label htmlFor="pin-new">New PIN</Label>
            <Input
              id="pin-new"
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={len}
              aria-describedby="pin-hint"
              value={pin}
              placeholder={"•".repeat(len)}
              onChange={(e) => setPinVal(clean(e.target.value))}
            />
            <p id="pin-hint" className="sr-only">
              {len} digits, numbers only.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin-confirm">Confirm PIN</Label>
            <Input
              id="pin-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={len}
              value={confirm}
              placeholder={"•".repeat(len)}
              onChange={(e) => setConfirm(clean(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy ? "Saving…" : mode === "reset" ? "Save new PIN" : "Turn on app lock"}
          </Button>
          <Button variant="ghost" className="w-full gap-1.5" onClick={decline} disabled={busy}>
            <ShieldOff className="w-3.5 h-3.5" />
            {mode === "reset" ? "Continue without a PIN" : "Not now"}
          </Button>
        </div>

        {/* What it is, and what it is not. A lock that people believe encrypts
            their data is worse than no lock, because they trust it further
            than it goes.

            The reuse sentence is not filler — it is the mitigation for
            BUG-091. Four to six digits is a small enough space that no amount
            of hashing makes it unguessable to someone who takes this device's
            storage away with them. What that costs the user depends entirely
            on whether the digits also open their phone and their bank card,
            and this is the only moment we can say so. */}
        <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/40 pt-4">
          The PIN is stored on this device only, as a slow one-way hash, on top of your sign-in. It
          hides the screen from someone using your unlocked device — it does not encrypt anything,
          and it cannot stop someone who has your password. <strong>Pick digits you do not use
          anywhere else</strong>: a short PIN is guessable by anyone who can take a copy of this
          device's storage, and the damage of that is much smaller if it is not also your phone or
          card PIN. If you forget it, unlock with your password and set a new one; nobody can look
          it up for you.
        </p>

        <button
          type="button"
          onClick={async () => { await signOut(); navigate("/auth", { replace: true }); }}
          className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out instead
        </button>
      </div>
    </div>
  );
}
